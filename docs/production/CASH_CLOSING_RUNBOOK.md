# MakitiPlus — Runbook Clôture de Caisse

## Contexte

Depuis le 2026-07-27, la clôture de caisse fonctionne par **session** (ouverture → clôture → approbation), portée par la table `cash_register_sessions` et 6 RPC serveur (`open_cash_register_session`, `get_cash_closing_summary`, `close_cash_register_session`, `approve_cash_register_session`, `reject_cash_register_session`, `get_cash_register_sessions`). Tous les calculs financiers sont faits côté serveur — le client ne fait qu'afficher ce que les RPC renvoient.

Depuis le durcissement final (2026-07-28) : chaque session est explicitement liée au **magasin courant** en multi-magasin (les dépenses d'un autre magasin ne sont plus jamais comptées dans une caisse), les erreurs des 5 RPC critiques ne sont plus jamais masquées en "aucune donnée", et une clôture avec des ventes hors-ligne non synchronisées exige une confirmation explicite.

## Cycle de vie d'une session

```
open (vendeur/manager/admin ouvre — lié au magasin courant en multi-magasin)
  → closing_pending (non utilisé actuellement, réservé pour usage futur)
  → closed (le titulaire ou un manager/admin clôture, saisit le montant réel)
    → approved (manager/admin approuve)
    → rejected (manager/admin rejette, raison obligatoire)
```

Une seule session `open`/`closing_pending` par (organisation, magasin, vendeur) à la fois — imposé par une contrainte UNIQUE en base, pas seulement par l'UI.

## Ouvrir une caisse

1. Se connecter avec un compte `vendeur`, `manager` ou `admin`.
2. Aller sur **Clôture caisse**.
3. En organisation multi-magasin, vérifier que le bon **magasin** est affiché en haut de la carte "Ouvrir ma caisse" (sélectionné via le sélecteur de magasin de l'application). Si aucun magasin n'est actif, le bouton "Ouvrir la caisse" reste désactivé avec le message "Sélectionnez un magasin avant d'ouvrir la caisse."
4. Saisir le **fond de caisse initial** (montant réellement présent en espèces au démarrage) et cliquer **Ouvrir la caisse**.
5. Si une session est déjà ouverte pour ce compte, ce bouton n'apparaît pas — le RPC bloque toute seconde ouverture.

Note magasin unique : une organisation sans magasins définis (mode mono-magasin implicite, ex. le pilote Diallo & Frères) n'affiche pas ce sélecteur et n'est jamais bloquée — le comportement historique est préservé.

## Faire des ventes

Aucune action spécifique — les ventes réalisées via le POS pendant que la session est ouverte sont automatiquement comptabilisées dans le résumé de la session (filtrées par date d'ouverture de la session, pas par jour calendaire).

## Clôturer la caisse

1. Retourner sur **Clôture caisse** — le résumé de la session s'affiche (ventes par moyen de paiement, dépenses, caisse attendue).
2. **Si un bandeau rouge "ventes hors-ligne non synchronisées" apparaît**, synchroniser d'abord (voir incident dédié ci-dessous) — sinon cocher explicitement "Je confirme vouloir clôturer malgré les ventes non synchronisées" pour débloquer le bouton.
3. Compter physiquement les espèces en caisse.
4. Saisir le **montant réel** — l'écart s'affiche automatiquement en temps réel avant confirmation.
5. Cliquer **Clôturer la caisse**.
6. La session passe au statut "En attente d'approbation" (sauf si l'organisation n'a pas de rôle manager/admin distinct du vendeur — dans ce cas, un admin/manager doit tout de même approuver).

## Expliquer un écart

L'écart (`caisse réelle − caisse attendue`) peut avoir plusieurs causes légitimes :
- Erreur de rendu de monnaie
- Vente non enregistrée dans le POS (à corriger : toujours passer par le POS, jamais de vente "de mémoire")
- Dépense en espèces non enregistrée dans le module Dépenses
- Erreur de comptage

**Procédure** : noter la cause probable dans le champ "Notes" avant de clôturer. Le manager/admin voit cette note lors de l'approbation.

## Approuver ou rejeter une clôture (manager/admin)

1. Sur **Clôture caisse**, la carte "Clôtures en attente d'approbation" liste les sessions clôturées par l'équipe, avec le nom du vendeur et le magasin concerné.
2. Vérifier l'écart et les notes du vendeur.
3. **Si l'écart n'est pas nul**, une note manager est **obligatoire** avant de pouvoir approuver — expliquer la cause probable (rendu de monnaie, dépense non enregistrée, etc.).
4. Cliquer **Approuver** pour valider définitivement la clôture, ou **Rejeter** en cas de désaccord (une raison de rejet est toujours obligatoire, écart nul ou pas). Une session rejetée passe au statut `rejected` — traiter la correction hors application avec le vendeur concerné (pas de flux de recorrection automatisé actuellement).

## Exporter un rapport

- **Impression** : bouton "Imprimer" sur une session clôturée — génère un rapport imprimable (nom boutique, dates, détail par moyen de paiement, écart, notes). Pour un export PDF, utiliser "Enregistrer en PDF" dans la boîte de dialogue d'impression du navigateur — aucun générateur PDF dédié n'a été ajouté (pas de nouvelle dépendance pour un besoin déjà couvert par le navigateur).
- **Export CSV** : bouton "Exporter CSV" dans la carte Historique — exporte les sessions actuellement filtrées (voir filtres ci-dessous), avec le nom du vendeur et du magasin en colonnes.
- **WhatsApp** : bouton "WhatsApp" sur une session clôturée en attente — envoie un résumé texte au numéro saisi.
- **Filtres de l'historique** : date de début/fin, statut, vendeur (manager/admin/comptable/super_admin uniquement) et magasin (organisations multi-magasin) — combinables, appliqués aussi bien à l'affichage qu'à l'export CSV.

## Incidents courants

### Vente offline non synchronisée au moment de la clôture

Si un vendeur clôture sa caisse alors que des ventes faites hors ligne (IndexedDB) n'ont pas encore été synchronisées avec le serveur, ces ventes **n'apparaîtront pas** dans le résumé de clôture (les RPC lisent la table `sales` côté serveur, pas la file offline locale). **Procédure** : vérifier que l'indicateur de synchronisation offline est à zéro (aucune vente en attente) avant de clôturer. Si une vente apparaît après coup, la session est déjà clôturée/approuvée — elle ne recalcule pas automatiquement ; contacter le support pour un ajustement manuel documenté (jamais de modification directe de `sales`/`expenses` liée à cet incident).

### Caisse bloquée — impossible d'ouvrir une nouvelle session

Message "Une session de caisse est déjà ouverte" alors que l'utilisateur pense l'avoir clôturée : vérifier dans **Historique** qu'une session au statut "Ouverte" n'existe pas déjà pour ce compte. Si oui, la clôturer normalement avant d'en ouvrir une nouvelle — il n'y a pas de bouton "forcer l'ouverture" ou "annuler une session ouverte" par design (éviter la perte de traçabilité).

### Erreur de montant saisi après clôture

Une session `closed` ne peut plus être modifiée par le vendeur (le RPC refuse toute reclôture). Si le montant réel saisi était une erreur de frappe, seul un manager/admin peut agir : soit approuver malgré l'écart en documentant la correction dans `manager_notes`, soit **rejeter la clôture** (raison obligatoire) pour signaler explicitement le problème au vendeur, soit — si une vraie correction du montant est nécessaire — contacter le support (aucune action UI pour modifier une session déjà clôturée, par design, pour préserver l'intégrité de l'audit).

### Mauvais magasin sélectionné à l'ouverture

Si un vendeur a ouvert sa caisse alors que le mauvais magasin était actif (organisation multi-magasin), la session est liée à ce magasin dès la création — il n'y a pas de correction a posteriori du magasin d'une session existante. **Procédure** : le vendeur doit clôturer normalement la session mal rattachée (en documentant l'erreur dans les notes), puis sélectionner le bon magasin via le sélecteur de magasin de l'application avant d'en ouvrir une nouvelle. Le manager/admin peut vérifier après coup dans l'historique, filtré par magasin, que les sessions sont correctement réparties.

### Écart de caisse récurrent sur un magasin précis (multi-magasin)

Depuis le durcissement du 2026-07-28, les dépenses d'un autre magasin de la même organisation ne sont plus jamais comptées dans le calcul de la caisse attendue d'un magasin donné. Si un écart anormal et récurrent persiste malgré cette correction, vérifier que les dépenses de ce magasin sont bien saisies avec le bon `store_id` (module Dépenses) plutôt que de suspecter un bug de calcul.

## Règle Diallo & Frères

Diallo & Frères est un magasin pilote réel avec des données réelles. Pour toute intervention support/debug sur ce module touchant leur compte : lecture, consultation, vérification de KPI/rapports/clôtures et export en lecture seule uniquement. Jamais de suppression de session, de reset, de vente factice de test, ou de clôture/approbation/rejet automatisée sans validation explicite du magasin. Tous les tests E2E automatisés du module (`e2e/cash-closing.spec.ts`) utilisent exclusivement des comptes `E2E_ADMIN`/`E2E_MANAGER`/`E2E_VENDOR` d'une organisation de test dédiée — jamais Diallo & Frères (voir `docs/production/DIALLO_FRERES_PILOT_STATUS.md`).

## Rollback / désactivation d'urgence

Si un bug critique est découvert sur ce module en production :

1. **Ne pas** supprimer ou modifier la table `cash_register_sessions` (elle ne touche jamais `sales`/`expenses`, donc son dysfonctionnement n'affecte pas les ventes réelles).
2. Revenir à la version précédente de `src/pages/CashClosing.tsx` via `git revert` du commit de réécriture — la route/le menu restent fonctionnels, seule l'UI change.
3. Les RPC restent déployées (additives, sans impact si non appelées) — pas besoin de les retirer pour un rollback frontend.
4. Voir `docs/production/NATIONAL_DEPLOYMENT_RUNBOOK.md` §5 pour la procédure de rollback générale (Render/Supabase).

## Contacts

Voir `docs/production/NATIONAL_DEPLOYMENT_RUNBOOK.md` §10 (contacts d'escalade généraux du projet).
