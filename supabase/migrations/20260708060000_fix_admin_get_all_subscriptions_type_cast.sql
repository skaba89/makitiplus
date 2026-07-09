-- ============================================================
-- Fix admin_get_all_subscriptions — erreur "Returned type character varying(255) does not match expected type text"
-- Date: 2026-07-08
-- Référence: AUDIT-2026-007 (post-pilote)
--
-- Problème :
--   Le RPC admin_get_all_subscriptions déclare RETURNS TABLE avec
--   owner_email TEXT, mais la colonne au.email de auth.users est
--   varchar(255). PostgreSQL refuse cette incompatibilité de type.
--   Erreur 400 : "structure of query does not match function result
--   type — Returned type character varying(255) does not match
--   expected type text in column 3"
--
-- Fix :
--   Caster explicitement au.email::text dans le RETURN QUERY.
--   Aussi caster les autres colonnes potentiellement varchar pour
--   éviter le même problème.
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_get_all_subscriptions();

CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  owner_email TEXT,
  country TEXT,
  subscription_id UUID,
  plan_id TEXT,
  plan_name TEXT,
  status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  billing_period TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn1$
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name::text AS organization_name,
    au.email::text AS owner_email,
    o.country::text AS country,
    s.id AS subscription_id,
    s.plan_id::text AS plan_id,
    p.name::text AS plan_name,
    s.status::text AS status,
    s.current_period_start,
    s.current_period_end,
    s.trial_ends_at,
    s.billing_period::text AS billing_period,
    o.stripe_customer_id::text AS stripe_customer_id,
    s.created_at
  FROM organizations o
  LEFT JOIN subscriptions s ON s.organization_id = o.id
  LEFT JOIN plans p ON p.id = s.plan_id
  LEFT JOIN auth.users au ON au.id = o.owner_user_id
  ORDER BY o.name;
END;
$fn1$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- Vérification
-- ════════════════════════════════════════════════════════════════
-- SELECT proname FROM pg_proc
-- WHERE proname = 'admin_get_all_subscriptions'
--   AND pronamespace = 'public'::regnamespace;
