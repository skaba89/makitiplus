-- ============================================================
-- Réparation de l'historique des migrations Supabase CLI
-- ============================================================
--
-- Problème :
--   supabase db push échoue avec "relation customers already exists"
--   car le CLI pense que la DB est vide (aucune migration enregistrée
--   dans supabase_migrations.schema_migrations) alors que toutes les
--   tables existent déjà (appliquées via Dashboard SQL Editor).
--
-- Solution :
--   Marquer toutes les migrations déjà appliquées (y compris P1/P2/P3)
--   dans supabase_migrations.schema_migrations pour que le CLI ne
--   tente plus de les rejouer.
--
-- ⚠️ À EXÉCUTER UNE SEULE FOIS, après avoir appliqué manuellement
--    les migrations P1/P2/P3 via docs/audit/deployment/apply_p1_p2_p3_combined.sql
--
-- Procédure :
--   1. Appliquer apply_p1_p2_p3_combined.sql via SQL Editor
--   2. Exécuter ce script via SQL Editor
--   3. Vérifier : supabase migration list (depuis le CLI)
--      → toutes les migrations doivent afficher "Applied"
--
-- ⚠️ Si tu as des doutes sur l'état réel de la DB, ne lance pas
--    ce script — il pourrait masquer des migrations non appliquées.
--    Vérifie d'abord avec :
--      SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;
-- ============================================================

-- Créer le schéma et la table si nécessaire (Supabase CLI les gère normalement)
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version TEXT PRIMARY KEY,
  statements TEXT[],
  name TEXT
);

-- Insérer toutes les migrations existantes (78 fichiers au 8 juillet 2026)
-- Chaque entrée marque la migration comme "appliquée" sans rejouer le SQL.
-- statements est laissé vide [] car le SQL a déjà été exécuté hors CLI.

INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES
  -- Migrations historiques (avant audit)
  ('20260202072852', '[]', '917790af-3d14-44e9-bcdd-d88776ced82b'),
  ('20260207065000', '[]', 'da463d93-5048-43ec-bb39-482bb0ea3ab9'),
  ('20260423040958', '[]', '42cc2233-086f-4864-a7d3-64cb40a81ed5'),
  ('20260423042235', '[]', '125de771-f1c8-4b67-90db-2b6d811096ca'),
  ('20260424042936', '[]', 'db7e40cf-c001-4513-9126-a0596e12f542'),
  ('20260424042947', '[]', 'b1941d89-89c0-4cb2-bdbc-6aaebc400cbb'),
  ('20260424045251', '[]', '3195f18f-7faa-4f1f-9d47-323cb8b7fac7'),
  ('20260425041530', '[]', 'c56455ad-2249-438f-b9a2-15f7f64df5e5'),
  ('20260426042420', '[]', 'f2188ae3-aeea-4b23-9b02-04b4b9938345'),
  ('20260426042625', '[]', 'fac2f592-7105-47f9-b6d5-63e8c4135346'),
  ('20260427045819', '[]', '7d242cc0-26f4-4887-a0d5-d687cb78cdba'),
  ('20260612031944', '[]', 'ff09240b-7ecb-49e5-b88b-e9800618663b'),
  ('20260612031957', '[]', 'f26f99b1-d459-4100-876b-f11b8ebf4985'),
  ('20260612032011', '[]', 'a2f1b765-7ea2-46da-be0c-40a9e3e7f831'),
  ('20260614010000', '[]', 'batch_update_stock_rpc'),
  ('20260614020000', '[]', 'add_missing_foreign_keys'),
  ('20260614030000', '[]', 'tighten_rls_policies'),
  ('20260614040000', '[]', 'grant_admin_exists_to_anon'),
  ('20260629010000', '[]', 'add_super_admin_role'),
  ('20260629010001', '[]', 'store_settings_and_default_categories'),
  ('20260629020000', '[]', 'add_store_category'),
  ('20260701010000', '[]', 'fix_rls_self_escalation_and_super_admin'),
  ('20260701010001', '[]', 'phase1_security_and_rpc'),
  ('20260701020000', '[]', 'critical_audit_fixes'),
  ('20260701030000', '[]', 'high_audit_fixes'),
  ('20260701040000', '[]', 'add_nfc_enabled_to_profiles'),
  ('20260701050000', '[]', 'fix_create_full_sale_race_condition'),
  ('20260702010000', '[]', 'add_missing_indexes'),
  ('20260702010001', '[]', 'add_suppliers_table'),
  ('20260702020000', '[]', 'race_condition_fixes'),
  ('20260702030000', '[]', 'dashboard_rpc_aggregation'),
  ('20260702040000', '[]', 'data_correctness_and_performance'),
  ('20260702050000', '[]', 'org_scoping_and_shared_hooks'),
  ('20260702060000', '[]', 'add_suppliers_and_supplier_products'),
  ('20260702070000', '[]', 'admin_multi_store_analytics'),
  ('20260702080000', '[]', 'security_hardening_rpc'),
  ('20260702090000', '[]', 'p0_security_remove_client_identity_params'),
  ('20260702100000', '[]', 'fix_register_user_first_admin'),
  ('20260702110000', '[]', 'saas_foundation_plans_subscriptions'),
  ('20260702120000', '[]', 'multi_store_support'),
  ('20260702130000', '[]', 'fix_subscription_events_and_lifecycle'),
  ('20260702130001', '[]', 'purchase_orders'),
  ('20260702140000', '[]', 'saas_metrics_rpcs'),
  ('20260702150000', '[]', 'onboarding_premium'),
  ('20260702160000', '[]', 'stock_transfers'),
  ('20260702170000', '[]', 'smart_restock_suggestions'),
  ('20260702180000', '[]', 'loyalty_program'),
  ('20260702190000', '[]', 'backup_restore'),
  ('20260702200000', '[]', 'support_tickets'),
  ('20260703010000', '[]', 'p0_hotfix_migrations'),
  ('20260703020000', '[]', 'p1_server_side_plan_enforcement'),
  ('20260703030000', '[]', 'p1_grant_execute_fixes'),
  ('20260703040000', '[]', 'p1_sale_limit_grant_stripe_idempotency'),
  ('20260703050000', '[]', 'stripe_integration'),
  ('20260704010000', '[]', 'fix_missing_rpcs_v5'),
  ('20260704020000', '[]', 'add_stripe_customer_id_to_subscription_rpc'),
  ('20260704030000', '[]', 'add_missing_grant_execute'),
  ('20260704040000', '[]', 'fix_cron_secret_and_schedules'),
  ('20260705010000', '[]', 'update_pricing_and_starter_trial'),
  ('20260705020000', '[]', 'fix_feature_access_and_trialing'),
  ('20260705030000', '[]', 'fix_super_admin_rls_and_has_role'),
  ('20260705040000', '[]', 'admin_subscription_management'),
  ('20260705050000', '[]', 'secure_manual_subscription_management'),
  ('20260705060000', '[]', 'force_row_level_security'),
  ('20260706010000', '[]', 'fix_store_deletion'),
  ('20260706020000', '[]', 'increase_product_limits'),
  ('20260706030000', '[]', 'fix_delete_organization_no_stores'),
  ('20260706040000', '[]', 'fix_delete_organization_check_constraint'),
  ('20260706050000', '[]', 'comprehensive_audit_fix'),
  ('20260706060000', '[]', 'user_activity_tracking'),
  ('20260706100000', '[]', 'create_first_organization_rpc'),
  ('20260706180000', '[]', 'remove_unsafe_update_organization_subscription'),
  ('20260706190000', '[]', 'enforce_store_limit_in_first_org_rpc'),
  -- Patches audit AUDIT-2026-007 (à n'inclure QUE s'ils ont été appliqués via SQL Editor)
  ('20260708000000', '[]', 'p1_security_fixes'),
  ('20260708010000', '[]', 'p2_security_fixes'),
  ('20260708020000', '[]', 'p3_security_fixes'),
  ('20260708030000', '[]', 'p3_1_create_update_updated_at_column')
ON CONFLICT (version) DO NOTHING;

-- Vérification : toutes les migrations doivent apparaître
SELECT COUNT(*) AS total_migrations_recorded
FROM supabase_migrations.schema_migrations;
-- Attendu : 78 (historique) + 4 (patches audit) = 82
