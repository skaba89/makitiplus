-- ═══════════════════════════════════════════════════════════════════════════
-- FIX PRICING — Nouvelle structure tarifaire MakitiPlus
-- Execute dans : Supabase Dashboard -> SQL Editor -> New Query
--
-- Changements :
--   - Pas de version gratuite (starter supprimé/rendu inactif)
--   - MakitiPlus Croissance : 39,90€/mois, 399€/an
--   - MakitiPlus Enterprise : 99,90€/mois, 999€/an
--   - Devise EUR au lieu de USD
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Désactiver le plan starter (on ne le supprime pas pour préserver
--    les subscriptions existantes qui y font référence)
UPDATE public.plans
SET
  is_active = false,
  name = 'Starter (obsolète)',
  description = 'Ce plan n''est plus disponible. Les utilisateurs existants sont invités à migrer.'
WHERE id = 'starter';

-- 2. Mettre à jour MakitiPlus Croissance
UPDATE public.plans
SET
  name = 'MakitiPlus Croissance',
  description = 'Pour les boutiques qui grandissent — fournisseurs, rapports avancés, exports et multi-devises.',
  price_monthly = 39.90,
  price_yearly = 399.00,
  currency = 'EUR',
  max_stores = 1,
  max_users = 5,
  max_products = NULL,
  max_sales_per_month = NULL,
  has_advanced_reports = true,
  has_exports = true,
  has_supplier_management = true,
  has_offline_advanced = false,
  has_custom_branding = false,
  has_multi_currency = true,
  has_api_access = false,
  has_priority_support = false,
  has_ai_assistant = false,
  has_loyalty_program = false,
  sort_order = 1,
  is_active = true
WHERE id = 'croissance';

-- 3. Mettre à jour MakitiPlus Enterprise
UPDATE public.plans
SET
  name = 'MakitiPlus Enterprise',
  description = 'Pour les chaînes et grossistes — boutiques illimitées, API, support prioritaire et assistant IA.',
  price_monthly = 99.90,
  price_yearly = 999.00,
  currency = 'EUR',
  max_stores = NULL,
  max_users = NULL,
  max_products = NULL,
  max_sales_per_month = NULL,
  has_advanced_reports = true,
  has_exports = true,
  has_supplier_management = true,
  has_offline_advanced = true,
  has_custom_branding = true,
  has_multi_currency = true,
  has_api_access = true,
  has_priority_support = true,
  has_ai_assistant = true,
  has_loyalty_program = true,
  sort_order = 2,
  is_active = true
WHERE id = 'enterprise';

-- 4. Mettre à jour le RPC select_plan pour ne plus accepter starter
DROP FUNCTION IF EXISTS public.select_plan(TEXT);
CREATE OR REPLACE FUNCTION public.select_plan(
  p_plan_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_sub_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifie';
  END IF;

  IF p_plan_id IS NULL OR p_plan_id NOT IN ('croissance', 'enterprise') THEN
    RAISE EXCEPTION 'Plan invalide : %. Plans disponibles : croissance, enterprise', p_plan_id;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = v_user_id AND is_active = true LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvee';
  END IF;

  INSERT INTO public.subscriptions (organization_id, plan_id, status, billing_period, current_period_start, current_period_end)
  VALUES (
    v_org_id, p_plan_id, 'active', 'monthly',
    NOW(),
    NOW() + INTERVAL '30 days'
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_start = NOW(),
    current_period_end = EXCLUDED.current_period_end,
    updated_at = NOW()
  RETURNING id INTO v_sub_id;

  INSERT INTO public.subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
  VALUES (
    v_org_id,
    'upgraded',
    'starter',
    p_plan_id,
    v_user_id,
    jsonb_build_object('source', 'onboarding', 'plan_id', p_plan_id)
  );

  RETURN v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.select_plan(TEXT) TO authenticated;

-- 5. Mettre à jour get_plans pour ne retourner que les plans actifs
DROP FUNCTION IF EXISTS public.get_plans();
CREATE OR REPLACE FUNCTION public.get_plans()
RETURNS SETOF public.plans
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.plans WHERE is_active = true ORDER BY sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_plans() TO authenticated;

-- 6. Mettre à jour check_plan_limit : fallback vers croissance au lieu de starter
DROP FUNCTION IF EXISTS public.check_plan_limit(TEXT);
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

  SELECT s.plan_id AS sub_plan_id, p.max_stores, p.max_users, p.max_products, p.max_sales_per_month
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT 'croissance'::text AS sub_plan_id, max_stores, max_users, max_products, max_sales_per_month
    INTO v_sub
    FROM public.plans WHERE id = 'croissance';
  END IF;

  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
      v_limit := v_sub.max_stores;
    WHEN 'users' THEN
      SELECT COUNT(DISTINCT ur.user_id) INTO v_current
      FROM public.user_roles ur
      JOIN public.profiles pf ON pf.user_id = ur.user_id
      WHERE pf.organization_id = v_org_id;
      v_limit := v_sub.max_users;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id;
      v_limit := v_sub.max_products;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_current FROM public.sales sal
      WHERE sal.organization_id = v_org_id
        AND sal.created_at >= date_trunc('month', NOW());
      v_limit := v_sub.max_sales_per_month;
    ELSE
      RAISE EXCEPTION 'Type de limite inconnu : %', p_limit_type;
  END CASE;

  RETURN QUERY SELECT
    (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
    v_current,
    v_limit,
    v_sub.sub_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;

-- Corrections appliquees
