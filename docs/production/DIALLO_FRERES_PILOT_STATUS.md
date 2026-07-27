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

**Anomalie de connexions** : 714 événements `login` en 7 jours pour seulement 2 comptes utilisateurs (~102/jour, très au-dessus d'un usage humain normal). Distribution horaire : la quasi-totalité des heures montre une fréquence plausible (1-4 connexions/heure), **sauf un pic de 45 connexions en une seule heure** (2026-07-27, 04h00-05h00 UTC) — une connexion toutes les ~80 secondes en moyenne sur cette heure. Cause non déterminée avec certitude sans investigation plus poussée (accès aux logs Sentry/réseau, identification du compte concerné) :
- Explication possible bénigne : le client Supabase de ce projet est volontairement configuré avec `persistSession: false` (choix de sécurité pilote établi), donc toute réouverture d'app/perte de connectivité déclenche une réauthentification — plausible dans un contexte de connectivité intermittente en Guinée, mais le pic de 45/heure dépasse largement ce qu'une réouverture manuelle normale expliquerait.
- Explication possible problématique : boucle de reconnexion automatique (bug), consommation de données/batterie inutile pour l'utilisateur, ou tentatives de connexion échouées répétées.

**Recommandation** : investiguer ce pic spécifique (quel compte, succès ou échecs, contexte réseau) avant le lancement national — un bug de reconnexion en boucle, à l'échelle de centaines de magasins, aurait un impact réseau/batterie significatif.

## Risques

1. Anomalie de connexions ci-dessus — impact potentiel à grande échelle si c'est un bug plutôt qu'un pattern d'usage normal.
2. Usage encore très léger (4 ventes en 2 semaines, aucun fournisseur/dépense) — trop tôt pour valider la fiabilité du produit sous charge réelle soutenue.
3. Stock non réapprovisionné malgré des ruptures constatées — soit le magasin ne l'a pas encore fait, soit la fonctionnalité de réappro n'est pas assez visible/utilisée.

## Recommandations

- Investiguer le pic de connexions du 2026-07-27 avant toute annonce de disponibilité plus large.
- Encourager/accompagner le magasin pilote à utiliser les modules fournisseurs et dépenses (actuellement à 0 usage) pour valider ces parcours en conditions réelles avant de les vendre à d'autres commerçants.
- Pas de signal de perte de données, de corruption, ou de blocage fonctionnel — les ventes qui ont eu lieu se sont correctement enregistrées avec les bons montants et moyens de paiement.

## Décision : continuer

Aucun signal ne justifie une pause ou une correction urgente bloquante — les données réelles sont saines et cohérentes. L'anomalie de connexions mérite une investigation à courte échéance (pas bloquante pour la suite du travail engagé), et l'usage encore limité des modules fournisseurs/dépenses est à encourager sur le terrain plutôt qu'à corriger techniquement.
