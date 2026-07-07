-- ============================================================
-- Vérification post-déploiement des patches P1+P2+P3
-- Référence audit : AUDIT-2026-007
-- ============================================================
-- À exécuter dans Supabase Dashboard → SQL Editor après avoir
-- appliqué apply_p1_p2_p3_combined.sql.
--
-- Chaque requête retourne un résultat attendu. Si un résultat
-- ne correspond pas, le patch correspondant n'a pas été appliqué
-- correctement — revoir le fichier apply_p1_p2_p3_combined.sql.
-- ============================================================

-- ─── CRIT-1 + HIGH-1 : register_user patched ─────────────────────
-- Attendu : 1 ligne avec register_user et 'admin_exists' dans prosrc
SELECT proname, proargtypes::text AS args
FROM pg_proc
WHERE proname = 'register_user'
  AND pronamespace = 'public'::regnamespace;
-- Attendu : 1 ligne. prosrc doit contenir 'admin_exists()' et
-- 'Rôle non autorisé pour une auto-inscription sans organisation'


-- ─── HIGH-3 : stripe_events policy avec TO service_role ──────────
-- Attendu : 1 ligne avec roles = {service_role}
SELECT polname, polrelid::regclass AS table_name, polroles::text[] AS roles
FROM pg_policy
WHERE polname = 'stripe_events_service_role';
-- Attendu : roles = {service_role} (et NON {= } ou vide)


-- ─── HIGH-4 : is_org_admin() existe ──────────────────────────────
-- Attendu : 1 ligne
SELECT proname, proargtypes::text AS args
FROM pg_proc
WHERE proname = 'is_org_admin'
  AND pronamespace = 'public'::regnamespace;
-- Attendu : 1 ligne, args vide (pas de paramètre)


-- ─── HIGH-2 : get_supplier_stats() et get_supplier_with_products ─
-- Attendu : 2 lignes
SELECT proname, proargtypes::text AS args
FROM pg_proc
WHERE proname IN ('get_supplier_stats', 'get_supplier_with_products')
  AND pronamespace = 'public'::regnamespace;
-- Attendu :
--   get_supplier_stats | (vide) — aucun paramètre
--   get_supplier_with_products | 2950 (UUID)


-- ─── MED-1 : ENUM app_activity_action créé ───────────────────────
-- Attendu : 1 ligne
SELECT typname FROM pg_type WHERE typname = 'app_activity_action';
-- Attendu : app_activity_action


-- ─── MED-1 : colonne user_activity_logs.action typée ENUM ────────
-- Attendu : 1 ligne avec udt_name = 'app_activity_action'
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'user_activity_logs' AND column_name = 'action';
-- Attendu : udt_name = 'app_activity_action' (et NON 'text')


-- ─── MED-1 : log_user_activity utilise le type ENUM ──────────────
-- Attendu : 1 ligne avec args commençant par le type ENUM
SELECT proname, proargtypes::text AS args
FROM pg_proc
WHERE proname = 'log_user_activity'
  AND pronamespace = 'public'::regnamespace;
-- Attendu : args contient le OID du type app_activity_action (regtype)


-- ─── MED-2 : anciennes policies profiles/user_roles supprimées ───
-- Attendu : 0 ligne
SELECT polname, polrelid::regclass AS table_name
FROM pg_policy
WHERE polname IN ('Users can view own profile', 'user_roles_select_own_or_admin',
                  'profiles_select_own_or_admin', 'Users can update own profile');
-- Attendu : 0 ligne (les anciennes policies sont supprimées)


-- ─── MED-2 : nouvelles policies strictes présentes ───────────────
-- Attendu : 3 lignes (profiles_select_own, profiles_update_own, user_roles_select_own)
SELECT polname, polrelid::regclass AS table_name
FROM pg_policy
WHERE polname IN ('profiles_select_own', 'profiles_update_own', 'user_roles_select_own');
-- Attendu : 3 lignes


-- ─── MED-3 : tables whatsapp_config et whatsapp_message_logs ─────
-- Attendu : 2 lignes
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('whatsapp_config', 'whatsapp_message_logs');
-- Attendu : 2 lignes


-- ─── MED-3 : RLS forcée sur les tables whatsapp ──────────────────
-- Attendu : 2 lignes avec rowsecurity = 'true' et forcerowsecurity = 'true'
SELECT tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('whatsapp_config', 'whatsapp_message_logs');
-- Attendu : 2 lignes avec rowsecurity=t et forcerowsecurity=t


-- ─── MED-4 : validate_backup_columns existe ──────────────────────
-- Attendu : 1 ligne
SELECT proname, proargtypes::text AS args
FROM pg_proc
WHERE proname = 'validate_backup_columns'
  AND pronamespace = 'public'::regnamespace;
-- Attendu : 1 ligne, args contient 25 (text) et 1009 (text[])


-- ─── LOW-4 : record_user_logout existe ───────────────────────────
-- Attendu : 1 ligne
SELECT proname, proargtypes::text AS args
FROM pg_proc
WHERE proname = 'record_user_logout'
  AND pronamespace = 'public'::regnamespace;
-- Attendu : 1 ligne, args vide (pas de paramètre)


-- ─── Récapitulatif : toutes les fonctions critiques ──────────────
-- Attendu : 6+ lignes
SELECT proname
FROM pg_proc
WHERE proname IN ('register_user', 'is_org_admin', 'record_user_logout',
                   'log_user_activity', 'validate_backup_columns',
                   'get_supplier_stats', 'get_supplier_with_products')
  AND pronamespace = 'public'::regnamespace
ORDER BY proname;
-- Attendu : 7 lignes


-- ─── Test live : is_org_admin() callable sans erreur ─────────────
-- Attendu : 1 ligne avec current_user_is_org_admin = false (anonyme)
SELECT public.is_org_admin() AS current_user_is_org_admin;
-- Attendu : false (si exécuté en tant qu'utilisateur non admin ou anon)
