-- ============================================================
-- Admin Multi-Store Analytics RPCs
-- Cross-organization analytics for super_admin
-- ============================================================

-- 1. Get all stores with their sales summary for a given period
-- Returns: store name, category, total sales, transaction count, avg basket, total expenses
CREATE OR REPLACE FUNCTION public.get_admin_stores_summary(
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  store_category text,
  owner_name text,
  owner_phone text,
  city text,
  country text,
  total_sales numeric,
  transaction_count bigint,
  avg_basket numeric,
  total_expenses numeric,
  net_revenue numeric,
  product_count bigint,
  active_product_count bigint,
  customer_count bigint,
  low_stock_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  -- Determine date range
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  -- Only super_admin can call this
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    o.category::text AS store_category,
    p.owner_name,
    p.phone AS owner_phone,
    p.city,
    p.country,
    COALESCE(s_summary.total_sales, 0) AS total_sales,
    COALESCE(s_summary.transaction_count, 0) AS transaction_count,
    COALESCE(s_summary.avg_basket, 0) AS avg_basket,
    COALESCE(e_summary.total_expenses, 0) AS total_expenses,
    COALESCE(s_summary.total_sales, 0) - COALESCE(e_summary.total_expenses, 0) AS net_revenue,
    COALESCE(prod_summary.product_count, 0) AS product_count,
    COALESCE(prod_summary.active_product_count, 0) AS active_product_count,
    COALESCE(cust_summary.customer_count, 0) AS customer_count,
    COALESCE(prod_summary.low_stock_count, 0) AS low_stock_count
  FROM organizations o
  LEFT JOIN profiles p ON p.organization_id = o.id AND p.user_id = o.owner_user_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(s.total_amount) AS total_sales,
      COUNT(*) AS transaction_count,
      AVG(s.total_amount) AS avg_basket
    FROM sales s
    WHERE s.organization_id = o.id
      AND s.created_at >= v_start
      AND s.created_at < v_end
  ) s_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      SUM(e.amount) AS total_expenses
    FROM expenses e
    WHERE e.organization_id = o.id
      AND e.expense_date >= v_start::date
      AND e.expense_date < v_end::date
  ) e_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS product_count,
      COUNT(*) FILTER (WHERE pr.is_active = true) AS active_product_count,
      COUNT(*) FILTER (WHERE pr.is_active = true AND pr.stock_quantity <= COALESCE(pr.min_stock_alert, 5)) AS low_stock_count
    FROM products pr
    WHERE pr.organization_id = o.id
  ) prod_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS customer_count
    FROM customers c
    WHERE c.organization_id = o.id
  ) cust_summary ON true
  ORDER BY COALESCE(s_summary.total_sales, 0) DESC;
END;
$$;


-- 2. Get top/bad articles for a specific store (or all stores)
-- Top = highest revenue; Bad = lowest revenue (or zero sales)
CREATE OR REPLACE FUNCTION public.get_admin_article_ranking(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_limit integer DEFAULT 10,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  product_id uuid,
  product_name text,
  category_name text,
  quantity_sold bigint,
  total_revenue numeric,
  unit_price numeric,
  cost_price numeric,
  margin numeric,
  current_stock integer,
  ranking_category text  -- 'top' or 'bad'
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  -- Top articles (highest revenue)
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    si.product_id,
    si.product_name,
    COALESCE(c.name, 'Sans catégorie') AS category_name,
    SUM(si.quantity) AS quantity_sold,
    SUM(si.total_price) AS total_revenue,
    si.unit_price,
    COALESCE(pr.cost_price, 0) AS cost_price,
    si.unit_price - COALESCE(pr.cost_price, 0) AS margin,
    COALESCE(pr.stock_quantity, 0) AS current_stock,
    'top'::text AS ranking_category
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  JOIN organizations o ON o.id = si.organization_id
  LEFT JOIN products pr ON pr.id = si.product_id
  LEFT JOIN categories c ON c.id = pr.category_id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR si.organization_id = p_organization_id)
  GROUP BY o.id, o.name, si.product_id, si.product_name, c.name, si.unit_price, pr.cost_price, pr.stock_quantity
  ORDER BY SUM(si.total_price) DESC
  LIMIT p_limit;

  -- Bad articles (products with zero or lowest sales in period)
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    pr.id AS product_id,
    pr.name AS product_name,
    COALESCE(c.name, 'Sans catégorie') AS category_name,
    COALESCE(sold.qty, 0) AS quantity_sold,
    COALESCE(sold.revenue, 0) AS total_revenue,
    pr.price AS unit_price,
    COALESCE(pr.cost_price, 0) AS cost_price,
    pr.price - COALESCE(pr.cost_price, 0) AS margin,
    pr.stock_quantity AS current_stock,
    'bad'::text AS ranking_category
  FROM products pr
  JOIN organizations o ON o.id = pr.organization_id
  LEFT JOIN categories c ON c.id = pr.category_id
  LEFT JOIN LATERAL (
    SELECT SUM(si2.quantity) AS qty, SUM(si2.total_price) AS revenue
    FROM sale_items si2
    JOIN sales s2 ON s2.id = si2.sale_id
    WHERE si2.product_id = pr.id
      AND s2.created_at >= v_start
      AND s2.created_at < v_end
  ) sold ON true
  WHERE pr.is_active = true
    AND (p_organization_id IS NULL OR pr.organization_id = p_organization_id)
  ORDER BY COALESCE(sold.revenue, 0) ASC, pr.stock_quantity DESC
  LIMIT p_limit;
