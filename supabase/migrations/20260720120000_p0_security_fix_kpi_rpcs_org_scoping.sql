-- ════════════════════════════════════════════════════════════════
-- P0 Security Fix: cross-tenant IDOR in KPI read RPCs
-- Date: 2026-07-20
--
-- get_enhanced_dashboard_stats, get_seller_kpis_detailed, get_category_kpis
-- (added 2026-07-19) and get_product_kpis_by_period (fixed 2026-07-19) all did
-- `v_org_id := p_organization_id;` — trusting the org UUID sent by the client
-- with NO verification. Since these are SECURITY DEFINER (bypass RLS), any
-- authenticated user of ANY organization could pass another org's UUID (or
-- NULL) and read that org's revenue, margin, stock and seller data.
--
-- FIX: mirror the pattern from 20260702090000_p0_security_remove_client_identity_params.sql —
--   - super_admin: may pass p_organization_id (including NULL for "all orgs"),
--     verified server-side via public.is_super_admin().
--   - everyone else: p_organization_id is ignored; v_org_id is forced to
--     public.get_user_organization_id().
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
  SELECT
    COALESCE(SUM(s.total_amount), 0)::NUMERIC,
    COUNT(DISTINCT s.id)::BIGINT,
    COALESCE(SUM(si.quantity), 0)::BIGINT,
    CASE WHEN COUNT(DISTINCT s.id) > 0 THEN COALESCE(SUM(s.total_amount), 0) / COUNT(DISTINCT s.id) ELSE 0 END::NUMERIC,
    CASE WHEN COUNT(DISTINCT s.id) > 0 THEN COALESCE(SUM(si.quantity), 0)::NUMERIC / COUNT(DISTINCT s.id) ELSE 0 END::NUMERIC,
    COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END), 0)::NUMERIC,
    COUNT(DISTINCT CASE WHEN s.payment_method = 'cash' THEN s.id END)::BIGINT,
    COALESCE(SUM(CASE WHEN s.payment_method IN ('wave', 'orange_money', 'mtn_money', 'moov_money') THEN s.total_amount ELSE 0 END), 0)::NUMERIC,
    COUNT(DISTINCT CASE WHEN s.payment_method IN ('wave', 'orange_money', 'mtn_money', 'moov_money') THEN s.id END)::BIGINT,
    COALESCE(SUM(CASE WHEN s.payment_method = 'credit' THEN s.total_amount ELSE 0 END), 0)::NUMERIC,
    COUNT(DISTINCT CASE WHEN s.payment_method = 'credit' THEN s.id END)::BIGINT,
    COALESCE(SUM(s.discount_amount), 0)::NUMERIC,
    COALESCE(SUM(s.tax_amount), 0)::NUMERIC,
    (COALESCE(SUM(s.total_amount), 0) - COALESCE(SUM(si.quantity * COALESCE(si.cost_price, 0)), 0))::NUMERIC,
    COALESCE(SUM(si.quantity * COALESCE(si.cost_price, 0)), 0)::NUMERIC,
    COUNT(DISTINCT s.customer_name)::BIGINT,
    (SELECT COUNT(*) FROM public.products p WHERE (v_org_id IS NULL OR p.organization_id = v_org_id) AND p.is_active = true AND p.stock_quantity <= p.min_stock_alert AND p.stock_quantity > 0)::BIGINT,
    (SELECT COUNT(*) FROM public.products p WHERE (v_org_id IS NULL OR p.organization_id = v_org_id) AND p.is_active = true AND p.stock_quantity <= 0)::BIGINT
  FROM public.sales s
  LEFT JOIN public.sale_items si ON si.sale_id = s.id
  WHERE s.created_at >= v_start_date
    AND s.created_at <= v_end_date
    AND (v_org_id IS NULL OR s.organization_id = v_org_id);
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
  WITH seller_sales AS (
    SELECT s.user_id AS seller_id,
      COUNT(DISTINCT s.id) AS total_sales,
      COALESCE(SUM(s.total_amount), 0) AS total_amount,
      COALESCE(SUM(si.quantity), 0) AS total_products_sold,
      MAX(s.created_at) AS last_sale_at
    FROM public.sales s
    LEFT JOIN public.sale_items si ON si.sale_id = s.id
    WHERE s.created_at >= v_start_date AND s.created_at <= v_end_date
      AND (v_org_id IS NULL OR s.organization_id = v_org_id)
    GROUP BY s.user_id
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

-- 3. get_category_kpis
CREATE OR REPLACE FUNCTION public.get_category_kpis(
  p_period TEXT DEFAULT 'month',
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  category_color TEXT,
  category_icon TEXT,
  quantity_sold BIGINT,
  revenue NUMERIC,
  cost NUMERIC,
  margin NUMERIC,
  margin_pct NUMERIC,
  sales_count BIGINT,
  revenue_pct NUMERIC,
  top_product_name TEXT,
  products_in_category BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_org_id UUID;
  v_total_revenue NUMERIC;
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

  SELECT COALESCE(SUM(si.quantity * si.unit_price), 0) INTO v_total_revenue
  FROM public.sale_items si
  INNER JOIN public.sales s ON s.id = si.sale_id
  WHERE s.created_at >= v_start_date AND s.created_at <= v_end_date
    AND (v_org_id IS NULL OR s.organization_id = v_org_id);

  RETURN QUERY
  WITH filtered_sales AS (
    SELECT si.product_id, si.quantity, si.unit_price, si.cost_price, si.sale_id
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE s.created_at >= v_start_date AND s.created_at <= v_end_date
      AND (v_org_id IS NULL OR s.organization_id = v_org_id)
  ),
  category_sales AS (
    SELECT COALESCE(pr.category_id, '00000000-0000-0000-0000-000000000000'::UUID) AS category_id,
      COALESCE(SUM(fs.quantity), 0) AS quantity_sold,
      COALESCE(SUM(fs.quantity * fs.unit_price), 0) AS revenue,
      COALESCE(SUM(fs.quantity * COALESCE(fs.cost_price, 0)), 0) AS cost,
      COUNT(DISTINCT fs.sale_id) AS sales_count
    FROM filtered_sales fs
    LEFT JOIN public.products pr ON pr.id = fs.product_id
    GROUP BY COALESCE(pr.category_id, '00000000-0000-0000-0000-000000000000'::UUID)
  ),
  category_top_products AS (
    SELECT COALESCE(pr.category_id, '00000000-0000-0000-0000-000000000000'::UUID) AS category_id,
      si.product_name,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(pr.category_id, '00000000-0000-0000-0000-000000000000'::UUID) ORDER BY SUM(si.quantity) DESC) AS rn
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE s.created_at >= v_start_date AND s.created_at <= v_end_date
      AND (v_org_id IS NULL OR s.organization_id = v_org_id)
    GROUP BY COALESCE(pr.category_id, '00000000-0000-0000-0000-000000000000'::UUID), si.product_name
  )
  SELECT cat.id, COALESCE(cat.name, 'Sans catégorie'), cat.color, cat.icon,
    COALESCE(cs.quantity_sold, 0)::BIGINT, COALESCE(cs.revenue, 0)::NUMERIC,
    COALESCE(cs.cost, 0)::NUMERIC, (COALESCE(cs.revenue, 0) - COALESCE(cs.cost, 0))::NUMERIC,
    CASE WHEN COALESCE(cs.revenue, 0) > 0 THEN ((COALESCE(cs.revenue, 0) - COALESCE(cs.cost, 0)) / cs.revenue) * 100 ELSE 0 END::NUMERIC,
    COALESCE(cs.sales_count, 0)::BIGINT,
    CASE WHEN v_total_revenue > 0 THEN (COALESCE(cs.revenue, 0) / v_total_revenue) * 100 ELSE 0 END::NUMERIC,
    COALESCE(ctp.product_name, '—'),
    (SELECT COUNT(*) FROM public.products p WHERE p.category_id = cat.id AND (v_org_id IS NULL OR p.organization_id = v_org_id) AND p.is_active = true)::BIGINT
  FROM public.categories cat
  LEFT JOIN category_sales cs ON cs.category_id = cat.id
  LEFT JOIN category_top_products ctp ON ctp.category_id = cat.id AND ctp.rn = 1
  WHERE (v_org_id IS NULL OR cat.organization_id = v_org_id)
  ORDER BY cs.revenue DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_category_kpis(TEXT, UUID) TO authenticated;

-- 4. get_product_kpis_by_period (same flaw, deployed 2026-07-19 as well)
CREATE OR REPLACE FUNCTION public.get_product_kpis_by_period(
  p_period TEXT DEFAULT 'month',
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  category_name TEXT,
  quantity_sold BIGINT,
  revenue NUMERIC,
  cost NUMERIC,
  margin NUMERIC,
  margin_pct NUMERIC,
  stock_quantity NUMERIC,
  revenue_pct_of_total NUMERIC,
  rank_type TEXT,
  org_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_org_id UUID;
  v_total_revenue NUMERIC;
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

  -- CA total pour les pourcentages
  SELECT COALESCE(SUM(si.quantity * si.unit_price), 0) INTO v_total_revenue
  FROM public.sale_items si
  INNER JOIN public.sales s ON s.id = si.sale_id
  WHERE s.created_at >= v_start_date
    AND s.created_at <= v_end_date
    AND (v_org_id IS NULL OR s.organization_id = v_org_id);

  RETURN QUERY
  WITH
  filtered_sales AS (
    SELECT si.product_id, si.quantity, si.unit_price, si.cost_price
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE s.created_at >= v_start_date
      AND s.created_at <= v_end_date
      AND (v_org_id IS NULL OR s.organization_id = v_org_id)
  ),
  product_sales AS (
    SELECT
      fs.product_id,
      COALESCE(SUM(fs.quantity), 0) AS quantity_sold,
      COALESCE(SUM(fs.quantity * fs.unit_price), 0) AS revenue,
      COALESCE(SUM(fs.quantity * COALESCE(fs.cost_price, 0)), 0) AS cost
    FROM filtered_sales fs
    GROUP BY fs.product_id
  ),
  all_products AS (
    SELECT
      pr.id AS product_id,
      pr.name AS product_name,
      COALESCE(cat.name, '—') AS category_name,
      COALESCE(ps.quantity_sold, 0) AS quantity_sold,
      COALESCE(ps.revenue, 0) AS revenue,
      COALESCE(ps.cost, 0) AS cost,
      COALESCE(ps.revenue, 0) - COALESCE(ps.cost, 0) AS margin,
      CASE WHEN COALESCE(ps.revenue, 0) > 0
        THEN ((COALESCE(ps.revenue, 0) - COALESCE(ps.cost, 0)) / ps.revenue) * 100
        ELSE 0
      END AS margin_pct,
      pr.stock_quantity,
      CASE WHEN v_total_revenue > 0
        THEN (COALESCE(ps.revenue, 0) / v_total_revenue) * 100
        ELSE 0
      END AS revenue_pct_of_total,
      o.name AS org_name
    FROM public.products pr
    LEFT JOIN product_sales ps ON ps.product_id = pr.id
    LEFT JOIN public.categories cat ON cat.id = pr.category_id
    LEFT JOIN public.organizations o ON o.id = pr.organization_id
    WHERE (v_org_id IS NULL OR pr.organization_id = v_org_id)
      AND pr.is_active = true
  ),
  ranked_products AS (
    SELECT
      ap.*,
      ROW_NUMBER() OVER (ORDER BY ap.quantity_sold DESC, ap.revenue DESC) AS rank_top,
      ROW_NUMBER() OVER (ORDER BY ap.quantity_sold ASC, ap.revenue ASC) AS rank_bad
    FROM all_products ap
  )
  SELECT
    rp.product_id,
    rp.product_name,
    rp.category_name,
    rp.quantity_sold,
    rp.revenue,
    rp.cost,
    rp.margin,
    rp.margin_pct,
    rp.stock_quantity,
    rp.revenue_pct_of_total,
    CASE
      WHEN rp.rank_top <= 5 THEN 'top'
      WHEN rp.rank_bad <= 5 THEN 'bad'
      ELSE NULL
    END AS rank_type,
    rp.org_name
  FROM ranked_products rp
  WHERE rp.rank_top <= 5 OR rp.rank_bad <= 5
  ORDER BY rp.rank_top;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_kpis_by_period(TEXT, UUID) TO authenticated;
