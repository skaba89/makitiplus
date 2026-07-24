-- ════════════════════════════════════════════════════════════════
-- Fix défense-en-profondeur : politique UPDATE sur organizations mal
-- scopée pour le cas "admin" (faille latente, pas activement exploitable
-- en l'état — voir analyse ci-dessous).
-- Date: 2026-07-24 — trouvé en audit RLS (P4, gap-closing)
--
-- Bug : la politique "admin_can_update_org" (créée par
-- 20260705030000_fix_super_admin_rls_and_has_role.sql) autorise via
-- `public.has_role(auth.uid(), 'admin')` — cette fonction, dans sa
-- branche "self-check" (appelée quand _user_id = auth.uid(), le cas de
-- tout appel RLS), vérifie uniquement "cet utilisateur a-t-il le rôle
-- admin QUELQUE PART", sans aucune comparaison avec la ligne organizations
-- ciblée par l'UPDATE (ni USING ni WITH CHECK ne référencent `id`). Sur
-- le papier, un admin de l'organisation A pourrait cibler
-- UPDATE organizations SET ... WHERE id = '<uuid de l'organisation B>'.
--
-- Vérification live (transaction BEGIN/ROLLBACK, admin réel org A ciblant
-- une org B réelle et distincte) : le test a montré 0 ligne affectée,
-- alors même que has_role(auth.uid(),'admin') évalue à true dans le même
-- contexte. Raison : la policy SELECT "members_can_view_org" (USING
-- is_super_admin() OR is_member_of_organization(id), et
-- is_member_of_organization vérifie profiles.organization_id = _org_id)
-- rend la ligne cible invisible pour cet admin — Postgres a besoin d'une
-- ligne visible via une policy SELECT applicable pour évaluer la clause
-- WHERE d'un UPDATE, donc l'UPDATE ne trouve aucune ligne à modifier,
-- indépendamment de la policy UPDATE elle-même trop permissive.
--
-- Conclusion : la faille est réelle dans la policy UPDATE mais
-- actuellement NEUTRALISÉE en pratique par effet de bord de la policy
-- SELECT — ce n'est pas une protection voulue ni robuste (elle
-- dépendrait d'un changement futur de is_member_of_organization(), d'un
-- appel via une fonction SECURITY DEFINER qui contournerait le SELECT,
-- etc.). On corrige quand même la policy UPDATE pour qu'elle soit
-- correcte par elle-même (defense-in-depth), sans changement de
-- comportement observable côté applicatif.
--
-- Fix : ajouter la condition manquante — l'admin ne peut agir que sur SA
-- PROPRE organisation (id = get_user_organization_id()). super_admin et
-- owner_user_id restent inchangés (déjà correctement scopés par nature :
-- super_admin bypass volontaire, owner_user_id = auth.uid() ne peut déjà
-- matcher que la ligne dont l'appelant est propriétaire).
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admin_can_update_org" ON public.organizations;
CREATE POLICY "admin_can_update_org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR owner_user_id = auth.uid()
    OR (id = public.get_user_organization_id() AND public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    public.is_super_admin()
    OR owner_user_id = auth.uid()
    OR (id = public.get_user_organization_id() AND public.has_role(auth.uid(), 'admin'))
  );
