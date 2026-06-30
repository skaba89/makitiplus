-- Migration: Fix RLS self-escalation vulnerability and include super_admin in all policies
-- Date: 2026-07-01
-- FULLY IDEMPOTENT — safe to re-run any number of times

-- ============================================
-- 1. Prevent self-role-escalation on user_roles INSERT
-- ============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "user_roles_insert_self_or_admin" ON user_roles;
  DROP POLICY IF EXISTS "user_roles_insert_admin_only" ON user_roles;
  DROP POLICY IF EXISTS "Users can create their own role" ON user_roles;
  DROP POLICY IF EXISTS "Allow first admin or admin-created roles" ON user_roles;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'user_roles drop: %', SQLERRM;
END $$;

CREATE POLICY "user_roles_insert_admin_only" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 2. Include super_admin in user_roles DELETE
-- ============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete user roles" ON user_roles;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'user_roles delete drop: %', SQLERRM;
END $$;

CREATE POLICY "Admins can delete user roles" ON user_roles
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 3. Include super_admin in audit_log INSERT
-- ============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "admins_insert_audit_log" ON user_audit_log;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'audit_log drop: %', SQLERRM;
END $$;

CREATE POLICY "admins_insert_audit_log" ON user_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 4. Include super_admin in reset_tokens INSERT
-- ============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "admins_insert_reset_tokens" ON password_reset_tokens;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'reset_tokens drop: %', SQLERRM;
END $$;

CREATE POLICY "admins_insert_reset_tokens" ON password_reset_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 5. Include super_admin in profiles UPDATE
-- ============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'profiles update drop: %', SQLERRM;
END $$;

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR is_super_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 6. check_account_status returns FALSE when no profile
-- ============================================
CREATE OR REPLACE FUNCTION check_account_status(check_user_id UUID)
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(p.is_active, FALSE),
    r.role::TEXT,
    p.organization_id
  FROM profiles p
  LEFT JOIN user_roles r ON r.user_id = p.user_id
  WHERE p.user_id = check_user_id
  UNION ALL
  SELECT FALSE, NULL, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = check_user_id
  );
$$;
