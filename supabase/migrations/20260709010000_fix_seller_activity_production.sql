-- ============================================================
-- Fix Seller Activity production regression
-- Date: 2026-07-09
-- Référence: production-stabilization-no-regression
--
-- Fixes:
-- - route/menu role mismatch handled in frontend
-- - enum/TEXT mismatch in get_seller_performance
-- - enum/TEXT mismatch in get_seller_activities
-- - safer p_limit bounds
--
-- No destructive operation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_seller_performance(
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID,
  seller_name TEXT,
  role TEXT,
  total_sales BIGINT,
  total_revenue NUMERIC,
  avg_sale_amount NUMERIC,
  last_login_at TIMESTAMPTZ,
  last_logout_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT p.organization_id INTO v_org_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvée';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  ) THEN
    RAISE EXCEPTION 'Accès refusé : seuls les administrateurs et managers peuvent voir les performances des vendeurs.';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    COALESCE(p.owner_name, p.business_name, 'Inconnu')::TEXT AS seller_name,
    COALESCE(ur.role::TEXT, 'vendeur') AS role,
    COALESCE(sales_stats.total_sales, 0)::BIGINT AS total_sales,
    COALESCE(sales_stats.total_revenue, 0)::NUMERIC AS total_revenue,
    COALESCE(sales_stats.avg_sale_amount, 0)::NUMERIC AS avg_sale_amount,
    p.last_login_at,
    p.last_logout_at,
    p.last_seen_at,
    COALESCE(p.is_active, true) AS is_active
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::BIGINT AS total_sales,
      COALESCE(SUM(s.total_amount), 0)::NUMERIC AS total_revenue,
      CASE
        WHEN COUNT(*) > 0 THEN ROUND(AVG(s.total_amount), 2)
        ELSE 0
      END::NUMERIC AS avg_sale_amount
    FROM public.sales s
    WHERE s.user_id = p.user_id
      AND s.organization_id = v_org_id
      AND (p_period_start IS NULL OR s.created_at >= p_period_start)
      AND (p_period_end IS NULL OR s.created_at <= p_period_end)
  ) sales_stats ON true
  WHERE p.organization_id = v_org_id
  ORDER BY COALESCE(sales_stats.total_revenue, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_seller_activities(
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  seller_name TEXT,
  action TEXT,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT p.organization_id INTO v_org_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvée';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    ual.id,
    ual.user_id,
    COALESCE(p.owner_name, p.business_name, 'Inconnu')::TEXT AS seller_name,
    ual.action::TEXT AS action,
    ual.description,
    ual.metadata,
    ual.created_at
  FROM public.user_activity_logs ual
  JOIN public.profiles p ON p.user_id = ual.user_id
  WHERE ual.organization_id = v_org_id
    AND (p_user_id IS NULL OR ual.user_id = p_user_id)
  ORDER BY ual.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_activities(UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
