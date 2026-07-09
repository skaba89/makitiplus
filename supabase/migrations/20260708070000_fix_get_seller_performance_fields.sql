-- ============================================================
-- FIX get_seller_performance — aligner les champs sur le frontend
-- ============================================================
-- Le frontend attend : seller_id, seller_name, total_sales, total_revenue, last_seen_at
-- (pas total_amount)

DROP FUNCTION IF EXISTS public.get_seller_performance(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.get_seller_performance(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_seller_performance(
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE profiles.user_id = v_user_id;

  IF v_org_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Retourner un tableau JSONB avec les bons noms de champs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'seller_id', s.seller_id,
    'seller_name', COALESCE(p.owner_name, 'Inconnu'),
    'total_sales', s.total_sales,
    'total_revenue', s.total_amount,
    'last_seen_at', p.last_login_at
  ) ORDER BY s.total_amount DESC NULLS LAST), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      sa.seller_id,
      COUNT(DISTINCT sa.id) AS total_sales,
      COALESCE(SUM(sa.total_amount), 0) AS total_amount
    FROM public.sales sa
    WHERE sa.organization_id = v_org_id
      AND (p_period_start IS NULL OR sa.created_at >= p_period_start)
      AND (p_period_end IS NULL OR sa.created_at <= p_period_end)
    GROUP BY sa.seller_id
  ) s
  LEFT JOIN public.profiles p ON p.user_id = s.seller_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- FIX get_seller_activities — retourner un tableau JSONB
-- ============================================================

DROP FUNCTION IF EXISTS public.get_seller_activities(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_seller_activities(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE profiles.user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = p_user_id
      AND profiles.organization_id = v_org_id
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ual.id,
    'action', ual.action,
    'description', ual.description,
    'created_at', ual.created_at,
    'metadata', ual.metadata
  ) ORDER BY ual.created_at DESC), '[]'::jsonb) INTO v_result
  FROM public.user_activity_logs ual
  WHERE ual.user_id = p_user_id
    AND ual.organization_id = v_org_id
  LIMIT p_limit;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_activities(UUID, INTEGER) TO authenticated;

-- ============================================================
-- Recharger PostgREST
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Vérification
-- ============================================================
SELECT 
    'get_seller_performance' AS fn,
    pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'get_seller_performance' AND pronamespace = 'public'::regnamespace;
