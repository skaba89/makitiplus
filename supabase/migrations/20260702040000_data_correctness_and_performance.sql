-- ============================================================
-- Phase 5: Data correctness & performance improvements
-- ============================================================
-- 1. get_low_stock_products: products where stock <= min_stock_alert (cross-column comparison impossible in PostgREST)
-- 2. get_product_stats: aggregate counts for Products page (replaces fetchAllRows)
-- 3. get_reports_stats: aggregated sales/expenses for Reports page (replaces fetchAllRows + client reduce)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. get_low_stock_products(p_organization_id, p_limit)
--    Returns products where stock_quantity <= min_stock_alert,
--    or stock_quantity <= 5 if min_stock_alert is NULL.
--    This replaces the hardcoded `.lte("stock_quantity", 5)` in Dashboard.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_low_stock_products(
  p_organization_id UUID,
  p_limit INT DEFAULT 6
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  stock_quantity INT,
  min_stock_alert INT,
  category_icon TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.stock_quantity,
    p.min_stock_alert,
    c.icon AS category_icon
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.is_active = true
    AND p.organization_id = p_organization_id
    AND (
      (p.min_stock_alert IS NOT NULL AND p.stock_quantity <= p.min_stock_alert)
      OR
      (p.min_stock_alert IS NULL AND p.stock_quantity <= 5)
    )
  ORDER BY p.stock_quantity ASC
  LIMIT p_limit;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. get_product_stats(p_organization_id)
--    Returns aggregate counts for the Products page header:
--    total products, low stock count, out of stock count,
--    and category_counts (for filter buttons).
--    Replaces fetchAllRows + client-side filter on Products page.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_stats(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_low_stock BIGINT;
  v_out_of_stock BIGINT;
  v_category_counts JSONB;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE
      (min_stock_alert IS NOT NULL AND stock_quantity <= min_stock_alert)
      OR
      (min_stock_alert IS NULL AND stock_quantity <= 5)
    ),
    COUNT(*) FILTER (WHERE stock_quantity = 0)
  INTO v_total, v_low_stock, v_out_of_stock
  FROM products
  WHERE organization_id = p_organization_id;

  -- Category counts for filter buttons
  SELECT COALESCE(jsonb_object_agg(category_id::text, cnt), '{}'::jsonb)
  INTO v_category_counts
  FROM (
    SELECT category_id, COUNT(*) AS cnt
    FROM products
    WHERE organization_id = p_organization_id
      AND category_id IS NOT NULL
    GROUP BY category_id
  ) sub;

  RETURN jsonb_build_object(
    'totalProducts', v_total,
    'lowStockCount', v_low_stock,
    'outOfStockCount', v_out_of_stock,
    'categoryCounts', v_category_counts
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. get_reports_stats(p_organization_id, p_start, p_end)
--    Returns aggregated sales + expenses data for the Reports page.
--    Replaces fetchAllRows + client-side reduce() for sales/expenses.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_reports_stats(
  p_organization_id UUID,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_sales NUMERIC := 0;
  v_total_transactions BIGINT := 0;
  v_total_expenses NUMERIC := 0;
  v_expense_count BIGINT := 0;
  v_payment_breakdown JSONB;
  v_daily_sales JSONB;
  v_top_products JSONB;
BEGIN
  -- Sales aggregation
  SELECT
    COALESCE(SUM(total_amount), 0),
    COUNT(*)
  INTO v_total_sales, v_total_transactions
  FROM sales
  WHERE organization_id = p_organization_id
    AND created_at >= p_start
    AND created_at <= p_end;

  -- Expenses aggregation
  SELECT
    COALESCE(SUM(amount), 0),
    COUNT(*)
  INTO v_total_expenses, v_expense_count
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= p_start::date
    AND expense_date <= p_end::date;

  -- Payment method breakdown
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', payment_method,
    'value', method_total
  )), '[]'::jsonb)
  INTO v_payment_breakdown
  FROM (
    SELECT payment_method, SUM(total_amount) AS method_total
    FROM sales
    WHERE organization_id = p_organization_id
      AND created_at >= p_start
      AND created_at <= p_end
    GROUP BY payment_method
  ) sub;

  -- Daily sales for chart
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day::text,
    'sales', day_total,
    'transactions', day_count
  )), '[]'::jsonb)
  INTO v_daily_sales
  FROM (
    SELECT
      d.day::text,
      COALESCE(SUM(s.total_amount), 0) AS day_total,
      COUNT(s.id) AS day_count
    FROM generate_series(
      p_start::date,
      p_end::date,
      '1 day'::interval
    ) AS d(day)
    LEFT JOIN sales s ON s.organization_id = p_organization_id
      AND s.created_at >= d.day
      AND s.created_at < d.day + interval '1 day'
    GROUP BY d.day
    ORDER BY d.day
  ) daily;

  -- Top 5 products by quantity sold
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', product_name,
    'quantity', total_qty,
    'revenue', total_rev
  )), '[]'::jsonb)
  INTO v_top_products
  FROM (
    SELECT
      si.product_name,
      SUM(si.quantity) AS total_qty,
      SUM(si.total_price) AS total_rev
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_organization_id
      AND s.created_at >= p_start
      AND s.created_at <= p_end
    GROUP BY si.product_name
    ORDER BY total_qty DESC
    LIMIT 5
  ) top;

  RETURN jsonb_build_object(
    'totalSales', v_total_sales,
    'totalTransactions', v_total_transactions,
    'totalExpenses', v_total_expenses,
    'expenseCount', v_expense_count,
    'paymentBreakdown', v_payment_breakdown,
    'dailySales', v_daily_sales,
    'topProducts', v_top_products
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. get_next_category_sort_order(p_organization_id)
--    Atomically returns the next sort_order value for a new category.
--    Replaces the TOCTOU-prone SELECT MAX + INSERT pattern in Categories.tsx.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_next_category_sort_order(
  p_organization_id UUID
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_next INT;
BEGIN
  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next
  FROM categories
  WHERE organization_id = p_organization_id;

  RETURN v_next;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- GRANT permissions
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_low_stock_products(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reports_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_category_sort_order(UUID) TO authenticated;
