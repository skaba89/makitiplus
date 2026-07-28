-- ════════════════════════════════════════════════════════════════
-- Clôture de caisse complète — table de sessions + RPC (P1/P2/P5 du plan
-- cash-closing-complete-no-regression)
-- Date: 2026-07-27
--
-- Remplace le mécanisme actuel (une ligne dans user_activity_logs par
-- clôture, sans notion de session/statut/approbation) par une vraie
-- table métier. MIGRATION ADDITIVE UNIQUEMENT :
--   - aucune modification de sales/expenses/user_activity_logs
--   - aucune suppression de données existantes
--   - le nouveau flux coexiste avec l'ancien tant que la page
--     CashClosing.tsx n'est pas migrée (fait dans le meme PR, voir P3)
--
-- Décision de conception : toutes les écritures (ouverture, clôture,
-- approbation) passent exclusivement par des RPC SECURITY DEFINER —
-- AUCUN grant INSERT/UPDATE direct sur la table pour "authenticated".
-- Plus robuste que des policies RLS INSERT/UPDATE par rôle : permet de
-- valider côté serveur des règles que RLS seul ne peut pas exprimer
-- proprement (une seule session ouverte par vendeur/magasin, calculs
-- non falsifiables par le client, interdiction de modifier une session
-- déjà fermée). Cohérent avec le pattern déjà utilisé pour
-- stripe_events (voir 20260724140000_fix_stripe_events_rls_disabled.sql
-- dans l'historique du projet) et create_product/create_full_sale.
-- ════════════════════════════════════════════════════════════════

-- ─── Table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cash_register_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id UUID NULL REFERENCES public.stores(id) ON DELETE SET NULL,

  opened_by UUID NOT NULL,
  closed_by UUID NULL,
  approved_by UUID NULL,

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closing_pending', 'closed', 'approved', 'rejected', 'cancelled')),

  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ NULL,
  approved_at TIMESTAMPTZ NULL,

  opening_cash NUMERIC NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),

  expected_cash NUMERIC NOT NULL DEFAULT 0,
  actual_cash NUMERIC NULL CHECK (actual_cash IS NULL OR actual_cash >= 0),
  cash_difference NUMERIC NULL,

  total_sales NUMERIC NOT NULL DEFAULT 0,
  cash_sales NUMERIC NOT NULL DEFAULT 0,
  wave_sales NUMERIC NOT NULL DEFAULT 0,
  orange_money_sales NUMERIC NOT NULL DEFAULT 0,
  mtn_money_sales NUMERIC NOT NULL DEFAULT 0,
  moov_money_sales NUMERIC NOT NULL DEFAULT 0,
  mpesa_sales NUMERIC NOT NULL DEFAULT 0,
  card_sales NUMERIC NOT NULL DEFAULT 0,
  credit_sales NUMERIC NOT NULL DEFAULT 0,

  total_expenses NUMERIC NOT NULL DEFAULT 0,
  cash_expenses NUMERIC NOT NULL DEFAULT 0,

  transaction_count INTEGER NOT NULL DEFAULT 0,
  products_sold NUMERIC NOT NULL DEFAULT 0,

  notes TEXT NULL,
  manager_notes TEXT NULL,
  rejection_reason TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cash_register_sessions IS
  'Sessions de caisse (ouverture -> clôture -> approbation). Écritures exclusivement via RPC SECURITY DEFINER, jamais en direct depuis le client.';

