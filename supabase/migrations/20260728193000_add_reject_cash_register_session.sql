-- ─────────────────────────────────────────────────────────────────
-- RPC additive : reject_cash_register_session (P1 du plan
-- cash-closing-final-hardening)
--
-- Complète le cycle de vie approuver/rejeter d'une clôture de caisse.
-- Le statut 'rejected' et la colonne rejection_reason existent déjà
-- depuis la migration initiale (20260727150000) mais n'étaient
-- exposés par aucune RPC -- cette migration est purement additive :
-- aucune table modifiée, aucune donnée touchée, aucune fonction
-- existante changée.
--
-- Règles (identiques à approve_cash_register_session, sauf status
-- cible et raison obligatoire) :
-- - réservé admin/manager ;
-- - raison obligatoire (rejet sans justification interdit) ;
-- - ne modifie jamais public.sales ni public.expenses ;
-- - la session doit être au statut 'closed' (en attente d'approbation) ;
-- - trace approved_by (pas de colonne reviewed_by distincte dans le
--   schéma -- réutilisation cohérente avec approve_cash_register_session
--   qui l'utilise déjà pour "qui a traité cette clôture") ;
-- - log user_activity_logs.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_cash_register_session(
  p_session_id UUID,
  p_rejection_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session RECORD;
BEGIN
  IF p_rejection_reason IS NULL OR btrim(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'Une raison de rejet est obligatoire';
  END IF;

  SELECT * INTO v_session FROM public.cash_register_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session de caisse introuvable';
  END IF;
  IF v_session.organization_id <> public.get_user_organization_id() THEN
    RAISE EXCEPTION 'Session hors de votre organisation';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'Seul un manager ou un admin peut rejeter une clôture';
  END IF;
  IF v_session.status <> 'closed' THEN
    RAISE EXCEPTION 'Cette session n''est pas en attente d''approbation (statut actuel : %)', v_session.status;
  END IF;

  UPDATE public.cash_register_sessions SET
    status = 'rejected',
    approved_by = auth.uid(),
    approved_at = now(),
    rejection_reason = p_rejection_reason
  WHERE id = p_session_id;

  INSERT INTO public.user_activity_logs (user_id, organization_id, action, description, metadata)
  VALUES (
    auth.uid(), v_session.organization_id, 'settings_updated',
    'Rejet de clôture de caisse',
    jsonb_build_object('cash_session_event', 'rejected', 'session_id', p_session_id, 'reason', p_rejection_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_cash_register_session(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_cash_register_session(UUID, TEXT) TO authenticated;
