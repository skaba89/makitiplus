-- ════════════════════════════════════════════════════════════════
-- Fix SÉCURITÉ : la policy "cacher super_admin aux admins d'org" sur
-- profiles ET user_audit_log ne fonctionnait pas en pratique -- trouvé
-- sur le compte réel Diallo & Frères (le super_admin de la plateforme,
-- "Ousmane Kaba", apparaissait dans le filtre "Vendeur" de la page
-- Clôture de Caisse, visible par l'admin du magasin "DIALLO mamadou").
--
-- Cause racine : les deux policies excluent un super_admin via
--   NOT (user_id IN (SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'super_admin'))
-- Cette sous-requête sur user_roles s'exécute avec le contexte RLS de
-- l'APPELANT, pas en accès complet. Or user_roles_select_scoped
-- (20260724120000) exclut déjà explicitement les lignes role=super_admin
-- de ce qu'un admin peut voir. Résultat : pour un admin d'org, la
-- sous-requête "SELECT user_id FROM user_roles WHERE role='super_admin'"
-- renvoie TOUJOURS zéro ligne (il ne peut voir aucune ligne
-- super_admin) -- donc NOT (user_id IN (ensemble vide)) est TOUJOURS
-- vrai, et la clause d'exclusion ne filtre jamais rien. Le super_admin
-- reste visible malgré l'intention explicite du code (migrations
-- 20260715100000 "hide_super_admin_from_org_admins" et
-- 20260715120000 "emergency_login_fix", jamais réellement effectives
-- en production sur ce point précis).
--
-- Fix : fonction SECURITY DEFINER dédiée (même mécanisme que
-- get_organization_id_of_user(), 20260724120000) qui vérifie le rôle
-- de N'IMPORTE QUEL user_id en bypassant RLS, au lieu d'une
-- sous-requête soumise au contexte RLS de l'appelant.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_user_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_super_admin(uuid) TO authenticated;

-- 1. profiles : remplacer la sous-requête cassée par l'appel bypass-RLS
DROP POLICY IF EXISTS "profiles_select_scoped" ON public.profiles;
CREATE POLICY "profiles_select_scoped"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR (
      public.has_role(auth.uid(), 'admin')
      AND organization_id = public.get_user_organization_id()
      AND NOT public.is_user_super_admin(user_id)
    )
    OR (
      organization_id = public.get_user_organization_id()
      AND NOT public.is_user_super_admin(user_id)
    )
  );

-- 2. user_audit_log : même correction
DROP POLICY IF EXISTS "admins_view_audit_log" ON public.user_audit_log;
CREATE POLICY "admins_view_audit_log"
  ON public.user_audit_log FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_role(auth.uid(), 'admin')
      AND (
        actor_id IN (
          SELECT p.user_id FROM public.profiles p
          WHERE p.organization_id = public.get_user_organization_id()
        )
        OR target_user_id IN (
          SELECT p.user_id FROM public.profiles p
          WHERE p.organization_id = public.get_user_organization_id()
        )
      )
      AND NOT public.is_user_super_admin(actor_id)
    )
  );
