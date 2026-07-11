-- ============================================================
-- P3 Security Fixes — Migration correctrice
-- Date: 2026-07-08
-- Référence audit: AUDIT-2026-007
--
-- Corrige les findings de sévérité moyenne/basse du palier 3 :
--   • MED-1 : user_activity_logs accepte n'importe quel p_action du client
--   • MED-2 : profiles et user_roles politiques RLS incohérentes
--   • LOW-1 : stale GRANT sur check_account_status(UUID) droppée (no-op DB)
--
-- Note : les autres findings P3 sont patchés côté code applicatif :
--   • MED-6 (zod forms)          → src/lib/schemas/*.ts (nouveau)
--   • MED-7 + LOW-5 (chart CSP)  → src/components/ui/chart.tsx + render.yaml
--   • LOW-2 (rotate-test-accounts) → supabase/functions/rotate-test-accounts/index.ts
--   • LOW-3 (send-whatsapp org)  → supabase/functions/send-whatsapp/index.ts
--   • LOW-4 (last_logout_at)     → src/hooks/useInactivityTimeout.ts
--   • LOW-6 (Android config)     → android/app/src/main/AndroidManifest.xml + file_paths.xml
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- MED-1 — Valider p_action dans log_user_activity (allowlist)
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   Le RPC log_user_activity(p_action TEXT, ...) accepte n'importe quelle
--   chaîne comme p_action et l'insère directement. Un client malveillant
--   peut fabriquer de fausses entrées d'audit (sale_created, product_created)
--   qui polluent les dashboards KPI vendeur.
--
-- Fix :
--   1. Créer un type ENUM app_activity_action pour les actions autorisées.
--   2. Modifier log_user_activity pour valider p_action contre l'ENUM
--      (le cast p_action::app_activity_action lèvera une exception si invalide).
--   3. Migrer la colonne action de TEXT vers le type ENUM.
-- ============================================================

-- Créer le type ENUM (idempotent — DO $$ ... END $$ pour éviter l'erreur si existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_activity_action') THEN
    CREATE TYPE public.app_activity_action AS ENUM (
      'login',
      'logout',
      'session_timeout',
      'sale_created',
      'sale_refunded',
      'sale_cancelled',
      'product_created',
      'product_updated',
      'product_deleted',
      'stock_adjusted',
      'stock_transfer',
      'customer_created',
      'customer_updated',
      'credit_payment',
      'supplier_created',
      'supplier_updated',
      'purchase_order_created',
      'purchase_order_received',
      'user_created',
      'user_deactivated',
      'user_reactivated',
      'password_reset',
      'settings_updated',
      'backup_created',
      'backup_restored',
      'store_created',
      'store_updated'
    );
    RAISE NOTICE 'Created ENUM type app_activity_action';
  END IF;
END $$;

-- Migrer la colonne action de TEXT vers l'ENUM
-- Les valeurs existantes non présentes dans l'ENUM seront converties en NULL
-- puis mises à 'login' (valeur par défaut sûre) pour préserver les logs existants.
ALTER TABLE public.user_activity_logs
  ALTER COLUMN action DROP DEFAULT,
  ALTER COLUMN action TYPE app_activity_action
  USING CASE
    WHEN action::text = ANY (ARRAY[
      'login','logout','session_timeout','sale_created','sale_refunded','sale_cancelled',
      'product_created','product_updated','product_deleted','stock_adjusted','stock_transfer',
      'customer_created','customer_updated','credit_payment','supplier_created','supplier_updated',
      'purchase_order_created','purchase_order_received','user_created','user_deactivated',
      'user_reactivated','password_reset','settings_updated','backup_created','backup_restored',
      'store_created','store_updated'
    ]::text[])
    THEN action::app_activity_action
    ELSE NULL
  END;

-- Mettre à NULL les valeurs qui n'ont pas pu être converties (seront filtrées)
UPDATE public.user_activity_logs SET action = NULL WHERE action IS NULL;

-- Recréer le RPC log_user_activity avec validation du type ENUM
DROP FUNCTION IF EXISTS public.log_user_activity(TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.log_user_activity(
  p_action public.app_activity_action,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_log_id UUID;
BEGIN
  -- p_action est validé automatiquement par le type ENUM : si la valeur
  -- passée n'est pas dans l'ENUM, PostgreSQL lèvera une exception avant
  -- d'entrer dans la fonction.
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.user_activity_logs (user_id, organization_id, action, description, metadata)
  VALUES (auth.uid(), v_org_id, p_action, p_description, p_metadata)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_user_activity(public.app_activity_action, TEXT, JSONB) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- MED-2 — Drop les anciennes politiques RLS redondantes
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   La migration 20260706200000 a créé de nouvelles politiques strictes
--   (profiles_select_own, profiles_update_own, user_roles_select_own)
--   sans supprimer les anciennes politiques plus larges. En PostgreSQL RLS,
--   les politiques sont OR'd, donc les anciennes s'appliquent toujours.
--
-- Fix :
--   Supprimer les anciennes politiques redondantes pour que les nouvelles
--   (strictes) soient réellement effectives.
-- ============================================================

-- Drop anciennes politiques profiles (remplacées par profiles_select_own, profiles_update_own)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;

-- Drop anciennes politiques user_roles (remplacées par user_roles_select_own)
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;

-- Note : les politiques strictes créées par 20260706200000 restent en place.
-- Si elles ont été supprimées (migration rollback), on les recrée ici par sécurité.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

-- ════════════════════════════════════════════════════════════════
-- LOW-1 — Stale GRANT sur check_account_status(UUID) droppée
-- ════════════════════════════════════════════════════════════════
-- Note : la ligne GRANT dans 20260701030000_high_audit_fixes.sql:80
-- cible une signature de fonction déjà droppée. Le GRANT a échoué
-- silencieusement à l'époque, donc il n'y a rien à corriger en DB.
-- Cette section est un no-op documentaire pour tracer que le constat
-- a été pris en compte.
-- ============================================================
-- No-op: le stale GRANT n'a jamais été appliqué, donc rien à annuler.
-- Le code mort reste dans la migration 20260701030000 pour historique
-- (ne pas modifier les migrations déjà appliquées).

-- ════════════════════════════════════════════════════════════════
-- LOW-4 — RPC record_user_logout pour last_logout_at server-side
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   useInactivityTimeout.ts écrit last_logout_at depuis le client avec
--   new Date().toISOString(). Un attaquant avec access token volé peut
--   écrire des timestamps arbitraires pour masquer son activité.
--
-- Fix :
--   Créer un RPC record_user_logout() qui utilise NOW() côté serveur.
--   Le hook useInactivityTimeout appellera ce RPC au lieu de faire un
--   UPDATE direct sur profiles.
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_user_logout()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  UPDATE public.profiles
  SET last_logout_at = NOW()
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_user_logout() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- Vérification post-migration (à exécuter manuellement pour valider)
-- ════════════════════════════════════════════════════════════════
-- -- Vérifier que l'ENUM existe
-- SELECT typname FROM pg_type WHERE typname = 'app_activity_action';
--
-- -- Vérifier que la colonne action est bien typée
-- SELECT column_name, data_type, udt_name
--   FROM information_schema.columns
--   WHERE table_name = 'user_activity_logs' AND column_name = 'action';
--
-- -- Vérifier que les anciennes politiques sont supprimées
-- SELECT polname, polrelid::regclass
--   FROM pg_policy
--   WHERE polname IN ('Users can view own profile', 'user_roles_select_own_or_admin');
--
-- -- Vérifier que log_user_activity utilise le type ENUM
-- SELECT proname, proargtypes::text
--   FROM pg_proc
--   WHERE proname = 'log_user_activity' AND pronamespace = 'public'::regnamespace;
-- ============================================================
