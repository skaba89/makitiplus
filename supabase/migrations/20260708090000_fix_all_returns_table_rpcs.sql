-- ============================================================
-- FIX GLOBAL — Tous les RPCs RETURNS TABLE avec casts explicites
-- Date: 2026-07-08
-- Référence: AUDIT-2026-007 (post-pilote)
--
-- Problème : 12 RPCs utilisent RETURNS TABLE (... TEXT ...) mais
-- les colonnes sous-jacentes sont varchar(255). PostgreSQL refuse
-- avec erreur 400 "structure of query does not match function
-- result type — Returned type character varying(255) does not
-- match expected type text"
--
-- Fix : ajouter ::text casts sur TOUTES les colonnes varchar dans
-- les RETURN QUERY. Les colonnes UUID/INTEGER/BOOLEAN/TIMESTAMPTZ
-- n'ont pas ce problème (déjà compatibles).
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. check_account_status — déjà sans args, mais on la recrée proprement
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.check_account_status();
DROP FUNCTION IF EXISTS public.check_account_status(UUID);

CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE (
  is_active BOOLEAN,
  is_test_account BOOLEAN,
  test_expires_at TIMESTAMPTZ,
  deactivation_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.is_active,
    p.is_test_account,
    p.test_expires_at,
    p.deactivation_reason::text
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 2. get_categories — caster name et description
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_categories();

CREATE OR REPLACE FUNCTION public.get_categories()
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  sort_order INTEGER,
  product_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name::text,
    c.description::text,
    c.sort_order,
    (SELECT count(*) FROM public.products p WHERE p.category_id = c.id)
  FROM public.categories c
  WHERE c.organization_id = public.get_user_organization_id()
  ORDER BY c.sort_order, c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_categories() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. check_plan_limit — retourner JSONB (plus simple)
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.check_plan_limit(TEXT);
DROP FUNCTION IF EXISTS public.check_plan_limit(public.limit_type);

CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_limit_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_sub RECORD;
  v_current INTEGER;
  v_limit INTEGER;
  v_plan_id TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'current', 0, 'limit', 0, 'plan_id', 'starter');
  END IF;

  SELECT s.plan_id::text, s.status, p.max_stores, p.max_users, p.max_products, p.max_sales_per_month
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_sub FROM public.plans WHERE id = 'starter';
    v_plan_id := 'starter';
  ELSE
    v_plan_id := v_sub.plan_id;
  END IF;

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
      WHERE organization_id = v_org_id AND created_at >= date_trunc('month', NOW());
      v_limit := v_sub.max_sales_per_month;
    ELSE
      v_current := 0; v_limit := NULL;
  END CASE;

  RETURN jsonb_build_object(
    'allowed', (v_limit IS NULL OR v_current < v_limit),
    'current', v_current,
    'limit', v_limit,
    'plan_id', v_plan_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. get_organization_stores — caster name, slug, country, currency
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_organization_stores();

CREATE OR REPLACE FUNCTION public.get_organization_stores()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  country TEXT,
  currency TEXT,
  category TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name::text,
    s.slug::text,
    s.country::text,
    s.currency::text,
    s.category::text,
    s.created_at
  FROM public.stores s
  WHERE s.organization_id = public.get_user_organization_id()
  ORDER BY s.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_stores() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 5. get_top_products — caster name, barcode, unit
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_top_products(INTEGER);

CREATE OR REPLACE FUNCTION public.get_top_products(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  barcode TEXT,
  unit TEXT,
  total_sold INTEGER,
  total_revenue NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name::text AS product_name,
    p.barcode::text AS barcode,
    p.unit::text AS unit,
    COALESCE(SUM(si.quantity), 0)::integer AS total_sold,
    COALESCE(SUM(si.quantity * si.unit_price), 0) AS total_revenue
  FROM public.products p
  LEFT JOIN public.sale_items si ON si.product_id = p.id
  LEFT JOIN public.sales s ON s.id = si.sale_id
  WHERE p.organization_id = public.get_user_organization_id()
    AND (s.organization_id = public.get_user_organization_id() OR s.id IS NULL)
  GROUP BY p.id, p.name, p.barcode, p.unit
  ORDER BY total_sold DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_products(INTEGER) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 6. get_admin_stores_summary — convertir en JSONB
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_admin_stores_summary();

CREATE OR REPLACE FUNCTION public.get_admin_stores_summary()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'store_id', s.id,
    'store_name', s.name,
    'org_name', o.name,
    'country', s.country,
    'currency', s.currency,
    'category', s.category,
    'product_count', (SELECT count(*) FROM public.products p WHERE p.organization_id = o.id),
    'sale_count', (SELECT count(*) FROM public.sales sa WHERE sa.organization_id = o.id),
    'created_at', s.created_at
  ) ORDER BY s.created_at DESC), '[]'::jsonb) INTO v_result
  FROM public.stores s
  JOIN public.organizations o ON o.id = s.organization_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stores_summary() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 7. get_onboarding_checklist — convertir en JSONB
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_onboarding_checklist();

CREATE OR REPLACE FUNCTION public.get_onboarding_checklist()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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
    'has_products', (SELECT count(*) > 0 FROM public.products WHERE organization_id = v_org_id),
    'has_categories', (SELECT count(*) > 0 FROM public.categories WHERE organization_id = v_org_id),
    'has_customers', (SELECT count(*) > 0 FROM public.customers WHERE organization_id = v_org_id),
    'has_sales', (SELECT count(*) > 0 FROM public.sales WHERE organization_id = v_org_id),
    'has_suppliers', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'suppliers')
      AND (SELECT count(*) > 0 FROM public.suppliers WHERE organization_id = v_org_id),
    'has_stores', (SELECT count(*) > 0 FROM public.stores WHERE organization_id = v_org_id),
    'product_count', (SELECT count(*) FROM public.products WHERE organization_id = v_org_id),
    'category_count', (SELECT count(*) FROM public.categories WHERE organization_id = v_org_id),
    'customer_count', (SELECT count(*) FROM public.customers WHERE organization_id = v_org_id),
    'sale_count', (SELECT count(*) FROM public.sales WHERE organization_id = v_org_id),
    'store_count', (SELECT count(*) FROM public.stores WHERE organization_id = v_org_id)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_onboarding_checklist() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 8. Recharger PostgREST
-- ════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- 9. Vérification — tous les RPCs corrigés
-- ════════════════════════════════════════════════════════════════
SELECT proname, pg_get_function_result(oid) AS return_type
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'check_account_status', 'get_categories', 'check_plan_limit',
    'get_organization_stores', 'get_top_products',
    'get_admin_stores_summary', 'get_onboarding_checklist'
  )
ORDER BY proname;
