-- ════════════════════════════════════════════════════════════════
-- Fix: get_admin_org_kpis — colonne organization_id ambiguë
-- Date: 2026-07-24 — trouvé en investiguant "Analyse Multi-Magasins ne
-- fonctionne pas" (AdminAnalytics.tsx, section "KPIs par organisation")
--
-- Bug : RETURNS TABLE déclare une colonne de sortie `organization_id`,
-- qui devient une variable PL/pgSQL implicite accessible dans tout le
-- corps de la fonction. Les CTE internes (store_agg, sales_agg,
-- expenses_agg, customers_agg, products_agg) référencent `organization_id`
-- SANS le qualifier par un alias de table — Postgres ne peut pas savoir
-- s'il s'agit de la colonne de la table source ou de la variable de
-- sortie de la fonction : "ERROR: 42702: column reference
-- "organization_id" is ambiguous". Confirmé en base live via
-- pg_get_functiondef (version déployée depuis le 16/07, jamais corrigée)
-- et reproduit par un appel test dans une transaction ROLLBACK. Cette RPC
-- alimente la section "KPIs par organisation" d'AdminAnalytics.tsx —
-- échec systématique de sa requête React Query.
--
-- Fix : qualification explicite de organization_id par l'alias de table
-- dans chaque CTE (s./st./e./c./pr.). Logique métier strictement
-- inchangée (mêmes agrégations, mêmes jointures).
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_admin_org_kpis(
  p_period TEXT DEFAULT 'month'
)
RETURNS TABLE (
  organization_id UUID,
  org_name TEXT,
  store_count BIGINT,
  transaction_count BIGINT,
  total_sales NUMERIC,
  total_expenses NUMERIC,
  net_revenue NUMERIC,
  avg_basket NUMERIC,
  total_cost NUMERIC,
  gross_margin NUMERIC,
  customer_count BIGINT,
  active_products BIGINT,
  low_stock_count BIGINT,
  store_names TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
  v_start_date := CASE
    WHEN p_period = 'day' THEN date_trunc('day', NOW()) - INTERVAL '1 day'
    WHEN p_period = 'week' THEN date_trunc('week', NOW()) - INTERVAL '7 days'
    WHEN p_period = 'month' THEN date_trunc('month', NOW()) - INTERVAL '30 days'
    ELSE date_trunc('month', NOW()) - INTERVAL '30 days'
  END;

  RETURN QUERY
  WITH store_agg AS (
    SELECT st.organization_id, COUNT(*) AS store_count, ARRAY_AGG(st.name) AS store_names
    FROM public.stores st
    GROUP BY st.organization_id
  ),
  sales_agg AS (
    SELECT s.organization_id,
      COUNT(*) AS transaction_count,
      COALESCE(SUM(s.total_amount), 0) AS total_sales
    FROM public.sales s
    WHERE s.created_at >= v_start_date
    GROUP BY s.organization_id
  ),
  sale_items_agg AS (
    SELECT s.organization_id,
      COALESCE(SUM(si.quantity * COALESCE(si.cost_price, 0)), 0) AS total_cost
    FROM public.sales s
    INNER JOIN public.sale_items si ON si.sale_id = s.id
    WHERE s.created_at >= v_start_date
    GROUP BY s.organization_id
  ),
  expenses_agg AS (
    SELECT e.organization_id, COALESCE(SUM(e.amount), 0) AS total_expenses
    FROM public.expenses e
    WHERE e.created_at >= v_start_date
    GROUP BY e.organization_id
  ),
  customers_agg AS (
    SELECT c.organization_id, COUNT(*) AS customer_count
    FROM public.customers c
    GROUP BY c.organization_id
  ),
  products_agg AS (
    SELECT pr.organization_id,
      COUNT(*) FILTER (WHERE pr.is_active = true) AS active_products,
      COUNT(*) FILTER (WHERE pr.stock_quantity <= pr.min_stock_alert) AS low_stock_count
    FROM public.products pr
    GROUP BY pr.organization_id
  )
  SELECT
    o.id,
    o.name,
    COALESCE(sta.store_count, 0)::BIGINT,
    COALESCE(sa.transaction_count, 0)::BIGINT,
    COALESCE(sa.total_sales, 0)::NUMERIC,
    COALESCE(ea.total_expenses, 0)::NUMERIC,
    (COALESCE(sa.total_sales, 0) - COALESCE(ea.total_expenses, 0))::NUMERIC,
    CASE WHEN COALESCE(sa.transaction_count, 0) > 0 THEN sa.total_sales / sa.transaction_count ELSE 0 END::NUMERIC,
    COALESCE(sia.total_cost, 0)::NUMERIC,
    (COALESCE(sa.total_sales, 0) - COALESCE(sia.total_cost, 0))::NUMERIC,
    COALESCE(ca.customer_count, 0)::BIGINT,
    COALESCE(pa.active_products, 0)::BIGINT,
    COALESCE(pa.low_stock_count, 0)::BIGINT,
    COALESCE(sta.store_names, ARRAY[]::TEXT[])
  FROM public.organizations o
  LEFT JOIN store_agg sta ON sta.organization_id = o.id
  LEFT JOIN sales_agg sa ON sa.organization_id = o.id
  LEFT JOIN sale_items_agg sia ON sia.organization_id = o.id
  LEFT JOIN expenses_agg ea ON ea.organization_id = o.id
  LEFT JOIN customers_agg ca ON ca.organization_id = o.id
  LEFT JOIN products_agg pa ON pa.organization_id = o.id
  WHERE public.is_super_admin()
  ORDER BY COALESCE(sa.total_sales, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_org_kpis(TEXT) TO authenticated;
