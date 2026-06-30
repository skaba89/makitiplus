-- Migration: Dashboard RPC aggregation — server-side stats calculation
-- Date: 2026-07-02
-- Replaces 7 separate client-side fetchAllRows + reduce() calls with a single RPC.
-- Dramatically reduces data transfer and improves Dashboard load time.
-- FULLY IDEMPOTENT

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'get_dashboard_stats'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_organization_id UUID DEFAULT NULL,
  p_day_start TIMESTAMPTZ DEFAULT NULL,
  p_day_end TIMESTAMPTZ DEFAULT NULL,
  p_month_start TIMESTAMPTZ DEFAULT NULL,
  p_month_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_org_filter TEXT;
BEGIN
  -- Build organization filter clause
  IF p_organization_id IS NOT NULL THEN
    v_org_filter := format('AND organization_id = %L', p_organization_id);
  ELSE
    v_org_filter := '';
  END IF;

  -- Single query with CTEs for all dashboard metrics
  EXECUTE format('
    SELECT jsonb_build_object(
      ''todaySales'', COALESCE(today_cte.total, 0),
      ''todayTransactions'', COALESCE(today_cte.count, 0),
      ''monthSales'', COALESCE(month_cte.total, 0),
      ''monthCreditCount'', COALESCE(month_cte.credit_count, 0),
      ''monthExpenses'', COALESCE(expense_cte.total, 0),
      ''totalProducts'', COALESCE(product_cte.total_count, 0),
      ''lowStockProducts'', COALESCE(product_cte.low_stock, 0),
      ''totalCredits'', COALESCE(credit_cte.total, 0),
      ''creditsCount'', COALESCE(credit_cte.count, 0)
    )
    FROM (
      -- Today''s sales
      SELECT
        SUM(total_amount) AS total,
        COUNT(*) AS count
      FROM sales
      WHERE created_at >= %L AND created_at <= %L %s
    ) today_cte,
    (
      -- Month''s sales
      SELECT
        SUM(total_amount) AS total,
        COUNT(*) FILTER (WHERE payment_method = ''credit'') AS credit_count
      FROM sales
      WHERE created_at >= %L AND created_at <= %L %s
    ) month_cte,
    (
      -- Month''s expenses
      SELECT SUM(amount) AS total
      FROM expenses
      WHERE expense_date >= %L AND expense_date <= %L %s
    ) expense_cte,
    (
      -- Products count + low stock
      SELECT
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(min_stock_alert, 5)) AS low_stock
      FROM products
      WHERE is_active = true %s
    ) product_cte,
    (
      -- Customer credits
      SELECT
        SUM(total_credit) AS total,
        COUNT(*) AS count
      FROM customers
      WHERE total_credit > 0 %s
    ) credit_cte
  ',
    p_day_start, p_day_end, v_org_filter,
    p_month_start, p_month_end, v_org_filter,
    p_month_start::date, p_month_end::date, v_org_filter,
    v_org_filter,
    v_org_filter
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ============================================
-- Top products RPC — server-side aggregation
-- ============================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'get_top_products'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_top_products(
  p_organization_id UUID DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(product_name TEXT, total_quantity BIGINT, total_revenue NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    si.product_name,
    SUM(si.quantity)::BIGINT AS total_quantity,
    SUM(si.total_price) AS total_revenue
  FROM sale_items si
  WHERE (p_since IS NULL OR si.created_at >= p_since)
    AND (p_organization_id IS NULL OR si.organization_id = p_organization_id)
  GROUP BY si.product_name
  ORDER BY total_quantity DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_products(UUID, TIMESTAMPTZ, INTEGER) TO authenticated;
