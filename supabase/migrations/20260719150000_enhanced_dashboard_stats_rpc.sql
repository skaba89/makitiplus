-- ════════════════════════════════════════════════════════════════
-- Migration: Enhanced Dashboard Stats — KPIs avec quantités
-- Date: 2026-07-19
-- ════════════════════════════════════════════════════════════════

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
