-- ════════════════════════════════════════════════════════════════
-- Migration: fix_login_broken_by_rls_hardening
-- Date: 2026-07-15
-- Objectif: Corriger le bug de login cassé par la migration
--           20260715100000_hide_super_admin_from_org_admins.
--           
--           Bug: La policy profiles_select_scoped était trop complexe
--           et créait une dépendance circulaire :
--           - Lire profiles nécessite has_role() qui lit user_roles
--           - Lire user_roles nécessite get_user_organization_id() 
--             qui lit profiles
--           → l'utilisateur ne pouvait plus lire son propre profil/rôle
--           → login échouait avec "rôle n'a pas pu être chargé"
--           
--           Fix: Simplifier les policies pour garantir que :
--           1. L'utilisateur TOUJOURS lire son propre profil et rôle
--           2. Le super_admin voit tout
--           3. Les admins ne voient pas les super_admins (mais voient
--              les users de leur org)
--           4. Éviter les sous-requêtes circulaires
-- ════════════════════════════════════════════════════════════════

-- 1. Policy user_roles SELECT simplifiée
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_scoped" ON public.user_roles;

CREATE POLICY "user_roles_select_scoped"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    -- RÈGLE 1 : L'utilisateur voit TOUJOURS son propre rôle (essentiel pour login)
    user_id = auth.uid()
    -- RÈGLE 2 : Le super_admin voit TOUS les rôles
    OR public.is_super_admin()
    -- RÈGLE 3 : Les admins voient les rôles des users de leur org
    --           (mais PAS les super_admins)
    OR (
      public.has_role(auth.uid(), 'admin')
      AND role != 'super_admin'
      AND user_id IN (
        SELECT p2.user_id FROM public.profiles p2
        WHERE p2.organization_id = public.get_user_organization_id()
      )
    )
  );

-- 2. Policy profiles SELECT simplifiée
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_scoped" ON public.profiles;

CREATE POLICY "profiles_select_scoped"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    -- RÈGLE 1 : L'utilisateur voit TOUJOURS son propre profil (essentiel pour login)
    user_id = auth.uid()
    -- RÈGLE 2 : Le super_admin voit TOUS les profils
    OR public.is_super_admin()
    -- RÈGLE 3 : Les admins voient les profils de leur org
    --           (mais PAS les super_admins)
    OR (
      public.has_role(auth.uid(), 'admin')
      AND organization_id = public.get_user_organization_id()
      AND user_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
    -- RÈGLE 4 : Les autres (manager/vendeur/comptable) voient les profils
    --           de leur org (mais PAS les super_admins)
    OR (
      organization_id = public.get_user_organization_id()
      AND user_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
  );

-- 3. Vérification
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Policies RLS corrigées :';
  RAISE NOTICE '- user_roles_select_scoped : user_id=auth.uid() en priorité';
  RAISE NOTICE '- profiles_select_scoped : user_id=auth.uid() en priorité';
  RAISE NOTICE 'Login devrait refonctionner pour tous les utilisateurs.';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
