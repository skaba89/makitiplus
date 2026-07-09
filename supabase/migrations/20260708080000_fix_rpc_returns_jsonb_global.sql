-- ============================================================
-- FIX GLOBAL — tous les RPCs avec RETURNS TABLE + varchar → JSONB
-- Date: 2026-07-08
-- Référence: AUDIT-2026-007 (post-pilote)
--
-- Problème : plusieurs RPCs utilisent RETURNS TABLE (... TEXT ...) mais
-- les colonnes sous-jacentes sont varchar(255). PostgreSQL refuse avec
-- erreur 400 "structure of query does not match function result type".
--
-- Fix : convertir tous ces RPCs en RETURNS JSONB qui est agnostique
-- des types varchar vs text. Le frontend normalise déjà le retour.
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. get_organization_subscription
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_organization_subscription();

CREATE OR REPLACE FUNCTION public.get_organization_subscription()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_organization');
  END IF;

  SELECT jsonb_build_object(
    'subscription_id', s.id,
    'plan_id', s.plan_id,
    'plan_name', p.name,
    'status', s.status,
    'current_period_end', s.current_period_end,
    'trial_ends_at', s.trial_ends_at,
    'grace_period_ends_at', s.grace_period_ends_at,
    'max_stores', p.max_stores,
    'max_users', p.max_users,
    'max_products', p.max_products,
    'max_sales_per_month', p.max_sales_per_month,
    'has_advanced_reports', p.has_advanced_reports,
    'has_exports', p.has_exports,
    'has_supplier_management', p.has_supplier_management,
    'has_offline_advanced', p.has_offline_advanced,
    'has_api_access', p.has_api_access,
    'has_priority_support', p.has_priority_support,
    'has_custom_branding', p.has_custom_branding,
    'has_multi_currency', p.has_multi_currency,
    'has_ai_assistant', p.has_ai_assistant,
    'has_loyalty_program', p.has_loyalty_program
  ) INTO v_result
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_result IS NULL THEN
    -- Pas d'abonnement actif → retourner plan starter par défaut
    SELECT jsonb_build_object(
      'subscription_id', NULL,
      'plan_id', 'starter',
      'plan_name', p.name,
      'status', 'active',
      'current_period_end', NULL,
      'trial_ends_at', NULL,
      'grace_period_ends_at', NULL,
      'max_stores', p.max_stores,
      'max_users', p.max_users,
      'max_products', p.max_products,
      'max_sales_per_month', p.max_sales_per_month,
      'has_advanced_reports', p.has_advanced_reports,
      'has_exports', p.has_exports,
      'has_supplier_management', p.has_supplier_management,
      'has_offline_advanced', p.has_offline_advanced,
      'has_api_access', p.has_api_access,
      'has_priority_support', p.has_priority_support,
      'has_custom_branding', p.has_custom_branding,
      'has_multi_currency', p.has_multi_currency,
      'has_ai_assistant', p.has_ai_assistant,
      'has_loyalty_program', p.has_loyalty_program
    ) INTO v_result
    FROM public.plans p
    WHERE p.id = 'starter';
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_subscription() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 2. check_feature_access — caster en TEXT (déjà fait mais on re-vérifie)
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.check_feature_access(TEXT);

CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_feature_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_plan_id TEXT;
  v_allowed_plans TEXT[];
  v_allowed BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    v_plan_id := 'starter';
  ELSE
    SELECT s.plan_id::text INTO v_plan_id
    FROM public.subscriptions s
    WHERE s.organization_id = v_org_id
      AND s.status IN ('active', 'past_due', 'grace_period', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_plan_id IS NULL THEN
      v_plan_id := 'starter';
    END IF;
  END IF;

  SELECT allowed_plans INTO v_allowed_plans
  FROM public.feature_flags
  WHERE feature_key = p_feature_key
  LIMIT 1;

  IF v_allowed_plans IS NULL THEN
    v_allowed := FALSE;
  ELSE
    v_allowed := v_plan_id = ANY(v_allowed_plans);
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'plan_id', v_plan_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_feature_access(TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. Recharger PostgREST
-- ════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- 4. Vérification
-- ════════════════════════════════════════════════════════════════
SELECT 
    'get_organization_subscription' AS fn,
    pg_get_function_result(oid) AS return_type
FROM pg_proc
WHERE proname = 'get_organization_subscription' AND pronamespace = 'public'::regnamespace
UNION ALL
SELECT 
    'check_feature_access',
    pg_get_function_result(oid)
FROM pg_proc
WHERE proname = 'check_feature_access' AND pronamespace = 'public'::regnamespace;