-- ─── Index ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cash_sessions_org_date
  ON public.cash_register_sessions (organization_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_store_date
  ON public.cash_register_sessions (store_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_by_date
  ON public.cash_register_sessions (opened_by, opened_at DESC);

-- Une seule session ouverte (ou en attente de clôture) par vendeur+magasin.
-- Utilise coalesce(store_id, organization_id) pour que la contrainte
-- fonctionne aussi quand store_id est NULL (organisation mono-magasin).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_cash_session_per_user_store
  ON public.cash_register_sessions (organization_id, COALESCE(store_id, organization_id), opened_by)
  WHERE status IN ('open', 'closing_pending');

-- ─── updated_at automatique ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_cash_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_sessions_updated_at ON public.cash_register_sessions;
CREATE TRIGGER trg_cash_sessions_updated_at
  BEFORE UPDATE ON public.cash_register_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_cash_sessions_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────
-- Lecture seule via RLS (le SELECT reste utile pour l'UI -- listes,
-- historique). Toute écriture passe par les RPC ci-dessous (SECURITY
-- DEFINER), donc aucune policy INSERT/UPDATE/DELETE n'est nécessaire ;
-- les GRANT bruts sur la table sont volontairement retirés pour
-- authenticated (seules les RPC, exécutées par leur propriétaire,
-- peuvent écrire).

ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_sessions_select_own_vendeur" ON public.cash_register_sessions;
CREATE POLICY "cash_sessions_select_own_vendeur" ON public.cash_register_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (organization_id = public.get_user_organization_id() AND (
      -- manager/admin/comptable voient toute l'organisation
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'comptable'::app_role)
      -- vendeur ne voit que ses propres sessions
      OR opened_by = auth.uid()
    ))
  );

REVOKE INSERT, UPDATE, DELETE ON public.cash_register_sessions FROM authenticated;
GRANT SELECT ON public.cash_register_sessions TO authenticated;

-- ─── RPC : ouvrir une session ───────────────────────────────────

