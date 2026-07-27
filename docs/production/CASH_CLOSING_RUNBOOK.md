# MakitiPlus — Runbook Clôture de Caisse

## Contexte

Depuis le 2026-07-27, la clôture de caisse fonctionne par **session** (ouverture → clôture → approbation), portée par la table `cash_register_sessions` et 5 RPC serveur (`open_cash_register_session`, `get_cash_closing_summary`, `close_cash_register_session`, `approve_cash_register_session`, `get_cash_register_sessions`). Tous les calculs financiers sont faits côté serveur — le client ne fait qu'afficher ce que les RPC renvoient.

## Cycle de vie d'une session

```
open (vendeur/manager/admin ouvre)
  → closing_pending (non utilisé actuellement, réservé pour usage futur)
  → closed (le titulaire ou un manager/admin clôture, saisit le montant réel)
    → approved (manager/admin approuve)
    → rejected (réservé pour usage futur — pas encore d'action UI dédiée)
```

Une seule session `open`/`closing_pending` par (organisation, magasin, vendeur) à la fois — imposé par une contrainte UNIQUE en base, pas seulement par l'UI.

## Ouvrir une caisse

1. Se connecter avec un compte `vendeur`, `manager` ou `admin`.
2. Aller sur **Clôture caisse**.
3. Si aucune session n'est ouverte, saisir le **fond de caisse initial** (montant réellement présent en espèces au démarrage) et cliquer **Ouvrir la caisse**.
4. Si une session est déjà ouverte pour ce compte, ce bouton n'apparaît pas — le RPC bloque toute seconde ouverture.

## Faire des ventes

Aucune action spécifique — les ventes réalisées via le POS pendant que la session est ouverte sont automatiquement comptabilisées dans le résumé de la session (filtrées par date d'ouverture de la session, pas par jour calendaire).

## Clôturer la caisse

1. Retourner sur **Clôture caisse** — le résumé de la session s'affiche (ventes par moyen de paiement, dépenses, caisse attendue).
2. Compter physiquement les espèces en caisse.
3. Saisir le **montant réel** — l'écart s'affiche automatiquement en temps réel avant confirmation.
4. Cliquer **Clôturer la caisse**.
5. La session passe au statut "En attente d'approbation" (sauf si l'organisation n'a pas de rôle manager/admin distinct du vendeur — dans ce cas, un admin/manager doit tout de même approuver).

## Expliquer un écart

L'écart (`caisse réelle − caisse attendue`) peut avoir plusieurs causes légitimes :
- Erreur de rendu de monnaie
- Vente non enregistrée dans le POS (à corriger : toujours passer par le POS, jamais de vente "de mémoire")
- Dépense en espèces non enregistrée dans le module Dépenses
- Erreur de comptage

**Procédure** : noter la cause probable dans le champ "Notes" avant de clôturer. Le manager/admin voit cette note lors de l'approbation.

## Approuver une clôture (manager/admin)

1. Sur **Clôture caisse**, la carte "Clôtures en attente d'approbation" liste les sessions clôturées par l'équipe.
2. Vérifier l'écart et les notes.
3. Cliquer **Approuver**.

Il n'existe pas encore de bouton "Rejeter" dans l'UI (le statut `rejected` existe en base pour un usage futur) — en cas de désaccord sur un écart, traiter hors application (contact direct avec le vendeur) pour l'instant.

## Exporter un rapport

- **Impression** : bouton "Imprimer" sur une session clôturée — génère un rapport imprimable (nom boutique, dates, détail par moyen de paiement, écart, notes).
- **Export CSV** : bouton "Exporter CSV" dans la carte Historique — exporte toutes les sessions visibles (scopées par rôle) en CSV.
- **WhatsApp** : bouton "WhatsApp" sur une session clôturée en attente — envoie un résumé texte au numéro saisi.

## Incidents courants

### Vente offline non synchronisée au moment de la clôture

Si un vendeur clôture sa caisse alors que des ventes faites hors ligne (IndexedDB) n'ont pas encore été synchronisées avec le serveur, ces ventes **n'apparaîtront pas** dans le résumé de clôture (les RPC lisent la table `sales` côté serveur, pas la file offline locale). **Procédure** : vérifier que l'indicateur de synchronisation offline est à zéro (aucune vente en attente) avant de clôturer. Si une vente apparaît après coup, la session est déjà clôturée/approuvée — elle ne recalcule pas automatiquement ; contacter le support pour un ajustement manuel documenté (jamais de modification directe de `sales`/`expenses` liée à cet incident).

### Caisse bloquée — impossible d'ouvrir une nouvelle session

Message "Une session de caisse est déjà ouverte" alors que l'utilisateur pense l'avoir clôturée : vérifier dans **Historique** qu'une session au statut "Ouverte" n'existe pas déjà pour ce compte. Si oui, la clôturer normalement avant d'en ouvrir une nouvelle — il n'y a pas de bouton "forcer l'ouverture" ou "annuler une session ouverte" par design (éviter la perte de traçabilité).

### Erreur de montant saisi après clôture

Une session `closed` ne peut plus être modifiée par le vendeur (le RPC refuse toute reclôture). Si le montant réel saisi était une erreur de frappe, seul un manager/admin peut agir : soit approuver malgré l'écart en documentant la correction dans `manager_notes`, soit — si une vraie correction du montant est nécessaire — contacter le support (aucune action UI pour modifier une session déjà clôturée, par design, pour préserver l'intégrité de l'audit).

## Rollback / désactivation d'urgence

Si un bug critique est découvert sur ce module en production :

1. **Ne pas** supprimer ou modifier la table `cash_register_sessions` (elle ne touche jamais `sales`/`expenses`, donc son dysfonctionnement n'affecte pas les ventes réelles).
2. Revenir à la version précédente de `src/pages/CashClosing.tsx` via `git revert` du commit de réécriture — la route/le menu restent fonctionnels, seule l'UI change.
3. Les RPC restent déployées (additives, sans impact si non appelées) — pas besoin de les retirer pour un rollback frontend.
4. Voir `docs/production/NATIONAL_DEPLOYMENT_RUNBOOK.md` §5 pour la procédure de rollback générale (Render/Supabase).

## Contacts

Voir `docs/production/NATIONAL_DEPLOYMENT_RUNBOOK.md` §10 (contacts d'escalade généraux du projet).
