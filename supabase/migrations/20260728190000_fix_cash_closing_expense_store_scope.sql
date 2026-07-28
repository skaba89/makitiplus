-- ─────────────────────────────────────────────────────────────────
-- Fix : scoper les dépenses par magasin dans get_cash_closing_summary
-- (P0.2 du plan cash-closing-final-hardening)
--
-- Bug : la requête d'agrégation des dépenses ne filtrait PAS par
-- store_id, contrairement à la CTE qualifying_sales (ventes) qui le
-- fait déjà. Dans une organisation multi-magasin, une session de
-- caisse liée à un magasin précis incluait donc les dépenses de TOUS
-- les magasins de l'organisation dans son calcul de caisse attendue
-- (expected_cash = opening_cash + cash_sales - cash_expenses) --
-- l'écart de caisse affiché au vendeur pouvait être faux.
--
-- Cette migration est additive : elle ne fait que CREATE OR REPLACE
-- la fonction existante avec le filtre store_id ajouté à la requête
-- des dépenses. Aucune table n'est modifiée, aucune donnée n'est
-- supprimée ou réécrite (sales et expenses restent intouchées).
--
-- Choix created_at vs expense_date : on garde created_at (comme pour
-- les ventes), car une session de caisse correspond à une plage
-- horaire réelle (l'ouverture -> la clôture, en général quelques
-- heures) pendant laquelle l'argent physique est sorti du tiroir.
-- expense_date est une date comptable qui peut être antidatée par
-- l'utilisateur et ne correspond pas forcément au moment où l'argent
-- a réellement quitté la caisse pendant CETTE session -- created_at
-- (horodatage serveur de la saisie) est le signal fiable pour "cette
-- dépense a été payée en espèces pendant que cette caisse était
-- ouverte".
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_cash_closing_summary(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session RECORD;
  v_org_id UUID;
  v_period_end TIMESTAMPTZ;
  v_sales JSONB;
  v_by_seller JSONB;
  v_expenses_cash NUMERIC := 0;
  v_expenses_total NUMERIC := 0;
BEGIN
  SELECT * INTO v_session FROM public.cash_register_sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session de caisse introuvable';
  END IF;

  v_org_id := public.get_user_organization_id();
  IF NOT public.is_super_admin() AND v_session.organization_id <> v_org_id THEN
    RAISE EXCEPTION 'Session hors de votre organisation';
  END IF;

  -- Vendeur : uniquement sa propre session
  IF NOT (
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'comptable'::app_role)
    OR v_session.opened_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Accès refusé à cette session';
  END IF;

  v_period_end := COALESCE(v_session.closed_at, now());

  -- Ventes qualifiantes pour cette session : même organisation/magasin/plage
  -- horaire que la session, et si l'appelant est un simple vendeur (pas
  -- reviewer), restreintes à ses propres ventes -- même filtre réutilisé pour
  -- l'agrégat des ventes ET pour le compte de produits vendus (cohérence).
  WITH qualifying_sales AS (
    SELECT id, total_amount, payment_method, user_id
    FROM public.sales
    WHERE organization_id = v_session.organization_id
      AND (v_session.store_id IS NULL OR store_id = v_session.store_id)
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role)
        OR public.has_role(auth.uid(), 'comptable'::app_role)
        OR public.is_super_admin()
        OR user_id = v_session.opened_by
      )
      AND created_at >= v_session.opened_at
      AND created_at <= v_period_end
  )
  SELECT jsonb_build_object(
    'total_sales', COALESCE(SUM(qs.total_amount), 0),
    'cash_sales', COALESCE(SUM(qs.total_amount) FILTER (WHERE qs.payment_method = 'cash'), 0),
    'wave_sales', COALESCE(SUM(qs.total_amount) FILTER (WHERE qs.payment_method = 'wave'), 0),
    'orange_money_sales', COALESCE(SUM(qs.total_amount) FILTER (WHERE qs.payment_method = 'orange_money'), 0),
    'mtn_money_sales', COALESCE(SUM(qs.total_amount) FILTER (WHERE qs.payment_method = 'mtn_money'), 0),
    'moov_money_sales', COALESCE(SUM(qs.total_amount) FILTER (WHERE qs.payment_method = 'moov_money'), 0),
    'mpesa_sales', COALESCE(SUM(qs.total_amount) FILTER (WHERE qs.payment_method = 'mpesa'), 0),
    'card_sales', COALESCE(SUM(qs.total_amount) FILTER (WHERE qs.payment_method = 'card'), 0),
    'credit_sales', COALESCE(SUM(qs.total_amount) FILTER (WHERE qs.payment_method = 'credit'), 0),
    'transaction_count', COUNT(qs.id),
    'products_sold', COALESCE((
      SELECT SUM(si.quantity) FROM public.sale_items si WHERE si.sale_id IN (SELECT id FROM qualifying_sales)
    ), 0)
  ) INTO v_sales
  FROM qualifying_sales qs;

  -- Ventes par vendeur -- uniquement visible pour manager/admin/comptable/super_admin
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'manager'::app_role)
     OR public.has_role(auth.uid(), 'comptable'::app_role)
     OR public.is_super_admin() THEN
    SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'total', total, 'count', cnt))
    INTO v_by_seller
    FROM (
      SELECT user_id, SUM(total_amount) AS total, COUNT(*) AS cnt
      FROM public.sales
      WHERE organization_id = v_session.organization_id
        AND (v_session.store_id IS NULL OR store_id = v_session.store_id)
        AND created_at >= v_session.opened_at
        AND created_at <= v_period_end
      GROUP BY user_id
    ) s;
  END IF;

  -- FIX P0.2 : filtre store_id ajouté (absent avant cette migration) --
  -- cohérent avec le filtre déjà appliqué sur qualifying_sales ci-dessus.
  SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cash'), 0)
  INTO v_expenses_total, v_expenses_cash
  FROM public.expenses
  WHERE organization_id = v_session.organization_id
    AND (v_session.store_id IS NULL OR store_id = v_session.store_id)
    AND created_at >= v_session.opened_at
    AND created_at <= v_period_end;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'organization_id', v_session.organization_id,
    'store_id', v_session.store_id,
    'opened_by', v_session.opened_by,
    'closed_by', v_session.closed_by,
    'approved_by', v_session.approved_by,
    'status', v_session.status,
    'opened_at', v_session.opened_at,
    'closed_at', v_session.closed_at,
    'approved_at', v_session.approved_at,
    'opening_cash', v_session.opening_cash,
    'total_sales', v_sales->'total_sales',
    'cash_sales', v_sales->'cash_sales',
    'wave_sales', v_sales->'wave_sales',
    'orange_money_sales', v_sales->'orange_money_sales',
    'mtn_money_sales', v_sales->'mtn_money_sales',
    'moov_money_sales', v_sales->'moov_money_sales',
    'mpesa_sales', v_sales->'mpesa_sales',
    'card_sales', v_sales->'card_sales',
    'credit_sales', v_sales->'credit_sales',
    'transaction_count', v_sales->'transaction_count',
    'products_sold', v_sales->'products_sold',
    'by_seller', v_by_seller,
    'cash_expenses', v_expenses_cash,
    'total_expenses', v_expenses_total,
    'expected_cash', v_session.opening_cash + COALESCE((v_sales->>'cash_sales')::numeric, 0) - v_expenses_cash,
    -- Une fois la session fermée, on renvoie les valeurs figées enregistrées
    -- (actual_cash/cash_difference) plutôt qu'un recalcul -- la session
    -- fermée ne doit plus bouger même si des ventes sont ajoutées après coup
    -- (ce qui ne devrait pas arriver côté UI, mais garantit la cohérence).
    'actual_cash', v_session.actual_cash,
    'cash_difference', v_session.cash_difference,
    'notes', v_session.notes,
    'manager_notes', v_session.manager_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cash_closing_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cash_closing_summary(UUID) TO authenticated;
