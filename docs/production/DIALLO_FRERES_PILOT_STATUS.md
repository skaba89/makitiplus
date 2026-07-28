# Diallo & Frères — État Pilote

## Date
2026-07-27

## Méthode

Vérification en **lecture seule exclusivement** — requêtes SQL `SELECT` en lecture directe sur la base de production (organisation `4b03e340-f633-472e-b5fc-c381fb4eac58`, créée le 2026-07-12), sans connexion à l'interface, sans aucune donnée modifiée, conformément à RULE 1 (consultation/vérification autorisées, aucune écriture). Alternative à une navigation UI en direct, que je ne peux pas faire (je ne me connecte jamais comme un utilisateur réel).

## Données vérifiées

| Domaine | Constat |
|---|---|
| Magasins (`stores`) | 0 ligne — l'organisation fonctionne en mode mono-magasin implicite (pas d'entrée dédiée dans la table `stores`) |
| Utilisateurs (`profiles`) | 2 comptes |
| Produits | 35 références au catalogue, dont **2 en rupture de stock** (`stock_quantity <= 0`) |
| Ventes | **4 ventes au total** depuis la création (12/07) — voir détail ci-dessous |
| Clients | 2 clients enregistrés, aucun avec un solde crédit en cours |
| Fournisseurs | 0 |
| Commandes fournisseurs | 0 |
| Dépenses (30j) | 0 |
| Mouvements de stock (30j) | 0 |
| Conflits de synchronisation | 0 |
| Journal d'activité (7j) | **714 entrées, toutes de type `login`** — voir "Bugs observés" |

### Détail des 4 ventes réelles

| N° | Date | Montant | Paiement |
|---|---|---|---|
| VTE-2026-000001 | 2026-07-18 | 4 479 000 GNF | cash |
| VTE-2026-000002 | 2026-07-22 | 4 962 000 GNF | orange_money |
| VTE-2026-000003 | 2026-07-23 | 2 488 500 GNF | orange_money |
| VTE-2026-000004 | 2026-07-23 | 4 862 000 GNF | orange_money |

Aucune vente depuis le 23/07 (4 jours au moment de la rédaction). Montants unitaires élevés (~530-580 $US équivalent chacun) — cohérent avec un commerce vendant des articles de valeur plutôt que du détail à faible marge unitaire.

## Fonctionnalités utilisées

- **POS / ventes** : utilisé, réellement (4 ventes, montants cohérents, mix cash + mobile money).
- **Mobile Money** : 3 des 4 ventes réglées via Orange Money — confirme que le mode mobile money est activement utilisé sur le terrain, pertinent pour la priorité P1.4 du plan.
- **Produits/stock** : catalogue actif (35 produits), mais **aucun mouvement de stock enregistré depuis 30 jours** malgré 2 produits en rupture — suggère que le réapprovisionnement n'est pas (encore) suivi dans l'app.
- **Clients** : usage minimal (2 clients), aucun crédit client actif.
- **Fournisseurs / commandes fournisseurs / dépenses** : **non utilisés du tout** (0 ligne partout).
- **Clôture de caisse / rapports / KPI** : non vérifiables sans requête dédiée aux tables spécifiques de clôture — non auditées dans cette passe (à faire si nécessaire, hors du périmètre minimal de cette vérification).

## Bugs observés

**Anomalie de connexions — RÉSOLUE (investigation du 2026-07-28)** : 714 événements `login` en 7 jours pour 2 comptes utilisateurs, avec des rafales répétées (jusqu'à 38 connexions/minute) survenant presque tous les jours, à des heures très variées.

**Cause confirmée : ce n'est pas un bug client, ni un incident de sécurité.** C'est le suite de tests E2E pilote (`e2e/staging-real-flow.spec.ts` — 12 cas de test, `e2e/pilot-critical.spec.ts` — 7 cas, `e2e/post-deployment-audit.spec.ts` — 11 cas) qui se connecte au compte réel Diallo & Frères pour ses vérifications en lecture seule, une fois par cas de test (`login()` appelé au début de chaque `test()`), exécuté sur **2 projets Playwright** (`chromium` = préréglage "Desktop Chrome", UA Windows codé en dur ; `mobile-chrome` = préréglage "Pixel 5", UA Android codé en dur) — d'où les deux user-agents observés (Windows/Chrome desktop + Android/Pixel 5), qui ne correspondent pas à deux appareils réels mais à deux profils Playwright émulés par le même run CI. Preuve : le pic du 2026-07-27 20h02-20h03 UTC coïncide exactement avec la complétion des jobs "E2E Pilot"/"E2E Staging" (bloquants) de la Release Readiness du PR #44 (20:03:47-20:03:52 UTC) ; le motif se répète à chaque exécution CI de la semaine (le pipeline a tourné très fréquemment durant ce sprint), ce qui explique le volume et la récurrence quasi quotidienne à des heures variées.

Aucun signal de bug de reconnexion, aucune fuite de credentials, aucune activité suspecte d'un tiers.

**Point d'hygiène (non bloquant, à améliorer)** : ces specs appellent `login()` à chaque `test()` plutôt que de partager une session authentifiée par fichier/projet (ex. via `storageState` de Playwright). Résultat : jusqu'à ~24 connexions réelles au compte Diallo par run CI, ce qui gonfle inutilement le journal d'activité du magasin pilote et pourrait, à terme, se heurter à un rate-limit d'authentification Supabase si la fréquence de CI augmente encore. Amélioration suggérée (non urgente) : réutiliser un `storageState` authentifié une fois par fichier de test plutôt que de se reconnecter à chaque cas.

## Risques

1. ~~Anomalie de connexions~~ — **résolue** (2026-07-28) : confirmée comme un artefact des tests E2E pilote CI, pas un bug client. Reste un point d'hygiène mineur (réduire le nombre de logins CI par run — voir ci-dessus).
2. Usage encore très léger (4 ventes en 2 semaines, aucun fournisseur/dépense) — trop tôt pour valider la fiabilité du produit sous charge réelle soutenue.
3. Stock non réapprovisionné malgré des ruptures constatées — soit le magasin ne l'a pas encore fait, soit la fonctionnalité de réappro n'est pas assez visible/utilisée.

## Recommandations

- ~~Investiguer le pic de connexions~~ — fait, voir "Bugs observés" ci-dessus. Amélioration optionnelle restante : `storageState` Playwright pour réduire les logins CI réels sur le compte pilote.
- Encourager/accompagner le magasin pilote à utiliser les modules fournisseurs et dépenses (actuellement à 0 usage) pour valider ces parcours en conditions réelles avant de les vendre à d'autres commerçants.
- Pas de signal de perte de données, de corruption, ou de blocage fonctionnel — les ventes qui ont eu lieu se sont correctement enregistrées avec les bons montants et moyens de paiement.

## Décision : continuer

Aucun signal ne justifie une pause ou une correction urgente bloquante — les données réelles sont saines et cohérentes. L'anomalie de connexions, seul point encore ouvert au moment de la rédaction initiale, est désormais résolue (artefact CI inoffensif, pas un bug). L'usage encore limité des modules fournisseurs/dépenses est à encourager sur le terrain plutôt qu'à corriger techniquement.
