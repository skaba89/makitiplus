# MakitiPlus — Plan de Rollback

**But** : référence rapide, autonome, à suivre pendant un incident sans avoir
besoin d'ouvrir le runbook complet de déploiement. Détail exhaustif dans
[`NATIONAL_DEPLOYMENT_RUNBOOK.md`](./NATIONAL_DEPLOYMENT_RUNBOOK.md) §5-6.

> Un rollback doit toujours rester possible. Si un rollback échoue,
> escalader immédiatement en P0 (voir [`SUPPORT_RUNBOOK.md`](./SUPPORT_RUNBOOK.md)).

## Décision : quel rollback choisir ?

```
Le problème vient-il d'un déploiement frontend récent (Render) ?
├─ OUI → Rollback frontend (§1) — < 5 min, AUCUNE perte de données
└─ NON, une migration SQL a corrompu des données/le schéma
   └─ Rollback SQL (§2) — 10-30 min, PERTE de données entre backup et restore
      → toujours tenter §1 (revert du code applicatif) en premier si possible

Le problème vient d'une feature spécifique, le reste fonctionne ?
└─ Rollback partiel (§3) — le plus rapide, le moins invasif, à privilégier
```

## 1. Rollback frontend (Render) — rapide, sans perte de données

1. Render Dashboard → service `makitiplus` → onglet `Deploys`.
2. Identifier le dernier déploiement stable (statut `Live`, antérieur à
   l'incident, commit connu bon).
3. Cliquer `Roll back to this deploy` → confirmer.
4. Attendre le statut `Live` (2-5 min).
5. Vérifier manuellement : login, POS, création d'une vente test (organisation
   de test uniquement, **jamais** sur Diallo & Frères).
6. Vérifier Sentry : le flux d'erreurs doit s'arrêter.
7. Documenter le rollback dans le ticket incident (`docs/production/incidents/YYYY-MM-DD-PXX.md`).
8. Ouvrir un ticket séparé pour analyser la cause racine et planifier un
   nouveau déploiement corrigé — le rollback n'est jamais la solution finale.

## 2. Rollback SQL (Supabase) — dernier recours, perte de données

> **ATTENTION** : entraîne la perte de toutes les données créées entre le
> backup et l'instant du restore (ventes, stocks, nouveaux utilisateurs).
> À utiliser uniquement si une migration a corrompu des données ou rendu la
> base inutilisable, et qu'aucune alternative (§1, §3) ne suffit.

1. Supabase Dashboard → `Database` → `Backups`.
2. Sélectionner le backup pré-migration (`pre-migration-YYYY-MM-DD-HHMM`).
3. `Restore` → confirmer.
4. Prévenir immédiatement les utilisateurs concernés (perte de données à
   venir) avant de lancer le restore si le délai le permet.
5. Après restauration, exécuter `ZZ_validate_migration_status.sql` pour
   confirmer l'état du schéma.
6. Re-exécuter les migrations qui étaient en cours si nécessaire, avec un
   nouveau backup préalable.
7. Documenter précisément la fenêtre de données perdue dans le ticket
   incident (utile pour la communication client et la reconstruction
   manuelle si possible, ex. à partir de reçus papier côté magasin).

**Estimation** : 10-30 min selon la taille de la base.

## 3. Rollback partiel (désactiver une feature) — à privilégier si possible

Par ordre de préférence :

1. **Feature flag** (si disponible pour la feature concernée) : désactiver
   via variable d'environnement Render, redéployer.
2. **Revert du commit** applicatif + nouveau déploiement Render (§1).
3. **Désactivation côté DB** ciblée (colonne/RPC problématique) — dernier
   recours, cas par cas, toujours avec un backup préalable si la commande
   touche des données existantes.

## Sauvegardes — rappel rapide

- **Automatiques** : quotidiennes (plan Supabase Pro requis en production
  nationale), rétention 7 jours, PITR à la minute près.
- **Manuelles avant chaque migration** : Dashboard → Backups →
  `Create backup`, nommer `pre-migration-YYYY-MM-DD-HHMM`, attendre le
  statut `Completed` avant de lancer la migration.
- **Test de restauration mensuel recommandé** (staging, premier lundi du
  mois) — documenter le temps réel de restauration.

## Après tout rollback

- [ ] Sentry confirme l'arrêt du flux d'erreurs.
- [ ] Vérification manuelle des parcours critiques (login, POS, clôture de
      caisse) sur un compte de test — jamais sur Diallo & Frères en écriture.
- [ ] Ticket incident mis à jour avec l'heure exacte du rollback et son
      issue.
- [ ] Post-mortem programmé sous 72h (voir §8.2 du runbook national) si
      l'incident était P0/P1.
- [ ] Communication aux utilisateurs affectés si le rollback a entraîné une
      perte de fonctionnalité ou de données.

## Voir aussi

- [`NATIONAL_DEPLOYMENT_RUNBOOK.md`](./NATIONAL_DEPLOYMENT_RUNBOOK.md) — procédure complète, checklist pré-déploiement, monitoring.
- [`SUPPORT_RUNBOOK.md`](./SUPPORT_RUNBOOK.md) — escalade et sévérités d'incident.
- [`DAILY_PILOT_MONITORING_CHECKLIST.md`](./DAILY_PILOT_MONITORING_CHECKLIST.md) — détection précoce avant qu'un rollback soit nécessaire.
