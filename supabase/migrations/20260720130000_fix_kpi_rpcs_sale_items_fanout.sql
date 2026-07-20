-- ════════════════════════════════════════════════════════════════
-- Fix: fan-out bug in get_enhanced_dashboard_stats / get_seller_kpis_detailed
-- Date: 2026-07-20
--
-- Bug: both functions did `FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id`
-- and then `SUM(s.total_amount)`. Since a sale has N line items, s.total_amount
-- is repeated N times in the joined rowset, inflating total_sales_amount,
-- cash/mobile_money/credit amounts, total_discounts, total_tax, avg_basket
-- and gross_margin by roughly the average number of items per sale.
--
-- total_products_sold, total_transactions, total_cost were already correct
-- (they naturally aggregate at the sale_items grain or use COUNT(DISTINCT)).
--
-- Fix: aggregate sales and sale_items separately (1 row per sale each),
-- then join the two pre-aggregated 1:1 sets. Same pattern already used
-- correctly in get_reports_stats (20260712130000_enrich_reports_stats_with_margin.sql).
-- ════════════════════════════════════════════════════════════════

-- 1. get_enhanced_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_enhanced_dashboard_stats(
  p_period TEXT DEFAULT 'month',
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_sales_amount NUMERIC,
  total_transactions BIGINT,
  total_products_sold BIGINT,
  avg_basket NUMERIC,
  avg_products_per_sale NUMERIC,
  cash_amount NUMERIC,
  cash_count BIGINT,
  mobile_money_amount NUMERIC,
  mobile_money_count BIGINT,
  credit_amount NUMERIC,
  credit_count BIGINT,
  total_discounts NUMERIC,
  total_tax NUMERIC,
  gross_margin NUMERIC,
  total_cost NUMERIC,
  customers_served BIGINT,
  low_stock_count BIGINT,
  out_of_stock_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_org_id UUID;
BEGIN
  IF public.is_super_admin() THEN
    v_org_id := p_organization_id;
  ELSE
    v_org_id := public.get_user_organization_id();
  END IF;
  v_end_date := NOW();
  v_start_date := CASE
    WHEN p_period = 'day' THEN date_trunc('day', NOW())
    WHEN p_period = 'week' THEN date_trunc('week', NOW())
    WHEN p_period = 'month' THEN date_trunc('month', NOW())
    WHEN p_period = 'quarter' THEN date_trunc('quarter', NOW())
    WHEN p_period = 'year' THEN date_trunc('year', NOW())
    ELSE date_trunc('month', NOW())
  END;

  RETURN QUERY
  WITH sale_base AS (
    SELECT s.id, s.total_amount, s.payment_method, s.discount_amount, s.tax_amount, s.customer_name
    FROM public.sales s
    WHERE s.created_at >= v_start_date
      AND s.created_at <= v_end_date
      AND (v_org_id IS NULL OR s.organization_id = v_org_id)
  ),
  sale_items_agg AS (
    SELECT si.sale_id,
      SUM(si.quantity) AS quantity,
      SUM(si.quantity * COALESCE(si.cost_price, 0)) AS cost
    FROM public.sale_items si
    INNER JOIN sale_base sb ON sb.id = si.sale_id
    GROUP BY si.sale_id
  )
  SELECT
    COALESCE(SUM(b.total_amount), 0)::NUMERIC,
    COUNT(DISTINCT b.id)::BIGINT,
    COALESCE(SUM(ia.quantity), 0)::BIGINT,
    CASE WHEN COUNT(DISTINCT b.id) > 0 THEN COALESCE(SUM(b.total_amount), 0) / COUNT(DISTINCT b.id) ELSE 0 END::NUMERIC,
    CASE WHEN COUNT(DISTINCT b.id) > 0 THEN COALESCE(SUM(ia.quantity), 0)::NUMERIC / COUNT(DISTINCT b.id) ELSE 0 END::NUMERIC,
    COALESCE(SUM(CASE WHEN b.payment_method = 'cash' THEN b.total_amount ELSE 0 END), 0)::NUMERIC,
    COUNT(DISTINCT CASE WHEN b.payment_method = 'cash' THEN b.id END)::BIGINT,
    COALESCE(SUM(CASE WHEN b.payment_method IN ('wave', 'orange_money', 'mtn_money', 'moov_money') THEN b.total_amount ELSE 0 END), 0)::NUMERIC,
    COUNT(DISTINCT CASE WHEN b.payment_method IN ('wave', 'orange_money', 'mtn_money', 'moov_money') THEN b.id END)::BIGINT,
    COALESCE(SUM(CASE WHEN b.payment_method = 'credit' THEN b.total_amount ELSE 0 END), 0)::NUMERIC,
    COUNT(DISTINCT CASE WHEN b.payment_method = 'credit' THEN b.id END)::BIGINT,
    COALESCE(SUM(b.discount_amount), 0)::NUMERIC,
    COALESCE(SUM(b.tax_amount), 0)::NUMERIC,
    (COALESCE(SUM(b.total_amount), 0) - COALESCE(SUM(ia.cost), 0))::NUMERIC,
    COALESCE(SUM(ia.cost), 0)::NUMERIC,
    COUNT(DISTINCT b.customer_name)::BIGINT,
    (SELECT COUNT(*) FROM public.products p WHERE (v_org_id IS NULL OR p.organization_id = v_org_id) AND p.is_active = true AND p.stock_quantity <= p.min_stock_alert AND p.stock_quantity > 0)::BIGINT,
    (SELECT COUNT(*) FROM public.products p WHERE (v_org_id IS NULL OR p.organization_id = v_org_id) AND p.is_active = true AND p.stock_quantity <= 0)::BIGINT
  FROM sale_base b
  LEFT JOIN sale_items_agg ia ON ia.sale_id = b.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_enhanced_dashboard_stats(TEXT, UUID) TO authenticated;

-- 2. get_seller_kpis_detailed
CREATE OR REPLACE FUNCTION public.get_seller_kpis_detailed(
  p_period TEXT DEFAULT 'month',
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  seller_id UUID,
  seller_name TEXT,
  seller_role TEXT,
  org_name TEXT,
  total_sales BIGINT,
  total_amount NUMERIC,
  total_products_sold BIGINT,
  avg_basket NUMERIC,
  avg_products_per_sale NUMERIC,
  top_product_name TEXT,
  top_category_name TEXT,
  last_sale_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_org_id UUID;
BEGIN
  IF public.is_super_admin() THEN
    v_org_id := p_organization_id;
  ELSE
    v_org_id := public.get_user_organization_id();
  END IF;
  v_end_date := NOW();
  v_start_date := CASE
    WHEN p_period = 'day' THEN date_trunc('day', NOW())
    WHEN p_period = 'week' THEN date_trunc('week', NOW())
    WHEN p_period = 'month' THEN date_trunc('month', NOW())
    WHEN p_period = 'quarter' THEN date_trunc('quarter', NOW())
    WHEN p_period = 'year' THEN date_trunc('year', NOW())
    ELSE date_trunc('month', NOW())
  END;

  RETURN QUERY
  WITH sale_base AS (
    SELECT s.id, s.user_id, s.total_amount, s.created_at
    FROM public.sales s
    WHERE s.created_at >= v_start_date AND s.created_at <= v_end_date
      AND (v_org_id IS NULL OR s.organization_id = v_org_id)
  ),
  sale_items_agg AS (
    SELECT si.sale_id, SUM(si.quantity) AS quantity
    FROM public.sale_items si
    INNER JOIN sale_base sb ON sb.id = si.sale_id
    GROUP BY si.sale_id
  ),
  seller_sales AS (
    SELECT b.user_id AS seller_id,
      COUNT(DISTINCT b.id) AS total_sales,
      COALESCE(SUM(b.total_amount), 0) AS total_amount,
      COALESCE(SUM(ia.quantity), 0) AS total_products_sold,
      MAX(b.created_at) AS last_sale_at
    FROM sale_base b
    LEFT JOIN sale_items_agg ia ON ia.sale_id = b.id
    GROUP BY b.user_id
  ),
  seller_top_products AS (
    SELECT s.user_id AS seller_id, si.product_name,
      ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY SUM(si.quantity) DESC) AS rn
    FROM public.sales s
    INNER JOIN public.sale_items si ON si.sale_id = s.id
    WHERE s.created_at >= v_start_date AND s.created_at <= v_end_date
      AND (v_org_id IS NULL OR s.organization_id = v_org_id)
    GROUP BY s.user_id, si.product_name
  ),
  seller_top_categories AS (
    SELECT s.user_id AS seller_id, COALESCE(cat.name, '—') AS category_name,
      ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY SUM(si.quantity) DESC) AS rn
    FROM public.sales s
    INNER JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    LEFT JOIN public.categories cat ON cat.id = pr.category_id
    WHERE s.created_at >= v_start_date AND s.created_at <= v_end_date
      AND (v_org_id IS NULL OR s.organization_id = v_org_id)
    GROUP BY s.user_id, cat.name
  )
  SELECT p.user_id, COALESCE(p.owner_name, '—'), COALESCE(ur.role::text, '—'),
    COALESCE(o.name, ''), COALESCE(ss.total_sales, 0)::BIGINT,
    COALESCE(ss.total_amount, 0)::NUMERIC, COALESCE(ss.total_products_sold, 0)::BIGINT,
    CASE WHEN COALESCE(ss.total_sales, 0) > 0 THEN ss.total_amount / ss.total_sales ELSE 0 END::NUMERIC,
    CASE WHEN COALESCE(ss.total_sales, 0) > 0 THEN ss.total_products_sold::NUMERIC / ss.total_sales ELSE 0 END::NUMERIC,
    COALESCE(stp.product_name, '—'), COALESCE(stc.category_name, '—'),
    ss.last_sale_at, COALESCE(p.is_active, true)
  FROM public.profiles p
  LEFT JOIN seller_sales ss ON ss.seller_id = p.user_id
  LEFT JOIN seller_top_products stp ON stp.seller_id = p.user_id AND stp.rn = 1
  LEFT JOIN seller_top_categories stc ON stc.seller_id = p.user_id AND stc.rn = 1
  LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
  LEFT JOIN public.organizations o ON o.id = p.organization_id
  WHERE (v_org_id IS NULL OR p.organization_id = v_org_id)
    AND ss.total_sales IS NOT NULL
  ORDER BY ss.total_amount DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_kpis_detailed(TEXT, UUID) TO authenticated;
