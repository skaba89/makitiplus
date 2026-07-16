-- ════════════════════════════════════════════════════════════════
-- Migration: Admin Analytics — RPCs avancés
-- Date: 2026-07-16
-- Objectif: Enrichir le dashboard super_admin avec :
--   1. Utilisateurs par organisation (admin/manager/vendeur/comptable)
--   2. Performance par vendeur (par magasin)
--   3. Magasins groupés par organisation
--   4. KPIs globaux enrichis (panier moyen, marge nette, croissance)
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- 1. get_admin_users_per_org
--    Retourne le nombre d'utilisateurs par organisation et par rôle
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_admin_users_per_org()
RETURNS TABLE (
  organization_id UUID,
  org_name TEXT,
  admin_count BIGINT,
  manager_count BIGINT,
  vendeur_count BIGINT,
  comptable_count BIGINT,
  total_users BIGINT,
  active_users BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    o.id AS organization_id,
    o.name AS org_name,
    COUNT(CASE WHEN ur.role = 'admin' THEN 1 END) AS admin_count,
    COUNT(CASE WHEN ur.role = 'manager' THEN 1 END) AS manager_count,
    COUNT(CASE WHEN ur.role = 'vendeur' THEN 1 END) AS vendeur_count,
    COUNT(CASE WHEN ur.role = 'comptable' THEN 1 END) AS comptable_count,
    COUNT(DISTINCT p.user_id) AS total_users,
    COUNT(DISTINCT CASE WHEN p.is_active = true THEN p.user_id END) AS active_users
  FROM public.organizations o
  LEFT JOIN public.profiles p ON p.organization_id = o.id
  LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE o.id IN (
    SELECT id FROM public.organizations WHERE public.is_super_admin()
  )
  AND (ur.role IS NULL OR ur.role != 'super_admin'::public.app_role)
  GROUP BY o.id, o.name
  ORDER BY o.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_users_per_org() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 2. get_admin_seller_performance
--    KPIs par vendeur pour une période et optionnellement une org
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_admin_seller_performance(
  p_period TEXT DEFAULT 'month',
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  seller_id UUID,
  seller_name TEXT,
  seller_role TEXT,
  organization_id UUID,
  org_name TEXT,
  store_name TEXT,
  total_sales BIGINT,
  total_revenue NUMERIC,
  avg_sale_amount NUMERIC,
  last_sale_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    v_start_date TIMESTAMPTZ;
  BEGIN
    -- Calculer la date de début selon la période
    v_start_date := CASE 
      WHEN p_period = 'day' THEN date_trunc('day', NOW()) - INTERVAL '1 day'
      WHEN p_period = 'week' THEN date_trunc('week', NOW()) - INTERVAL '7 days'
      WHEN p_period = 'month' THEN date_trunc('month', NOW()) - INTERVAL '30 days'
      ELSE date_trunc('month', NOW()) - INTERVAL '30 days'
    END;

    RETURN QUERY
    SELECT 
      p.user_id AS seller_id,
      COALESCE(p.owner_name, '—') AS seller_name,
      COALESCE(ur.role::text, 'unknown') AS seller_role,
      p.organization_id,
      o.name AS org_name,
      o.name AS store_name,
      COUNT(DISTINCT s.id) AS total_sales,
      COALESCE(SUM(s.total_amount), 0) AS total_revenue,
      COALESCE(AVG(s.total_amount), 0) AS avg_sale_amount,
      MAX(s.created_at) AS last_sale_at,
      p.last_login_at
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
    LEFT JOIN public.organizations o ON o.id = p.organization_id
    LEFT JOIN public.sales s ON s.user_id = p.user_id AND s.created_at >= v_start_date
    WHERE public.is_super_admin()
      AND p.organization_id IS NOT NULL
      AND (p_organization_id IS NULL OR p.organization_id = p_organization_id)
      AND (ur.role IS NULL OR ur.role IN ('vendeur', 'manager', 'admin')::public.app_role)
    GROUP BY p.user_id, p.owner_name, ur.role, p.organization_id, o.name, p.last_login_at
    ORDER BY total_revenue DESC;
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_seller_performance(TEXT, UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. get_admin_org_kpis
--    KPIs globaux par organisation (CA, ventes, panier moyen, marge, etc.)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_admin_org_kpis(
  p_period TEXT DEFAULT 'month'
)
RETURNS TABLE (
  organization_id UUID,
  org_name TEXT,
  store_count BIGINT,
  transaction_count BIGINT,
  total_sales NUMERIC,
  total_expenses NUMERIC,
  net_revenue NUMERIC,
  avg_basket NUMERIC,
  total_cost NUMERIC,
  gross_margin NUMERIC,
  customer_count BIGINT,
  active_products BIGINT,
  low_stock_count BIGINT,
  store_names TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    v_start_date TIMESTAMPTZ;
  BEGIN
    v_start_date := CASE 
      WHEN p_period = 'day' THEN date_trunc('day', NOW()) - INTERVAL '1 day'
      WHEN p_period = 'week' THEN date_trunc('week', NOW()) - INTERVAL '7 days'
      WHEN p_period = 'month' THEN date_trunc('month', NOW()) - INTERVAL '30 days'
      ELSE date_trunc('month', NOW()) - INTERVAL '30 days'
    END;

    RETURN QUERY
    SELECT 
      o.id AS organization_id,
      o.name AS org_name,
      COUNT(DISTINCT st.id) AS store_count,
      COUNT(DISTINCT s.id) AS transaction_count,
      COALESCE(SUM(s.total_amount), 0) AS total_sales,
      COALESCE(SUM(e.amount), 0) AS total_expenses,
      COALESCE(SUM(s.total_amount), 0) - COALESCE(SUM(e.amount), 0) AS net_revenue,
      CASE WHEN COUNT(DISTINCT s.id) > 0 
        THEN COALESCE(SUM(s.total_amount), 0) / COUNT(DISTINCT s.id)
        ELSE 0 
      END AS avg_basket,
      COALESCE(SUM(si.total_cost), 0) AS total_cost,
      COALESCE(SUM(s.total_amount), 0) - COALESCE(SUM(si.total_cost), 0) AS gross_margin,
      COUNT(DISTINCT c.id) AS customer_count,
      COUNT(DISTINCT CASE WHEN pr.is_active = true THEN pr.id END) AS active_products,
      COUNT(DISTINCT CASE WHEN pr.stock_quantity <= pr.min_stock_alert THEN pr.id END) AS low_stock_count,
      ARRAY_AGG(DISTINCT st.name) FILTER (WHERE st.name IS NOT NULL) AS store_names
    FROM public.organizations o
    LEFT JOIN public.stores st ON st.organization_id = o.id
    LEFT JOIN public.sales s ON s.organization_id = o.id AND s.created_at >= v_start_date
    LEFT JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.expenses e ON e.organization_id = o.id AND e.created_at >= v_start_date
    LEFT JOIN public.customers c ON c.organization_id = o.id
    LEFT JOIN public.products pr ON pr.organization_id = o.id
    WHERE public.is_super_admin()
    GROUP BY o.id, o.name
    ORDER BY total_sales DESC;
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_org_kpis(TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. get_admin_global_kpis
--    KPIs globaux (toutes orgs confondues) avec comparaison période précédente
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_admin_global_kpis(
  p_period TEXT DEFAULT 'month'
)
RETURNS TABLE (
  total_orgs BIGINT,
  total_stores BIGINT,
  total_users BIGINT,
  total_active_users BIGINT,
  total_transactions BIGINT,
  total_sales NUMERIC,
  total_expenses NUMERIC,
  net_revenue NUMERIC,
  avg_basket NUMERIC,
  total_cost NUMERIC,
  gross_margin NUMERIC,
  gross_margin_pct NUMERIC,
  total_customers BIGINT,
  total_products BIGINT,
  total_active_products BIGINT,
  low_stock_count BIGINT,
  previous_period_sales NUMERIC,
  sales_growth_pct NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    v_start_date TIMESTAMPTZ;
    v_prev_start_date TIMESTAMPTZ;
    v_prev_end_date TIMESTAMPTZ;
  BEGIN
    v_start_date := CASE 
      WHEN p_period = 'day' THEN date_trunc('day', NOW()) - INTERVAL '1 day'
      WHEN p_period = 'week' THEN date_trunc('week', NOW()) - INTERVAL '7 days'
      WHEN p_period = 'month' THEN date_trunc('month', NOW()) - INTERVAL '30 days'
      ELSE date_trunc('month', NOW()) - INTERVAL '30 days'
    END;
    v_prev_end_date := v_start_date;
    v_prev_start_date := CASE 
      WHEN p_period = 'day' THEN v_start_date - INTERVAL '1 day'
      WHEN p_period = 'week' THEN v_start_date - INTERVAL '7 days'
      WHEN p_period = 'month' THEN v_start_date - INTERVAL '30 days'
      ELSE v_start_date - INTERVAL '30 days'
    END;

    RETURN QUERY
    SELECT 
      (SELECT COUNT(*) FROM public.organizations) AS total_orgs,
      (SELECT COUNT(*) FROM public.stores) AS total_stores,
      (SELECT COUNT(DISTINCT p.user_id) FROM public.profiles p 
       JOIN public.user_roles ur ON ur.user_id = p.user_id 
       WHERE ur.role != 'super_admin'::public.app_role) AS total_users,
      (SELECT COUNT(DISTINCT p.user_id) FROM public.profiles p 
       JOIN public.user_roles ur ON ur.user_id = p.user_id 
       WHERE ur.role != 'super_admin'::public.app_role AND p.is_active = true) AS total_active_users,
      COUNT(DISTINCT s.id) AS total_transactions,
      COALESCE(SUM(s.total_amount), 0) AS total_sales,
      COALESCE(SUM(e.amount), 0) AS total_expenses,
      COALESCE(SUM(s.total_amount), 0) - COALESCE(SUM(e.amount), 0) AS net_revenue,
      CASE WHEN COUNT(DISTINCT s.id) > 0 
        THEN COALESCE(SUM(s.total_amount), 0) / COUNT(DISTINCT s.id)
        ELSE 0 END AS avg_basket,
      COALESCE(SUM(si.total_cost), 0) AS total_cost,
      COALESCE(SUM(s.total_amount), 0) - COALESCE(SUM(si.total_cost), 0) AS gross_margin,
      CASE WHEN COALESCE(SUM(s.total_amount), 0) > 0
        THEN (COALESCE(SUM(s.total_amount), 0) - COALESCE(SUM(si.total_cost), 0)) / SUM(s.total_amount) * 100
        ELSE 0 END AS gross_margin_pct,
      (SELECT COUNT(*) FROM public.customers) AS total_customers,
      (SELECT COUNT(*) FROM public.products) AS total_products,
      (SELECT COUNT(*) FROM public.products WHERE is_active = true) AS total_active_products,
      (SELECT COUNT(*) FROM public.products WHERE stock_quantity <= min_stock_alert) AS low_stock_count,
      (SELECT COALESCE(SUM(total_amount), 0) FROM public.sales 
       WHERE created_at >= v_prev_start_date AND created_at < v_prev_end_date) AS previous_period_sales,
      CASE 
        WHEN (SELECT COALESCE(SUM(total_amount), 0) FROM public.sales 
              WHERE created_at >= v_prev_start_date AND created_at < v_prev_end_date) > 0
        THEN ((COALESCE(SUM(s.total_amount), 0) - (SELECT COALESCE(SUM(total_amount), 0) FROM public.sales 
              WHERE created_at >= v_prev_start_date AND created_at < v_prev_end_date)) 
              / (SELECT COALESCE(SUM(total_amount), 0) FROM public.sales 
              WHERE created_at >= v_prev_start_date AND created_at < v_prev_end_date)) * 100
        ELSE 0 
      END AS sales_growth_pct
    FROM public.sales s
    LEFT JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.expenses e ON e.organization_id = s.organization_id AND e.created_at >= v_start_date
    WHERE s.created_at >= v_start_date
    AND public.is_super_admin();
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_global_kpis(TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 5. get_admin_product_ranking_detailed
--    Top ET bad products avec détails complets (stock, marge, % du CA)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_admin_product_ranking_detailed(
  p_period TEXT DEFAULT 'month',
  p_organization_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  org_name TEXT,
  category_name TEXT,
  quantity_sold BIGINT,
  revenue NUMERIC,
  cost NUMERIC,
  margin NUMERIC,
  margin_pct NUMERIC,
  stock_quantity NUMERIC,
  revenue_pct_of_total NUMERIC,
  rank_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    v_start_date TIMESTAMPTZ;
    v_total_revenue NUMERIC;
  BEGIN
    v_start_date := CASE 
      WHEN p_period = 'day' THEN date_trunc('day', NOW()) - INTERVAL '1 day'
      WHEN p_period = 'week' THEN date_trunc('week', NOW()) - INTERVAL '7 days'
      WHEN p_period = 'month' THEN date_trunc('month', NOW()) - INTERVAL '30 days'
      ELSE date_trunc('month', NOW()) - INTERVAL '30 days'
    END;

    -- Calculer le CA total pour les pourcentages
    SELECT COALESCE(SUM(si.quantity * si.unit_price), 0) INTO v_total_revenue
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.created_at >= v_start_date
      AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
      AND public.is_super_admin();

    RETURN QUERY
    WITH product_stats AS (
      SELECT 
        pr.id AS product_id,
        pr.name AS product_name,
        o.name AS org_name,
        COALESCE(cat.name, '—') AS category_name,
        COALESCE(SUM(si.quantity), 0) AS quantity_sold,
        COALESCE(SUM(si.quantity * si.unit_price), 0) AS revenue,
        COALESCE(SUM(si.quantity * si.cost_price), 0) AS cost,
        COALESCE(SUM(si.quantity * si.unit_price), 0) - COALESCE(SUM(si.quantity * si.cost_price), 0) AS margin,
        pr.stock_quantity,
        o.id AS org_id
      FROM public.products pr
      LEFT JOIN public.sale_items si ON si.product_id = pr.id
      LEFT JOIN public.sales s ON s.id = si.sale_id AND s.created_at >= v_start_date
      LEFT JOIN public.organizations o ON o.id = pr.organization_id
      LEFT JOIN public.categories cat ON cat.id = pr.category_id
      WHERE public.is_super_admin()
        AND (p_organization_id IS NULL OR pr.organization_id = p_organization_id)
      GROUP BY pr.id, pr.name, o.name, cat.name, pr.stock_quantity, o.id
    )
    SELECT 
      ps.product_id,
      ps.product_name,
      ps.org_name,
      ps.category_name,
      ps.quantity_sold,
      ps.revenue,
      ps.cost,
      ps.margin,
      CASE WHEN ps.revenue > 0 THEN (ps.margin / ps.revenue) * 100 ELSE 0 END AS margin_pct,
      ps.stock_quantity,
      CASE WHEN v_total_revenue > 0 THEN (ps.revenue / v_total_revenue) * 100 ELSE 0 END AS revenue_pct_of_total,
      CASE 
        WHEN ROW_NUMBER() OVER (ORDER BY ps.revenue DESC) <= p_limit THEN 'top'
        WHEN ROW_NUMBER() OVER (ORDER BY ps.revenue ASC) <= p_limit THEN 'bad'
        ELSE NULL
      END AS rank_type
    FROM product_stats ps
    WHERE ROW_NUMBER() OVER (ORDER BY ps.revenue DESC) <= p_limit
       OR ROW_NUMBER() OVER (ORDER BY ps.revenue ASC) <= p_limit
    ORDER BY ps.revenue DESC;
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_product_ranking_detailed(TEXT, UUID, INTEGER) TO authenticated;

-- Vérification
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'RPCs Admin Analytics créés :';
  RAISE NOTICE '- get_admin_users_per_org()';
  RAISE NOTICE '- get_admin_seller_performance(TEXT, UUID)';
  RAISE NOTICE '- get_admin_org_kpis(TEXT)';
  RAISE NOTICE '- get_admin_global_kpis(TEXT)';
  RAISE NOTICE '- get_admin_product_ranking_detailed(TEXT, UUID, INTEGER)';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
