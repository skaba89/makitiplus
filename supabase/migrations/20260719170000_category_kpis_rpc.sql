-- ════════════════════════════════════════════════════════════════
-- Migration: Category KPIs — quantités + montants par catégorie
-- Date: 2026-07-19
-- ════════════════════════════════════════════════════════════════

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
  v_org_id := p_organization_id;
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
