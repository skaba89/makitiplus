-- ════════════════════════════════════════════════════════════════
-- Fix: get_admin_seller_performance — cast invalide sur liste IN
-- Date: 2026-07-24 — trouvé en investiguant "Analyse Multi-Magasins ne
-- fonctionne pas" (AdminAnalytics.tsx, section "Performance vendeurs")
--
-- Bug : `ur.role IN ('vendeur', 'manager', 'admin')::public.app_role`
-- fait échouer TOUT appel de cette fonction avec
-- "ERROR: 42846: cannot cast type boolean to app_role" — le cast ::app_role
-- s'applique de façon ambiguë/incorrecte à la liste IN plutôt qu'à chaque
-- élément individuellement. Confirmé en base live via pg_get_functiondef :
-- c'est la version déployée depuis le 16/07 (jamais corrigée), et un appel
-- test (simulation auth.uid() dans une transaction ROLLBACK) reproduit
-- l'erreur exactement. Cette RPC alimente la section "Performance
-- vendeurs" d'AdminAnalytics.tsx (onglet "Analyse Multi-Magasins") — sa
-- requête React Query échoue systématiquement (isError = true).
--
-- Fix : comparaison via ANY(ARRAY[...]::app_role[]), syntaxe non ambiguë.
-- Logique métier strictement inchangée (mêmes 3 rôles filtrés).
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_admin_seller_performance(
  p_period TEXT DEFAULT 'month',
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  seller_id UUID,
  seller_name TEXT,
  seller_role TEXT,
  organization_id UUID,
  org_name TEXT,
  store_name TEXT,
  total_sales BIGINT,
  total_revenue NUMERIC,
  avg_sale_amount NUMERIC,
  last_sale_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    v_start_date TIMESTAMPTZ;
  BEGIN
    -- Calculer la date de début selon la période
    v_start_date := CASE
      WHEN p_period = 'day' THEN date_trunc('day', NOW()) - INTERVAL '1 day'
      WHEN p_period = 'week' THEN date_trunc('week', NOW()) - INTERVAL '7 days'
      WHEN p_period = 'month' THEN date_trunc('month', NOW()) - INTERVAL '30 days'
      ELSE date_trunc('month', NOW()) - INTERVAL '30 days'
    END;

    RETURN QUERY
    SELECT
      p.user_id AS seller_id,
      COALESCE(p.owner_name, '—') AS seller_name,
      COALESCE(ur.role::text, 'unknown') AS seller_role,
      p.organization_id,
      o.name AS org_name,
      o.name AS store_name,
      COUNT(DISTINCT s.id) AS total_sales,
      COALESCE(SUM(s.total_amount), 0) AS total_revenue,
      COALESCE(AVG(s.total_amount), 0) AS avg_sale_amount,
      MAX(s.created_at) AS last_sale_at,
      p.last_login_at
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
    LEFT JOIN public.organizations o ON o.id = p.organization_id
    LEFT JOIN public.sales s ON s.user_id = p.user_id AND s.created_at >= v_start_date
    WHERE public.is_super_admin()
      AND p.organization_id IS NOT NULL
      AND (p_organization_id IS NULL OR p.organization_id = p_organization_id)
      AND (ur.role IS NULL OR ur.role = ANY (ARRAY['vendeur', 'manager', 'admin']::public.app_role[]))
    GROUP BY p.user_id, p.owner_name, ur.role, p.organization_id, o.name, p.last_login_at
    ORDER BY total_revenue DESC;
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_seller_performance(TEXT, UUID) TO authenticated;
