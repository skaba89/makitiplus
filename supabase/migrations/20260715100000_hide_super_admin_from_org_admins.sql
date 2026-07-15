-- ════════════════════════════════════════════════════════════════
-- Migration: hide_super_admin_from_org_admins
-- Date: 2026-07-15
-- Objectif: 
--   1. Les admins d'org NE doivent PAS voir les super_admins dans :
--      - user_roles (liste des rôles)
--      - profiles (liste des profils)
--      - user_audit_log (journal d'audit)
--   2. Le super_admin continue de voir TOUT
--   3. Les admins continuent de voir les users de LEUR org
-- ════════════════════════════════════════════════════════════════

-- 1. Policy user_roles SELECT : les admins ne voient pas les super_admins
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_scoped" ON public.user_roles;

CREATE POLICY "user_roles_select_scoped"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    -- L'utilisateur voit toujours son propre rôle
    user_id = auth.uid()
    -- Le super_admin voit TOUS les rôles
    OR public.is_super_admin()
    -- Un admin voit les rôles des users de SON org, SAUF les super_admins
    OR (
      public.has_role(auth.uid(), 'admin')
      AND user_id IN (
        SELECT p2.user_id FROM public.profiles p2
        WHERE p2.organization_id = public.get_user_organization_id()
      )
      AND role != 'super_admin'
    )
  );

-- 2. Policy profiles SELECT : les admins ne voient pas les super_admins
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_scoped" ON public.profiles;

CREATE POLICY "profiles_select_scoped"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    -- L'utilisateur voit toujours son propre profil
    user_id = auth.uid()
    -- Le super_admin voit TOUS les profils
    OR public.is_super_admin()
    -- Un admin voit les profils de SON org, SAUF les super_admins
    OR (
      public.has_role(auth.uid(), 'admin')
      AND organization_id = public.get_user_organization_id()
      AND user_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
    -- Un manager/vendeur/comptable voit les profils de SON org, SAUF les super_admins
    OR (
      organization_id = public.get_user_organization_id()
      AND user_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
  );

-- 3. Policy user_audit_log SELECT : les admins ne voient pas les actions du super_admin
DROP POLICY IF EXISTS "admins_view_audit_log" ON public.user_audit_log;

CREATE POLICY "admins_view_audit_log"
  ON public.user_audit_log FOR SELECT TO authenticated
  USING (
    -- Le super_admin voit tout l'audit
    public.is_super_admin()
    -- Les admins voient l'audit de leur org seulement
    OR (
      public.has_role(auth.uid(), 'admin')
      AND (
        -- Actions faites PAR un user de leur org
        actor_id IN (
          SELECT p.user_id FROM public.profiles p
          WHERE p.organization_id = public.get_user_organization_id()
        )
        -- Actions faites SUR un user de leur org
        OR target_user_id IN (
          SELECT p.user_id FROM public.profiles p
          WHERE p.organization_id = public.get_user_organization_id()
        )
      )
      -- Exclure les lignes où l'actor est un super_admin
      AND actor_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
  );

-- 4. Vérification
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Policies RLS durcies :';
  RAISE NOTICE '- user_roles_select_scoped : admins ne voient pas super_admins';
  RAISE NOTICE '- profiles_select_scoped : admins ne voient pas super_admins';
  RAISE NOTICE '- admins_view_audit_log : admins ne voient pas actions super_admin';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
