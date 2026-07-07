-- ============================================================
-- Isolation multi-tenant — user_roles et profiles
-- Date: 2026-07-08
--
-- Problème : un admin d'une organisation peut voir tous les users
-- de toutes les organisations (politique user_roles_select_own_or_admin
-- laisse passer tous les admins sans scope org).
--
-- Fix :
--   1. user_roles : admin voit uniquement les rôles des users de SON org
--   2. profiles : admin voit uniquement les profils de SON org
--   3. super_admin garde tous les droits (lecture seule sur tout)
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. user_roles — politique SELECT scopée par organisation
-- ════════════════════════════════════════════════════════════════
-- Un utilisateur peut voir :
--   - Son propre rôle
--   - Les rôles des users de SON organisation (s'il est admin/super_admin)
--   - Tous les rôles (s'il est super_admin)
-- ============================================================

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;

CREATE POLICY "user_roles_select_scoped" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    -- Voir son propre rôle
    user_id = auth.uid()
    -- OU super_admin voit tout
    OR public.is_super_admin()
    -- OU admin/manager voit les rôles des users de SA propre organisation
    OR (
      public.has_role(auth.uid(), 'admin')
      AND EXISTS (
        SELECT 1 FROM public.profiles p_caller
        WHERE p_caller.user_id = auth.uid()
          AND p_caller.organization_id IS NOT NULL
          AND p_caller.organization_id IN (
            SELECT p_target.organization_id
            FROM public.profiles p_target
            WHERE p_target.user_id = user_roles.user_id
          )
      )
    )
  );

-- ════════════════════════════════════════════════════════════════
-- 2. profiles — politique SELECT scopée par organisation
-- ════════════════════════════════════════════════════════════════
-- Un utilisateur peut voir :
--   - Son propre profil
--   - Les profils des users de SON organisation (s'il est admin/super_admin)
--   - Tous les profils (s'il est super_admin)
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_scoped" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    -- Voir son propre profil
    user_id = auth.uid()
    -- OU super_admin voit tout
    OR public.is_super_admin()
    -- OU admin/manager voit les profils de SA propre organisation
    OR (
      public.has_role(auth.uid(), 'admin')
      AND organization_id IS NOT NULL
      AND organization_id = (
        SELECT p_caller.organization_id
        FROM public.profiles p_caller
        WHERE p_caller.user_id = auth.uid()
          AND p_caller.organization_id IS NOT NULL
        LIMIT 1
      )
    )
  );

-- ════════════════════════════════════════════════════════════════
-- 3. user_audit_log — politique SELECT scopée par organisation
-- ════════════════════════════════════════════════════════════════
-- Même logique : un admin ne voit que les audit logs de son org.
-- ============================================================

DO $$
BEGIN
  -- Vérifier si la table user_audit_log a une colonne organization_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_audit_log'
      AND column_name = 'organization_id'
  ) THEN
    DROP POLICY IF EXISTS "user_audit_log_select_scoped" ON public.user_audit_log;
    CREATE POLICY "user_audit_log_select_scoped" ON public.user_audit_log
      FOR SELECT TO authenticated
      USING (
        -- Voir ses propres actions
        actor_id = auth.uid() OR target_user_id = auth.uid()
        -- OU super_admin voit tout
        OR public.is_super_admin()
        -- OU admin voit les logs de SA propre organisation
        OR (
          public.has_role(auth.uid(), 'admin')
          AND organization_id IS NOT NULL
          AND organization_id = (
            SELECT p_caller.organization_id
            FROM public.profiles p_caller
            WHERE p_caller.user_id = auth.uid()
              AND p_caller.organization_id IS NOT NULL
            LIMIT 1
          )
        )
      );
    RAISE NOTICE '✓ user_audit_log policy créée';
  ELSE
    RAISE NOTICE '⚠ user_audit_log n''a pas de colonne organization_id — policy ignorée';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- Vérification
-- ════════════════════════════════════════════════════════════════
-- Lister les policies après migration
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('user_roles', 'profiles', 'user_audit_log')
-- ORDER BY tablename, policyname;
