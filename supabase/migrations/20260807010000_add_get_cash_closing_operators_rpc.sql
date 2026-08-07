-- ════════════════════════════════════════════════════════════════
-- RPC get_cash_closing_operators — audit final hardening (2e prompt, P1)
-- Date: 2026-08-07
--
-- Contexte : CashClosing.tsx construisait la liste des "opérateurs de
-- caisse" (utilisée pour le filtre Vendeur) côté client, en interrogeant
-- profiles + user_roles séparément puis en joignant en JS
-- (roleByUserId.get(p.user_id)). Le fix du 2026-08-01 (PR #59) avait déjà
-- corrigé le bug de fond (super_admin/comptable visibles à cause d'un
-- fallback "vendeur" implicite quand le rôle était introuvable), mais la
-- construction restait côté client : deux requêtes séparées, RLS sur
-- user_roles qui masque déjà super_admin, filtrage JS après coup.
--
-- Cette migration remplace ça par un RPC serveur unique, scopé
-- organisation, qui ne retourne QUE admin/manager/vendeur -- jamais
-- super_admin ni comptable -- et qui ne masque JAMAIS une erreur
-- d'autorisation en silence (elle lève une exception explicite plutôt que
-- de retourner un tableau vide, pour qu'une régression RLS ou un appel
-- mal formé soit visible dans l'UI React Query au lieu de ressembler à
-- "aucun opérateur").
--
-- Autorisation : l'appelant doit être super_admin (vue plateforme, tous
-- les onglets audit) OU appartenir lui-même à l'organisation demandée
-- (admin/manager/comptable consultant leur propre org). Tout autre appel
-- échoue explicitement.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_cash_closing_operators(p_organization_id uuid)
RETURNS TABLE (
  user_id uuid,
  owner_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'get_cash_closing_operators: p_organization_id est requis';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR public.get_user_organization_id() = p_organization_id
  ) THEN
    RAISE EXCEPTION 'get_cash_closing_operators: accès refusé pour l''organisation %', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.owner_name
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.organization_id = p_organization_id
    AND ur.role IN ('admin', 'manager', 'vendeur');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_closing_operators(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_cash_closing_operators(uuid) IS
  'Retourne (user_id, owner_name) des utilisateurs admin/manager/vendeur '
  'd''une organisation -- jamais super_admin ni comptable. Utilisé par '
  'CashClosing.tsx pour construire le filtre "Vendeur" côté serveur '
  '(remplace la jointure profiles+user_roles faite côté client). Lève une '
  'exception explicite (jamais de [] silencieux) si l''appelant n''est ni '
  'super_admin ni membre de l''organisation demandée.';
