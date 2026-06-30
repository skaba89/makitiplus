-- Fix RLS policies: prevent self-role-escalation and include super_admin in all policies
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. FIX: Prevent self-role-escalation on user_roles INSERT
-- Remove the clause allowing users to self-assign vendeur/manager/comptable
-- Only admin/super_admin should assign roles
-- ============================================
DROP POLICY IF EXISTS "user_roles_insert_self_or_admin" ON user_roles;

CREATE POLICY "user_roles_insert_admin_only" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Admin can assign any role
    has_role(auth.uid(), 'admin')
    -- Super admin can assign any role
    OR is_super_admin()
  );

-- ============================================
-- 2. FIX: Include super_admin in user_roles DELETE
-- ============================================
DROP POLICY IF EXISTS "Admins can delete user roles" ON user_roles;

CREATE POLICY "Admins can delete user roles" ON user_roles
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 3. FIX: Include super_admin in audit_log INSERT
-- ============================================
DROP POLICY IF EXISTS "admins_insert_audit_log" ON user_audit_log;

CREATE POLICY "admins_insert_audit_log" ON user_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 4. FIX: Include super_admin in reset_tokens INSERT
-- ============================================
DROP POLICY IF EXISTS "admins_insert_reset_tokens" ON password_reset_tokens;

CREATE POLICY "admins_insert_reset_tokens" ON password_reset_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 5. FIX: Include super_admin in profiles UPDATE
-- (Allows super_admin to edit other users' profiles)
-- ============================================
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

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
-- 6. FIX: Add org scoping to logos storage policies
-- ============================================
-- Note: Storage policies can't easily check org membership in a single policy.
-- For now, we keep authenticated-only but add a comment for future improvement.
-- A proper fix would require a custom storage handler or edge function.

-- ============================================
-- 7. FIX: check_account_status should return false when no profile exists
-- ============================================
CREATE OR REPLACE FUNCTION check_account_status(check_user_id UUID)
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(p.is_active, FALSE),  -- FALSE instead of TRUE when no profile
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
