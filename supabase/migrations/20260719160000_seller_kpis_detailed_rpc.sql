-- ════════════════════════════════════════════════════════════════
-- Migration: Seller KPIs Detailed — quantités + montants par vendeur
-- Date: 2026-07-19
-- ════════════════════════════════════════════════════════════════

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
