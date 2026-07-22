# Audit de dérive de schéma Supabase — P1.2

**Date** : 2026-07-22
**Branche** : `production-ready/national-hardening-no-regression`
**Méthode** : comparaison automatisée (`scripts/check_rpc_signature_drift.py`) entre les fonctions `CREATE FUNCTION public.*` déclarées dans `supabase/migrations/*.sql` et l'inventaire réel du schéma live (`pg_proc`/`pg_namespace`, introspection en lecture seule via `supabase db query --linked`). Aucune donnée modifiée pour produire cet audit.

## Pourquoi cet audit

P0.3 avait déjà établi que `supabase migration list --linked` n'est pas un signal fiable sur ce projet (une partie de l'historique a été géré par SQL direct, hors `supabase db push`). P1.2 va plus loin : un inventaire complet, fonction par fonction, plutôt que la vérification ciblée des 7 migrations critiques déjà faite en P0.3.

## Piège rencontré pendant l'audit — à ne pas reproduire

La première comparaison utilisait `comm -13`/`comm -23` sur deux listes triées (`sort` GNU coreutils côté migrations, `sorted()` Python côté live). Résultat initial : 87 des 90 fonctions live semblaient "absentes de toute migration" — y compris `has_role`, `create_full_sale`, tous les `get_admin_*`, dont on savait par P0.3 qu'elles SONT bien définies en migration. `comm` s'est avéré donner un résultat incohérent dans cet environnement (Git Bash/Windows) malgré des fichiers correctement triés et des lignes identiques byte-à-byte (vérifié via `od -c`) — cause exacte non élucidée, mais `sort -c` ne signalait aucune erreur et `comm` non plus sur stderr, donc le problème passe silencieusement. **`scripts/check_rpc_signature_drift.py` n'utilise donc jamais `comm`** : comparaison par ensembles Python (`set - set`), fiable et vérifiée.

## Résultat de l'inventaire

- 129 fonctions `CREATE FUNCTION public.*` trouvées dans l'historique complet des migrations locales
- 90 fonctions réellement présentes sur le schéma live (`prokind = 'f'`, schéma `public`)

### Dérive directe réelle : 3 fonctions live non documentées (corrigée dans cette session)

`ensure_user_has_organization`, `select_plan`, `update_organization_subscription` — présentes en base, absentes de tout fichier de migration. Récupérées via `pg_get_functiondef` (lecture seule) et réaffirmées dans [`20260722100000_document_live_p1_2_drift_functions.sql`](../../supabase/migrations/20260722100000_document_live_p1_2_drift_functions.sql), suivant le même schéma que les migrations `document_live_*` de P0.3. Aucun comportement changé, aucune donnée modifiée.

**Risque fonctionnel** : vérifié absent. Recherche dans `src/` : aucune des 3 n'est appelée par le frontend actuel (seule `admin_update_organization_subscription` — nom distinct, préfixe `admin_` — est utilisée dans `Billing.tsx` et `OrganizationManagement.tsx`). Il s'agit vraisemblablement de vestiges d'un flux self-service antérieur (`select_plan` / `update_organization_subscription` appelés directement par l'utilisateur) remplacé depuis par le flux `admin_*` actuel, toujours actifs en base mais non routés côté client — dette de documentation, pas un bug actif.

### Fonctions en migration mais absentes du live : 42

Non appliquées en production. Regroupées par domaine fonctionnel — **aucune n'est un correctif de sécurité ou de bug connu** (vérifié : toutes relèvent de fonctionnalités produit non lancées, pas de hotfix en attente) :

| Domaine | Fonctions |
|---|---|
| Sauvegardes (`backups`) | `create_backup`, `delete_backup`, `restore_backup`, `get_backups`, `get_backup_details`, `get_backup_stats`, `generate_backup_number`, `validate_backup_columns`, `trg_backups_updated_at` |
| Support / tickets | `create_support_ticket`, `delete_support_ticket`, `add_ticket_message`, `get_ticket_messages`, `get_support_tickets`, `get_support_stats`, `update_ticket_status`, `generate_ticket_number`, `trg_support_tickets_updated_at` |
| Fidélité (`loyalty`) | `earn_loyalty_points`, `redeem_loyalty_points`, `update_loyalty_tier`, `get_loyalty_stats` |
| Transferts de stock inter-magasins | `create_stock_transfer`, `send_stock_transfer`, `receive_stock_transfer`, `cancel_stock_transfer`, `get_stock_transfers`, `get_stock_transfer_details`, `get_pending_transfers_count`, `generate_transfer_number`, `update_stock_transfers_updated_at` |
| Métriques SaaS plateforme | `get_saas_overview`, `get_saas_churn_metrics`, `get_saas_revenue_metrics` |
| Réapprovisionnement fournisseur | `get_restock_suggestions`, `create_purchase_order_from_suggestions`, `get_supplier_order_history`, `set_supplier_organization_id` |
| Onboarding | `complete_onboarding`, `get_onboarding_status` |
| Cycle de vie abonnement | `process_subscription_lifecycle` |
| Auth bootstrap | `auth_bootstrap_status` |

**Interprétation** : ce sont des fonctionnalités développées (migrations écrites, testées en local ou en dev) mais jamais poussées en production — probablement en attente d'un déploiement ou de la fin d'un chantier plus large (ex: transferts de stock inter-magasins, sauvegardes admin, support client intégré). Aucune action requise avant déploiement national tant que le frontend ne référence pas ces routes/fonctions pour les utilisateurs finaux — à vérifier au cas par cas si l'une de ces fonctionnalités doit être activée pour le lancement national.

## Script de détection réutilisable

[`scripts/check_rpc_signature_drift.py`](../../scripts/check_rpc_signature_drift.py) — statique par défaut (liste l'inventaire des migrations), accepte `--live-json` pour comparer contre un export du schéma live produit manuellement (aucun credential embarqué dans le script, cohérent avec `validate_sql_migrations.py`) :

```bash
npx supabase db query --linked \
  "SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace \
   WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY p.proname;" \
  > live_functions.json

python3 scripts/check_rpc_signature_drift.py --live-json live_functions.json
```

Exit code 1 si une dérive directe non documentée est détectée (fonction live sans migration correspondante) — utilisable comme gate CI optionnel, non branché dans `release-readiness.yml` pour l'instant (nécessiterait des credentials Supabase en CI pour la partie live, hors périmètre de cette session).

## Conclusion P1.2

Dérive directe réelle très limitée (3 fonctions, aucun risque fonctionnel actif, corrigée). La perception initiale d'une dérive massive (87 fonctions) était un artefact d'outillage (`comm`), pas un vrai problème — leçon retenue et documentée pour éviter de la reproduire. Le vrai chantier restant est le tri des 42 fonctions non déployées (P2/P3 pourraient en dépendre selon les fonctionnalités testées), hors périmètre strict de P1.2.
