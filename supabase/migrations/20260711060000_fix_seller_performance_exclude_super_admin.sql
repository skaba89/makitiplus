-- ============================================================
-- FIX get_seller_performance — exclure les super_admins
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT p.organization_id INTO v_org_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  ) THEN
    RAISE EXCEPTION 'Acces refuse';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    COALESCE(p.owner_name, p.business_name, 'Inconnu')::TEXT AS seller_name,
    COALESCE(ur.role::TEXT, 'vendeur') AS role,
    COALESCE(ss.total_sales, 0)::BIGINT AS total_sales,
    COALESCE(ss.total_revenue, 0)::NUMERIC AS total_revenue,
    COALESCE(ss.avg_sale_amount, 0)::NUMERIC AS avg_sale_amount,
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
  ) ss ON true
  WHERE p.organization_id = v_org_id
    -- Exclure les super_admins de la liste des vendeurs
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur2
      WHERE ur2.user_id = p.user_id AND ur2.role = 'super_admin'
    )
  ORDER BY COALESCE(ss.total_revenue, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';