END;
$$;


-- 3. Get stock movements for a specific store (or all stores)
CREATE OR REPLACE FUNCTION public.get_admin_stock_movements(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_limit integer DEFAULT 50,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  movement_id uuid,
  product_id uuid,
  product_name text,
  movement_type text,
  quantity integer,
  previous_quantity integer,
  new_quantity integer,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    sm.id AS movement_id,
    sm.product_id,
    COALESCE(pr.name, 'Produit supprimé') AS product_name,
    sm.type AS movement_type,
    sm.quantity,
    sm.previous_quantity,
    sm.new_quantity,
    sm.reason,
    sm.created_at
  FROM stock_movements sm
  JOIN organizations o ON o.id = sm.organization_id
  LEFT JOIN products pr ON pr.id = sm.product_id
  WHERE sm.created_at >= v_start
    AND sm.created_at < v_end
    AND (p_organization_id IS NULL OR sm.organization_id = p_organization_id)
  ORDER BY sm.created_at DESC
  LIMIT p_limit;
END;
$$;


-- 4. Get daily sales trend across all stores (or a specific store)
CREATE OR REPLACE FUNCTION public.get_admin_sales_trend(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  date text,
  organization_id uuid,
  store_name text,
  total_sales numeric,
  transaction_count bigint,
  avg_basket numeric
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD') AS date,
    o.id AS organization_id,
    o.name AS store_name,
    SUM(s.total_amount) AS total_sales,
    COUNT(*) AS transaction_count,
    AVG(s.total_amount) AS avg_basket
  FROM sales s
  JOIN organizations o ON o.id = s.organization_id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  GROUP BY date_trunc('day', s.created_at), o.id, o.name
  ORDER BY date_trunc('day', s.created_at) ASC, SUM(s.total_amount) DESC;
END;
$$;


-- 5. Get payment method distribution across all stores
CREATE OR REPLACE FUNCTION public.get_admin_payment_distribution(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  payment_method text,
  total_amount numeric,
  transaction_count bigint,
  percentage numeric
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_total numeric;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  -- Get total for percentage calculation
  SELECT COALESCE(SUM(s.total_amount), 0) INTO v_total
  FROM sales s
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id);

  RETURN QUERY
  SELECT
    s.payment_method::text AS payment_method,
    SUM(s.total_amount) AS total_amount,
    COUNT(*) AS transaction_count,
    CASE WHEN v_total > 0 THEN ROUND((SUM(s.total_amount) / v_total) * 100, 1) ELSE 0 END AS percentage
  FROM sales s
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  GROUP BY s.payment_method
  ORDER BY SUM(s.total_amount) DESC;
END;
$$;


-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_admin_stores_summary(text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_article_ranking(uuid, text, integer, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_stock_movements(uuid, text, integer, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_sales_trend(uuid, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_distribution(uuid, text, timestamptz, timestamptz) TO authenticated;