DROP FUNCTION IF EXISTS public.open_cash_register_session(UUID, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.open_cash_register_session(
  p_store_id UUID DEFAULT NULL,
  p_opening_cash NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_session_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation associée à cet utilisateur';
  END IF;

  -- super_admin n'ouvre pas de caisse opérationnelle (audit uniquement)
  IF public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin ne peut pas ouvrir de session de caisse opérationnelle';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'vendeur'::app_role)
  ) THEN
    RAISE EXCEPTION 'Rôle non autorisé à ouvrir une session de caisse';
  END IF;

  IF p_opening_cash < 0 THEN
    RAISE EXCEPTION 'Le fond de caisse initial ne peut pas être négatif';
  END IF;

  -- Vérifier que le magasin (si fourni) appartient bien à l'organisation
  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Magasin invalide pour cette organisation';
  END IF;

  INSERT INTO public.cash_register_sessions (
    organization_id, store_id, opened_by, status, opening_cash, notes
  ) VALUES (
    v_org_id, p_store_id, auth.uid(), 'open', p_opening_cash, p_notes
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.user_activity_logs (user_id, organization_id, action, description, metadata)
  VALUES (
    auth.uid(), v_org_id, 'settings_updated',
    'Ouverture de session de caisse',
    jsonb_build_object('cash_session_event', 'opened', 'session_id', v_session_id, 'opening_cash', p_opening_cash)
  );

  RETURN v_session_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Une session de caisse est déjà ouverte pour ce magasin — clôturez-la avant d''en ouvrir une nouvelle';
END;
$$;

REVOKE ALL ON FUNCTION public.open_cash_register_session(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_cash_register_session(UUID, NUMERIC, TEXT) TO authenticated;

-- ─── RPC : résumé de clôture (calculs temps réel, lecture seule) ─

DROP FUNCTION IF EXISTS public.get_cash_closing_summary(UUID);
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

  SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cash'), 0)
  INTO v_expenses_total, v_expenses_cash
  FROM public.expenses
  WHERE organization_id = v_session.organization_id
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

-- ─── RPC : clôturer une session ─────────────────────────────────

DROP FUNCTION IF EXISTS public.close_cash_register_session(UUID, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.close_cash_register_session(
  p_session_id UUID,
  p_actual_cash NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session RECORD;
  v_summary JSONB;
  v_expected NUMERIC;
BEGIN
  SELECT * INTO v_session FROM public.cash_register_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session de caisse introuvable';
  END IF;
  IF v_session.status NOT IN ('open') THEN
    RAISE EXCEPTION 'Cette session n''est pas ouverte (statut actuel : %)', v_session.status;
  END IF;
  IF v_session.opened_by <> auth.uid() AND NOT (
    public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Seul le vendeur qui a ouvert cette session (ou un manager/admin) peut la clôturer';
  END IF;
  IF p_actual_cash < 0 THEN
    RAISE EXCEPTION 'Le montant réel en caisse ne peut pas être négatif';
  END IF;

  v_summary := public.get_cash_closing_summary(p_session_id);
  v_expected := (v_summary->>'expected_cash')::numeric;

  UPDATE public.cash_register_sessions SET
    status = 'closed',
    closed_by = auth.uid(),
    closed_at = now(),
    actual_cash = p_actual_cash,
    expected_cash = v_expected,
    cash_difference = p_actual_cash - v_expected,
    total_sales = (v_summary->>'total_sales')::numeric,
    cash_sales = (v_summary->>'cash_sales')::numeric,
    wave_sales = (v_summary->>'wave_sales')::numeric,
    orange_money_sales = (v_summary->>'orange_money_sales')::numeric,
    mtn_money_sales = (v_summary->>'mtn_money_sales')::numeric,
    moov_money_sales = (v_summary->>'moov_money_sales')::numeric,
    mpesa_sales = (v_summary->>'mpesa_sales')::numeric,
    card_sales = (v_summary->>'card_sales')::numeric,
    credit_sales = (v_summary->>'credit_sales')::numeric,
    total_expenses = (v_summary->>'total_expenses')::numeric,
    cash_expenses = (v_summary->>'cash_expenses')::numeric,
    transaction_count = (v_summary->>'transaction_count')::integer,
    products_sold = (v_summary->>'products_sold')::numeric,
    notes = p_notes
  WHERE id = p_session_id;

  INSERT INTO public.user_activity_logs (user_id, organization_id, action, description, metadata)
  VALUES (
    auth.uid(), v_session.organization_id, 'settings_updated',
    'Clôture de session de caisse',
    jsonb_build_object(
      'cash_session_event', 'closed', 'session_id', p_session_id,
      'actual_cash', p_actual_cash, 'expected_cash', v_expected,
      'difference', p_actual_cash - v_expected
    )
  );

  RETURN public.get_cash_closing_summary(p_session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_register_session(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_cash_register_session(UUID, NUMERIC, TEXT) TO authenticated;

-- ─── RPC : approuver une session clôturée ───────────────────────

DROP FUNCTION IF EXISTS public.approve_cash_register_session(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.approve_cash_register_session(
  p_session_id UUID,
  p_manager_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT * INTO v_session FROM public.cash_register_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session de caisse introuvable';
  END IF;
  IF v_session.organization_id <> public.get_user_organization_id() THEN
    RAISE EXCEPTION 'Session hors de votre organisation';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'Seul un manager ou un admin peut approuver une clôture';
  END IF;
  IF v_session.status <> 'closed' THEN
    RAISE EXCEPTION 'Cette session n''est pas en attente d''approbation (statut actuel : %)', v_session.status;
  END IF;

  UPDATE public.cash_register_sessions SET
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now(),
    manager_notes = p_manager_notes
  WHERE id = p_session_id;

  INSERT INTO public.user_activity_logs (user_id, organization_id, action, description, metadata)
  VALUES (
    auth.uid(), v_session.organization_id, 'settings_updated',
    'Approbation de clôture de caisse',
    jsonb_build_object('cash_session_event', 'approved', 'session_id', p_session_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_cash_register_session(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_cash_register_session(UUID, TEXT) TO authenticated;

-- ─── RPC : lister l'historique des sessions ──────────────────────

DROP FUNCTION IF EXISTS public.get_cash_register_sessions(UUID, UUID, TEXT, DATE, DATE);
CREATE OR REPLACE FUNCTION public.get_cash_register_sessions(
  p_store_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS SETOF public.cash_register_sessions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_is_reviewer BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_is_reviewer := public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'comptable'::app_role);

  RETURN QUERY
  SELECT * FROM public.cash_register_sessions s
  WHERE (public.is_super_admin() OR s.organization_id = v_org_id)
    AND (v_is_reviewer OR public.is_super_admin() OR s.opened_by = auth.uid())
    AND (p_store_id IS NULL OR s.store_id = p_store_id)
    AND (p_user_id IS NULL OR s.opened_by = p_user_id)
    AND (p_status IS NULL OR s.status = p_status)
    AND (p_from_date IS NULL OR s.opened_at >= p_from_date::timestamptz)
    AND (p_to_date IS NULL OR s.opened_at < (p_to_date + 1)::timestamptz)
  ORDER BY s.opened_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cash_register_sessions(UUID, UUID, TEXT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cash_register_sessions(UUID, UUID, TEXT, DATE, DATE) TO authenticated;
