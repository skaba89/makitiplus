-- ════════════════════════════════════════════════════════════════
-- Migration: emergency_login_fix
-- Date: 2026-07-15
-- Objectif: Diagnostic + correction du login cassé.
--           
--           Ce SQL fait 3 choses :
--           1. AFFICHE l'état actuel de chaque utilisateur (profiles + user_roles)
--           2. CRÉE les entrées user_roles manquantes pour les users qui ont un profile
--           3. SIMPLIFIE radicalement les policies RLS pour garantir le login
--           
--           ⚠️ Exécuter ce SQL dans Supabase SQL Editor et vérifier
--              la sortie NOTICE pour diagnostiquer les problèmes.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- ÉTAPE 1 : DIAGNOSTIC
-- Afficher tous les utilisateurs avec leur profil et rôle
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_profile_count INTEGER;
  v_user_roles_count INTEGER;
  v_orphan_profiles INTEGER;
  v_orphan_users INTEGER;
BEGIN
  -- Compter les profils
  SELECT COUNT(*) INTO v_profile_count FROM public.profiles;
  
  -- Compter les user_roles
  SELECT COUNT(*) INTO v_user_roles_count FROM public.user_roles;
  
  -- Profils sans user_roles (le bug !)
  SELECT COUNT(*) INTO v_orphan_profiles
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id
  );
  
  -- user_roles sans profils
  SELECT COUNT(*) INTO v_orphan_users
  FROM public.user_roles ur
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = ur.user_id
  );
  
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'DIAGNOSTIC LOGIN';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Total profils: %', v_profile_count;
  RAISE NOTICE 'Total user_roles: %', v_user_roles_count;
  RAISE NOTICE 'Profils SANS user_roles (BUG LOGIN): %', v_orphan_profiles;
  RAISE NOTICE 'user_roles SANS profils: %', v_orphan_users;
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  
  IF v_orphan_profiles > 0 THEN
    RAISE NOTICE '⚠️ CORRECTION: % profils sans user_roles vont être créés', v_orphan_profiles;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- ÉTAPE 2 : CRÉER LES ENTRÉES user_roles MANQUANTES
-- Pour chaque profil qui n'a pas de user_roles, créer une entrée
-- avec le rôle 'admin' par défaut (ou 'vendeur' si l'utilisateur
-- a déjà un organization_id mais n'est pas owner d'org)
-- ════════════════════════════════════════════════════════════════

INSERT INTO public.user_roles (user_id, role)
SELECT 
  p.user_id,
  -- Si l'utilisateur possède une org → admin, sinon vendeur
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.organizations o WHERE o.owner_user_id = p.user_id)
    THEN 'admin'
    ELSE 'vendeur'
  END
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id
)
ON CONFLICT DO NOTHING;

-- Vérifier que cheick a bien son rôle (si son email est dans auth.users)
DO $$
DECLARE
  v_cheick_user_id UUID;
  v_cheick_role TEXT;
  v_cheick_org_id UUID;
BEGIN
  -- Chercher cheick par email
  SELECT id INTO v_cheick_user_id FROM auth.users 
  WHERE email ILIKE '%cheick%' OR email ILIKE '%kaba%' 
  LIMIT 1;
  
  IF v_cheick_user_id IS NOT NULL THEN
    SELECT role INTO v_cheick_role FROM public.user_roles 
    WHERE user_id = v_cheick_user_id LIMIT 1;
    
    SELECT organization_id INTO v_cheick_org_id FROM public.profiles 
    WHERE user_id = v_cheick_user_id LIMIT 1;
    
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE 'VÉRIFICATION CHEICK';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE 'User ID: %', v_cheick_user_id;
    RAISE NOTICE 'Rôle: %', COALESCE(v_cheick_role, 'AUCUN (bug!)');
    RAISE NOTICE 'Organization ID: %', COALESCE(v_cheick_org_id::text, 'AUCUNE');
    
    -- Si cheick n'a toujours pas de rôle, le forcer à 'admin'
    IF v_cheick_role IS NULL THEN
      RAISE NOTICE '⚠️ CORRECTION: Création du rôle admin pour cheick';
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_cheick_user_id, 'admin')
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Si cheick n'a pas d'org_id dans son profil, chercher l'org KFM SARI
    IF v_cheick_org_id IS NULL THEN
      RAISE NOTICE '⚠️ CORRECTION: Assignation org KFM SARI à cheick';
      UPDATE public.profiles 
      SET organization_id = (
        SELECT id FROM public.organizations WHERE name ILIKE '%KFM%' LIMIT 1
      )
      WHERE user_id = v_cheick_user_id;
    END IF;
  ELSE
    RAISE NOTICE 'cheick non trouvé dans auth.users';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- ÉTAPE 3 : SIMPLIFIER RADICALEMENT LES POLICIES RLS
-- Garantir que l'utilisateur peut TOUJOURS lire son propre profil
-- et son propre rôle, indépendamment de toute autre condition.
-- ════════════════════════════════════════════════════════════════

-- Policy user_roles : ULTRA SIMPLE
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_scoped" ON public.user_roles;

CREATE POLICY "user_roles_select_scoped"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    -- RÈGLE 1 (priorité absolue) : son propre rôle
    user_id = auth.uid()
    -- RÈGLE 2 : super_admin voit tout
    OR public.is_super_admin()
    -- RÈGLE 3 : admin voit les rôles de son org (sauf super_admin)
    OR (
      public.has_role(auth.uid(), 'admin')
      AND role != 'super_admin'
    )
  );

-- Policy profiles : ULTRA SIMPLE
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_scoped" ON public.profiles;

CREATE POLICY "profiles_select_scoped"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    -- RÈGLE 1 (priorité absolue) : son propre profil
    user_id = auth.uid()
    -- RÈGLE 2 : super_admin voit tout
    OR public.is_super_admin()
    -- RÈGLE 3 : admin voit les profils de son org (sauf super_admin)
    OR (
      public.has_role(auth.uid(), 'admin')
      AND organization_id = public.get_user_organization_id()
      AND user_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
    -- RÈGLE 4 : autres voient les profils de leur org (sauf super_admin)
    OR (
      organization_id = public.get_user_organization_id()
      AND user_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
  );

-- ════════════════════════════════════════════════════════════════
-- ÉTAPE 4 : VÉRIFICATION FINALE
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_total_users INTEGER;
  v_users_with_role INTEGER;
  v_users_without_role INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM public.profiles;
  SELECT COUNT(DISTINCT user_id) INTO v_users_with_role FROM public.user_roles;
  v_users_without_role := v_total_users - v_users_with_role;
  
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'VÉRIFICATION FINALE';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Total profils: %', v_total_users;
  RAISE NOTICE 'Users AVEC rôle: %', v_users_with_role;
  RAISE NOTICE 'Users SANS rôle (devrait être 0): %', v_users_without_role;
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  
  IF v_users_without_role = 0 THEN
    RAISE NOTICE '✅ TOUS les utilisateurs ont un rôle. Login devrait marcher.';
  ELSE
    RAISE NOTICE '⚠️ % utilisateurs n ont toujours pas de rôle!', v_users_without_role;
  END IF;
END $$;
