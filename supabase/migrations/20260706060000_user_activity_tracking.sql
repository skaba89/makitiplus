-- ============================================================
-- Feature: User Activity Tracking & Seller Performance
-- Date: 2026-07-06
--
-- Adds:
--   1. last_logout_at, last_seen_at columns on profiles
--   2. user_activity_logs table for tracking seller actions
--   3. RPC: get_seller_performance — sales stats per seller
--   4. RPC: get_seller_activities — recent activities per seller
--   5. RPC: log_user_activity — insert activity log entry
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. Add missing columns to profiles
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NULL;

-- ════════════════════════════════════════════════════════════════
-- 2. Create user_activity_logs table
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,  -- 'login', 'logout', 'sale_created', 'product_created', 'stock_adjusted', etc.
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user
  ON public.user_activity_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_org
  ON public.user_activity_logs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action
  ON public.user_activity_logs(action, created_at DESC);

-- RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own activity logs
CREATE POLICY "Users can read own activity logs"
  ON public.user_activity_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- Admins can read org activity logs
CREATE POLICY "Admins can read org activity logs"
  ON public.user_activity_logs
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
    AND (
      public.is_super_admin()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
    )
  );

-- Users can insert their own activity logs
CREATE POLICY "Users can insert own activity logs"
  ON public.user_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════
-- 3. RPC: get_seller_performance
--    Returns sales stats per seller for the current org
-- ════════════════════════════════════════════════════════════════
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
  -- Get caller's org
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvée';
  END IF;

  -- Only admin/manager/super_admin can view seller performance
  IF NOT (public.is_super_admin() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Accès refusé : seuls les administrateurs et managers peuvent voir les performances des vendeurs.';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    COALESCE(p.owner_name, p.business_name, 'Inconnu') AS seller_name,
    ur.role,
    COALESCE(sales_stats.total_sales, 0) AS total_sales,
    COALESCE(sales_stats.total_revenue, 0) AS total_revenue,
    COALESCE(sales_stats.avg_sale_amount, 0) AS avg_sale_amount,
    p.last_login_at,
    p.last_logout_at,
    p.last_seen_at,
    COALESCE(p.is_active, true) AS is_active
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total_sales,
      SUM(s.total_amount) AS total_revenue,
      CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(s.total_amount), 2) ELSE 0 END AS avg_sale_amount
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

-- ════════════════════════════════════════════════════════════════
-- 4. RPC: get_seller_activities
--    Returns recent activities for sellers in the current org
-- ════════════════════════════════════════════════════════════════
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvée';
  END IF;

  IF NOT (public.is_super_admin() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    ual.id,
    ual.user_id,
    COALESCE(p.owner_name, p.business_name, 'Inconnu') AS seller_name,
    ual.action,
    ual.description,
    ual.metadata,
    ual.created_at
  FROM public.user_activity_logs ual
  JOIN public.profiles p ON p.user_id = ual.user_id
  WHERE ual.organization_id = v_org_id
    AND (p_user_id IS NULL OR ual.user_id = p_user_id)
  ORDER BY ual.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_activities(UUID, INTEGER) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 5. RPC: log_user_activity
--    Insert an activity log entry (called from frontend)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.log_user_activity(
  p_action TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_log_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.user_activity_logs (user_id, organization_id, action, description, metadata)
  VALUES (auth.uid(), v_org_id, p_action, p_description, p_metadata)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_user_activity(TEXT, TEXT, JSONB) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 6. Reload PostgREST schema cache
-- ════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
