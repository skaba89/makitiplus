-- ════════════════════════════════════════════════════════════════
-- Migration: Product KPIs RPC — CORRIGÉ (jointure + 5/5 au lieu de 10/10)
-- Date: 2026-07-19
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_product_kpis_by_period(TEXT, UUID);

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
  v_org_id := COALESCE(p_organization_id, public.get_user_organization_id());
  v_end_date := NOW();
  v_start_date := CASE 
    WHEN p_period = 'day' THEN date_trunc('day', NOW())
    WHEN p_period = 'week' THEN date_trunc('week', NOW())
    WHEN p_period = 'month' THEN date_trunc('month', NOW())
    WHEN p_period = 'quarter' THEN date_trunc('quarter', NOW())
    WHEN p_period = 'year' THEN date_trunc('year', NOW())
    ELSE date_trunc('month', NOW())
  END;

  -- CA total pour les pourcentages (subquery filtrée par date)
  SELECT COALESCE(SUM(si.quantity * si.unit_price), 0) INTO v_total_revenue
  FROM public.sale_items si
  INNER JOIN public.sales s ON s.id = si.sale_id
  WHERE s.created_at >= v_start_date
    AND s.created_at <= v_end_date
    AND (v_org_id IS NULL OR s.organization_id = v_org_id);

  RETURN QUERY
  WITH 
  -- Subquery: sale_items filtrés par date et org
  filtered_sales AS (
    SELECT si.product_id, si.quantity, si.unit_price, si.cost_price
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE s.created_at >= v_start_date
      AND s.created_at <= v_end_date
      AND (v_org_id IS NULL OR s.organization_id = v_org_id)
  ),
  -- Agrégation par produit
  product_sales AS (
    SELECT 
      fs.product_id,
      COALESCE(SUM(fs.quantity), 0) AS quantity_sold,
      COALESCE(SUM(fs.quantity * fs.unit_price), 0) AS revenue,
      COALESCE(SUM(fs.quantity * COALESCE(fs.cost_price, 0)), 0) AS cost
    FROM filtered_sales fs
    GROUP BY fs.product_id
  )
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
    CASE 
      WHEN ROW_NUMBER() OVER (ORDER BY COALESCE(ps.quantity_sold, 0) DESC, COALESCE(ps.revenue, 0) DESC) <= 5 THEN 'top'
      WHEN ROW_NUMBER() OVER (ORDER BY COALESCE(ps.quantity_sold, 0) ASC, COALESCE(ps.revenue, 0) ASC) <= 5 THEN 'bad'
      ELSE NULL
    END AS rank_type,
    o.name AS org_name
  FROM public.products pr
  LEFT JOIN product_sales ps ON ps.product_id = pr.id
  LEFT JOIN public.categories cat ON cat.id = pr.category_id
  LEFT JOIN public.organizations o ON o.id = pr.organization_id
  WHERE (v_org_id IS NULL OR pr.organization_id = v_org_id)
    AND pr.is_active = true
    AND (
      ROW_NUMBER() OVER (ORDER BY COALESCE(ps.quantity_sold, 0) DESC, COALESCE(ps.revenue, 0) DESC) <= 5
      OR ROW_NUMBER() OVER (ORDER BY COALESCE(ps.quantity_sold, 0) ASC, COALESCE(ps.revenue, 0) ASC) <= 5
    )
  ORDER BY 
    CASE 
      WHEN ROW_NUMBER() OVER (ORDER BY COALESCE(ps.quantity_sold, 0) DESC, COALESCE(ps.revenue, 0) DESC) <= 5 THEN 0
      ELSE 1
    END,
    COALESCE(ps.quantity_sold, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_kpis_by_period(TEXT, UUID) TO authenticated;
