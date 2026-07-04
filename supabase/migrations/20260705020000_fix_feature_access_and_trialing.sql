-- Migration: Fix feature access for super_admin/trialing and align sidebar/route roles
-- Date: 2026-07-05
-- Changes:
--   1. Add 'trialing' to subscriptions CHECK constraint
--   2. Update check_feature_access to include 'trialing' status
--   3. Update check_plan_limit to include 'trialing' status
--   4. Ensure all feature_flags have is_active = TRUE and correct allowed_plans
--   5. Update get_organization_subscription to include 'trialing' status


-- 1. Fix subscriptions CHECK constraint to include 'trialing'
DO $body$
BEGIN
  -- Drop existing constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname LIKE '%status%'
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
  END IF;

  -- Add updated constraint with 'trialing'
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'trialing', 'past_due', 'grace_period', 'read_only', 'cancelled', 'expired'));
END;
$body$;


-- 2. Update check_feature_access to include 'trialing' status
CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_feature_key TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  plan_id TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_plan_id TEXT;
  v_allowed_plans TEXT[];
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Get organization's plan (include 'trialing' as active status)
  SELECT s.plan_id INTO v_plan_id
  FROM public.subscriptions s
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Default to starter if no subscription
  IF v_plan_id IS NULL THEN
    v_plan_id := 'starter';
  END IF;

  -- Get feature's allowed plans from feature_flags table
  SELECT allowed_plans INTO v_allowed_plans
  FROM public.feature_flags
  WHERE feature_key = p_feature_key AND is_active = TRUE;

  IF NOT FOUND THEN
    -- Feature not found = not allowed
    RETURN QUERY SELECT FALSE, v_plan_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT (v_plan_id = ANY(v_allowed_plans))::BOOLEAN, v_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_feature_access(TEXT) TO authenticated;


-- 3. Update check_plan_limit to include 'trialing' status
CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_limit_type TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  limit_value INTEGER,
  plan_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_sub record;
  v_current INTEGER;
  v_limit INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Get active subscription (include 'trialing' as active status)
  SELECT * INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no subscription, default to starter limits
  IF NOT FOUND THEN
    SELECT * INTO v_sub FROM public.plans WHERE id = 'starter';
  END IF;

  -- Calculate current count based on limit type
  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
      v_limit := v_sub.max_stores;
    WHEN 'users' THEN
      SELECT COUNT(*) INTO v_current FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE p.organization_id = v_org_id;
      v_limit := v_sub.max_users;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id;
      v_limit := v_sub.max_products;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_current FROM public.sales
      WHERE organization_id = v_org_id
        AND created_at >= date_trunc('month', NOW());
      v_limit := v_sub.max_sales_per_month;
    ELSE
      RAISE EXCEPTION 'Type de limite inconnu : %', p_limit_type;
  END CASE;

  -- NULL limit means unlimited
  RETURN QUERY SELECT
    (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
    v_current,
    v_limit,
    v_sub.plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;


-- 4. Ensure all feature_flags are active with correct allowed_plans
UPDATE public.feature_flags SET is_active = TRUE WHERE is_active IS NOT TRUE;

-- Re-seed feature flags to ensure correct allowed_plans (idempotent upsert)
INSERT INTO public.feature_flags (feature_key, description, allowed_plans) VALUES
  ('pos', 'Acces caisse enregistreuse', '{"starter","croissance","enterprise"}'),
  ('stock_management', 'Gestion du stock', '{"starter","croissance","enterprise"}'),
  ('customer_credit', 'Credit clients', '{"starter","croissance","enterprise"}'),
  ('basic_reports', 'Rapports de base', '{"starter","croissance","enterprise"}'),
  ('advanced_reports', 'Rapports avances et analytics', '{"croissance","enterprise"}'),
  ('exports', 'Exports PDF et Excel', '{"croissance","enterprise"}'),
  ('supplier_management', 'Gestion fournisseurs', '{"croissance","enterprise"}'),
  ('offline_advanced', 'Mode offline avance', '{"croissance","enterprise"}'),
  ('custom_branding', 'Branding personnalise', '{"croissance","enterprise"}'),
  ('multi_currency', 'Multi-devises', '{"croissance","enterprise"}'),
  ('api_access', 'Acces API externe', '{"enterprise"}'),
  ('priority_support', 'Support prioritaire', '{"enterprise"}'),
  ('ai_assistant', 'Assistant IA metier', '{"enterprise"}'),
  ('loyalty_program', 'Programme fidelite', '{"enterprise"}'),
  ('admin_analytics', 'Analytics multi-boutiques admin', '{"enterprise"}'),
  ('backup_restore', 'Sauvegarde et restauration', '{"enterprise"}')
ON CONFLICT (feature_key) DO UPDATE SET
  description = EXCLUDED.description,
  allowed_plans = EXCLUDED.allowed_plans,
  is_active = TRUE;


-- 5. Update get_organization_subscription to include 'trialing' status
CREATE OR REPLACE FUNCTION public.get_organization_subscription()
RETURNS TABLE (
  subscription_id UUID,
  plan_id TEXT,
  plan_name TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  max_stores INTEGER,
  max_users INTEGER,
  max_products INTEGER,
  max_sales_per_month INTEGER,
  has_advanced_reports BOOLEAN,
  has_exports BOOLEAN,
  has_supplier_management BOOLEAN,
  has_offline_advanced BOOLEAN,
  has_api_access BOOLEAN,
  has_priority_support BOOLEAN,
  has_custom_branding BOOLEAN,
  has_multi_currency BOOLEAN,
  has_ai_assistant BOOLEAN,
  has_loyalty_program BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  RETURN QUERY
  SELECT
    s.id AS subscription_id,
    s.plan_id,
    p.name AS plan_name,
    s.status,
    s.current_period_end,
    s.trial_ends_at,
    s.grace_period_ends_at,
    p.max_stores,
    p.max_users,
    p.max_products,
    p.max_sales_per_month,
    p.has_advanced_reports,
    p.has_exports,
    p.has_supplier_management,
    p.has_offline_advanced,
    p.has_api_access,
    p.has_priority_support,
    p.has_custom_branding,
    p.has_multi_currency,
    p.has_ai_assistant,
    p.has_loyalty_program
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_subscription() TO authenticated;


-- 6. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
