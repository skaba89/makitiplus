-- ════════════════════════════════════════════════════════════════
-- Fix: get_admin_org_kpis / get_admin_global_kpis — 2 bugs cumulés
-- Date: 2026-07-20
--
-- Bug 1 (column error): both functions reference `si.total_cost`, a column
-- that has never existed on public.sale_items (the real column is
-- `cost_price`, added by 20260719130000_add_sale_items_cost_price_snapshot.sql).
-- The RPC call errors out; the frontend (AdminAnalytics.tsx) swallows the
-- error and silently renders empty/zero KPIs — no visible crash, just
-- missing data.
--
-- Bug 2 (multi-way fan-out): get_admin_org_kpis joined
-- organizations × stores × sales × sale_items × expenses × customers × products
-- in a single FROM clause. Every LEFT JOIN on an independent 1-to-many
-- relation multiplies the row count, so SUM(s.total_amount) and
-- SUM(e.amount) were inflated by the product of unrelated join
-- cardinalities (store count × items per sale × expense count...).
-- get_admin_global_kpis had the same issue joining sale_items and expenses
-- to sales independently.
--
-- Fix: aggregate each source table separately (grouped by organization_id
-- for get_admin_org_kpis; ungrouped single-row aggregates for
-- get_admin_global_kpis), then join the pre-aggregated 1-row-per-org /
-- 1-row-total sets — no fan-out possible. Also fixes si.total_cost →
-- si.quantity * COALESCE(si.cost_price, 0).
-- ════════════════════════════════════════════════════════════════

-- 1. get_admin_org_kpis
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
  WITH store_agg AS (
    SELECT organization_id, COUNT(*) AS store_count, ARRAY_AGG(name) AS store_names
    FROM public.stores
    GROUP BY organization_id
  ),
  sales_agg AS (
    SELECT organization_id,
      COUNT(*) AS transaction_count,
      COALESCE(SUM(total_amount), 0) AS total_sales
    FROM public.sales
    WHERE created_at >= v_start_date
    GROUP BY organization_id
  ),
  sale_items_agg AS (
    SELECT s.organization_id,
      COALESCE(SUM(si.quantity * COALESCE(si.cost_price, 0)), 0) AS total_cost
    FROM public.sales s
    INNER JOIN public.sale_items si ON si.sale_id = s.id
    WHERE s.created_at >= v_start_date
    GROUP BY s.organization_id
  ),
  expenses_agg AS (
    SELECT organization_id, COALESCE(SUM(amount), 0) AS total_expenses
    FROM public.expenses
    WHERE created_at >= v_start_date
    GROUP BY organization_id
  ),
  customers_agg AS (
    SELECT organization_id, COUNT(*) AS customer_count
    FROM public.customers
    GROUP BY organization_id
  ),
  products_agg AS (
    SELECT organization_id,
      COUNT(*) FILTER (WHERE is_active = true) AS active_products,
      COUNT(*) FILTER (WHERE stock_quantity <= min_stock_alert) AS low_stock_count
    FROM public.products
    GROUP BY organization_id
  )
  SELECT
    o.id,
    o.name,
    COALESCE(sta.store_count, 0)::BIGINT,
    COALESCE(sa.transaction_count, 0)::BIGINT,
    COALESCE(sa.total_sales, 0)::NUMERIC,
    COALESCE(ea.total_expenses, 0)::NUMERIC,
    (COALESCE(sa.total_sales, 0) - COALESCE(ea.total_expenses, 0))::NUMERIC,
    CASE WHEN COALESCE(sa.transaction_count, 0) > 0 THEN sa.total_sales / sa.transaction_count ELSE 0 END::NUMERIC,
    COALESCE(sia.total_cost, 0)::NUMERIC,
    (COALESCE(sa.total_sales, 0) - COALESCE(sia.total_cost, 0))::NUMERIC,
    COALESCE(ca.customer_count, 0)::BIGINT,
    COALESCE(pa.active_products, 0)::BIGINT,
    COALESCE(pa.low_stock_count, 0)::BIGINT,
    COALESCE(sta.store_names, ARRAY[]::TEXT[])
  FROM public.organizations o
  LEFT JOIN store_agg sta ON sta.organization_id = o.id
  LEFT JOIN sales_agg sa ON sa.organization_id = o.id
  LEFT JOIN sale_items_agg sia ON sia.organization_id = o.id
  LEFT JOIN expenses_agg ea ON ea.organization_id = o.id
  LEFT JOIN customers_agg ca ON ca.organization_id = o.id
  LEFT JOIN products_agg pa ON pa.organization_id = o.id
  WHERE public.is_super_admin()
  ORDER BY COALESCE(sa.total_sales, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_org_kpis(TEXT) TO authenticated;

-- 2. get_admin_global_kpis
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
  v_prev_sales NUMERIC;
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

  IF NOT public.is_super_admin() THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_prev_sales
  FROM public.sales
  WHERE created_at >= v_prev_start_date AND created_at < v_prev_end_date;

  RETURN QUERY
  WITH sales_agg AS (
    SELECT COUNT(*) AS total_transactions, COALESCE(SUM(total_amount), 0) AS total_sales
    FROM public.sales
    WHERE created_at >= v_start_date
  ),
  sale_items_agg AS (
    SELECT COALESCE(SUM(si.quantity * COALESCE(si.cost_price, 0)), 0) AS total_cost
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE s.created_at >= v_start_date
  ),
  expenses_agg AS (
    SELECT COALESCE(SUM(amount), 0) AS total_expenses
    FROM public.expenses
    WHERE created_at >= v_start_date
  )
  SELECT
    (SELECT COUNT(*) FROM public.organizations)::BIGINT,
    (SELECT COUNT(*) FROM public.stores)::BIGINT,
    (SELECT COUNT(DISTINCT p.user_id) FROM public.profiles p
       JOIN public.user_roles ur ON ur.user_id = p.user_id
       WHERE ur.role != 'super_admin'::public.app_role)::BIGINT,
    (SELECT COUNT(DISTINCT p.user_id) FROM public.profiles p
       JOIN public.user_roles ur ON ur.user_id = p.user_id
       WHERE ur.role != 'super_admin'::public.app_role AND p.is_active = true)::BIGINT,
    sa.total_transactions::BIGINT,
    sa.total_sales::NUMERIC,
    ea.total_expenses::NUMERIC,
    (sa.total_sales - ea.total_expenses)::NUMERIC,
    CASE WHEN sa.total_transactions > 0 THEN sa.total_sales / sa.total_transactions ELSE 0 END::NUMERIC,
    sia.total_cost::NUMERIC,
    (sa.total_sales - sia.total_cost)::NUMERIC,
    CASE WHEN sa.total_sales > 0 THEN (sa.total_sales - sia.total_cost) / sa.total_sales * 100 ELSE 0 END::NUMERIC,
    (SELECT COUNT(*) FROM public.customers)::BIGINT,
    (SELECT COUNT(*) FROM public.products)::BIGINT,
    (SELECT COUNT(*) FROM public.products WHERE is_active = true)::BIGINT,
    (SELECT COUNT(*) FROM public.products WHERE stock_quantity <= min_stock_alert)::BIGINT,
    v_prev_sales::NUMERIC,
    CASE WHEN v_prev_sales > 0 THEN ((sa.total_sales - v_prev_sales) / v_prev_sales) * 100 ELSE 0 END::NUMERIC
  FROM sales_agg sa
  CROSS JOIN sale_items_agg sia
  CROSS JOIN expenses_agg ea;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_global_kpis(TEXT) TO authenticated;
