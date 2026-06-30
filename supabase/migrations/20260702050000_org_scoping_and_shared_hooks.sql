-- ============================================================
-- Phase 6: Organization scoping, stats RPCs, shared hooks
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. get_customer_stats(p_organization_id)
--    Returns total customers count and aggregate credit info.
--    Replaces pageSize:1000 + client-side reduce() in Customers page.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_customer_stats(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_total_credit NUMERIC;
  v_customers_with_credit BIGINT;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(SUM(total_credit), 0),
    COUNT(*) FILTER (WHERE total_credit > 0)
  INTO v_total, v_total_credit, v_customers_with_credit
  FROM customers
  WHERE organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'totalCustomers', v_total,
    'totalCredit', v_total_credit,
    'customersWithCredit', v_customers_with_credit
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. get_expense_stats(p_organization_id)
--    Returns aggregate expense stats for the current month.
--    Replaces pageSize:1000 + client-side reduce() in Expenses page.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_expense_stats(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_month_total NUMERIC;
  v_month_count BIGINT;
BEGIN
  -- Total expenses
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_total, v_month_total
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= date_trunc('month', CURRENT_DATE)
    AND expense_date < date_trunc('month', CURRENT_DATE) + interval '1 month';

  v_month_count := v_total;

  RETURN jsonb_build_object(
    'monthTotal', v_month_total,
    'monthCount', v_month_count
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. get_categories(p_organization_id)
--    Returns all categories for an org with product counts.
--    Single source of truth — replaces 4 duplicate queries
--    across POS, Products, Categories, and ProductForm pages.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_categories(
  p_organization_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  icon TEXT,
  color TEXT,
  description TEXT,
  sort_order INT,
  is_default BOOLEAN,
  product_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.icon,
    c.color,
    c.description,
    c.sort_order,
    c.is_default,
    COALESCE(pc.cnt, 0) AS product_count
  FROM categories c
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM products p
    WHERE p.category_id = c.id
      AND p.organization_id = p_organization_id
  ) pc ON true
  WHERE c.organization_id = p_organization_id
  ORDER BY c.sort_order ASC NULLS LAST, c.name ASC;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- GRANT permissions
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_customer_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_expense_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_categories(UUID) TO authenticated;
