-- ============================================================
-- Migration : enrichir get_reports_stats avec marge brute + total remises
-- Date: 2026-07-12
-- ============================================================
-- Objectif:
--   Ajouter 3 nouvelles métriques au rapport de Reports.tsx :
--   - totalDiscount : somme des discount_amount sur la période
--     (permet de suivre combien de remises sont données)
--   - totalCost : somme des (cost_price × quantity) pour tous les
--     sale_items de la période (calcul du coût des marchandises vendues)
--   - grossMargin : totalSales - totalCost (marge brute en valeur absolue)
--   - grossMarginPct : grossMargin / totalSales × 100 (marge brute en %)
--
-- Sécurité:
--   - DROP FUNCTION IF EXISTS avant CREATE (signature inchangée mais
--     corps modifié)
--   - SECURITY DEFINER + search_path = public
--   - GRANT EXECUTE TO authenticated
-- ============================================================

DROP FUNCTION IF EXISTS public.get_reports_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_reports_stats(
  p_organization_id UUID,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_sales NUMERIC := 0;
  v_total_transactions BIGINT := 0;
  v_total_expenses NUMERIC := 0;
  v_expense_count BIGINT := 0;
  v_total_discount NUMERIC := 0;
  v_total_cost NUMERIC := 0;
  v_gross_margin NUMERIC := 0;
  v_gross_margin_pct NUMERIC := 0;
  v_payment_breakdown JSONB;
  v_daily_sales JSONB;
  v_top_products JSONB;
BEGIN
  -- Sales aggregation — total_amount + somme des remises
  SELECT
    COALESCE(SUM(total_amount), 0),
    COUNT(*),
    COALESCE(SUM(COALESCE(discount_amount, 0)), 0)
  INTO v_total_sales, v_total_transactions, v_total_discount
  FROM sales
  WHERE organization_id = p_organization_id
    AND created_at >= p_start
    AND created_at <= p_end;

  -- Cost of Goods Sold (COGS) — somme des (cost_price × quantity) pour chaque sale_item
  -- On utilise LEFT JOIN sur products pour récupérer le cost_price au moment de la vente
  -- (les sale_items stockent déjà unit_price mais pas le cost_price)
  SELECT COALESCE(SUM(COALESCE(p.cost_price, 0) * si.quantity), 0)
  INTO v_total_cost
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  LEFT JOIN products p ON p.id = si.product_id
  WHERE s.organization_id = p_organization_id
    AND s.created_at >= p_start
    AND s.created_at <= p_end;

  -- Gross margin = totalSales - COGS (toujours >= 0 si cost_price cohérent)
  v_gross_margin := v_total_sales - v_total_cost;
  -- Gross margin % (éviter division par 0)
  IF v_total_sales > 0 THEN
    v_gross_margin_pct := ROUND((v_gross_margin / v_total_sales) * 100, 2);
  ELSE
    v_gross_margin_pct := 0;
  END IF;

  -- Expenses aggregation
  SELECT
    COALESCE(SUM(amount), 0),
    COUNT(*)
  INTO v_total_expenses, v_expense_count
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= p_start::date
    AND expense_date <= p_end::date;

  -- Payment method breakdown
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', payment_method,
    'value', method_total
  )), '[]'::jsonb)
  INTO v_payment_breakdown
  FROM (
    SELECT payment_method, SUM(total_amount) AS method_total
    FROM sales
    WHERE organization_id = p_organization_id
      AND created_at >= p_start
      AND created_at <= p_end
    GROUP BY payment_method
  ) sub;

  -- Daily sales for chart
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day::text,
    'sales', day_total,
    'transactions', day_count
  )), '[]'::jsonb)
  INTO v_daily_sales
  FROM (
    SELECT
      d.day::text,
      COALESCE(SUM(s.total_amount), 0) AS day_total,
      COUNT(s.id) AS day_count
    FROM generate_series(
      p_start::date,
      p_end::date,
      '1 day'::interval
    ) AS d(day)
    LEFT JOIN sales s ON s.organization_id = p_organization_id
      AND s.created_at >= d.day
      AND s.created_at < d.day + interval '1 day'
    GROUP BY d.day
    ORDER BY d.day
  ) daily;

  -- Top 5 products by quantity sold
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', product_name,
    'quantity', total_qty,
    'revenue', total_rev
  )), '[]'::jsonb)
  INTO v_top_products
  FROM (
    SELECT
      si.product_name,
      SUM(si.quantity) AS total_qty,
      SUM(si.total_price) AS total_rev
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_organization_id
      AND s.created_at >= p_start
      AND s.created_at <= p_end
    GROUP BY si.product_name
    ORDER BY total_qty DESC
    LIMIT 5
  ) top;

  RETURN jsonb_build_object(
    'totalSales', v_total_sales,
    'totalTransactions', v_total_transactions,
    'totalExpenses', v_total_expenses,
    'expenseCount', v_expense_count,
    'totalDiscount', v_total_discount,
    'totalCost', v_total_cost,
    'grossMargin', v_gross_margin,
    'grossMarginPct', v_gross_margin_pct,
    'paymentBreakdown', v_payment_breakdown,
    'dailySales', v_daily_sales,
    'topProducts', v_top_products
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reports_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION public.get_reports_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS 'v2 (2026-07-12): ajoute totalDiscount, totalCost, grossMargin, grossMarginPct pour le rapport marge/bénéfice.';
