-- ════════════════════════════════════════════════════════════════
-- Les "listes de vendeurs" ne doivent montrer que les rôles qui
-- peuvent réellement vendre (POS_ROLES côté frontend : admin, manager,
-- vendeur — src/types/index.ts) -- ni super_admin (opérateur
-- plateforme), ni comptable (aucun accès POS, jamais de vente).
--
-- get_seller_performance (page SellerActivity.tsx) excluait déjà
-- super_admin (migration 20260711060000) mais laissait passer
-- comptable. get_seller_kpis_detailed (SellerKpisCard.tsx sur
-- Reports.tsx) n'excluait RIEN : n'importe quel profil ayant une
-- vente sur la période (y compris super_admin ou comptable, si un
-- jour l'un d'eux en enregistre une, ex. lors de tests/diagnostics)
-- apparaissait dans "Performance vendeurs".
--
-- Additif au sens sécurité : resserre un filtre existant, ne change
-- aucune signature (mêmes paramètres, mêmes types), CREATE OR REPLACE
-- suffit sans DROP préalable.
-- ════════════════════════════════════════════════════════════════

-- 1. get_seller_performance : NOT EXISTS(super_admin) -> allowlist positive
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
    -- Seuls les rôles qui peuvent vendre (POS_ROLES) apparaissent dans
    -- la liste des vendeurs -- ni super_admin, ni comptable. Un profil
    -- sans ligne dans user_roles est traité comme "vendeur" (même
    -- convention par défaut que la colonne role ci-dessus).
    AND COALESCE(ur.role::TEXT, 'vendeur') IN ('admin', 'manager', 'vendeur')
  ORDER BY COALESCE(ss.total_revenue, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- 2. get_seller_kpis_detailed : ajouter le même filtre (n'existait pas)
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
    -- Seuls les rôles qui peuvent vendre (POS_ROLES) apparaissent dans
    -- "Performance vendeurs" -- ni super_admin, ni comptable.
    AND ur.role::TEXT IN ('admin', 'manager', 'vendeur')
  ORDER BY ss.total_amount DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_kpis_detailed(TEXT, UUID) TO authenticated;
