-- ═══════════════════════════════════════════════════════════════════════
-- FIX: RLS policies on profiles & user_roles for self-signup flow
-- 
-- PROBLEM: The signup flow in AuthContext.tsx inserts into profiles,
-- organizations, and user_roles directly from the frontend client.
-- Current RLS policies block this because the just-signed-up user
-- doesn't yet have a role (chicken-and-egg: can't insert profile
-- because has_role() returns false, because no profile exists yet).
--
-- SOLUTION: 
--   1. Allow INSERT on profiles if user_id = auth.uid() (self-signup)
--   2. Allow INSERT on user_roles for the first admin (admin_exists() = false)
--   3. Keep all other policies strict
--
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. FIX profiles INSERT policy
-- ─────────────────────────────────────────────────────────────────────
-- Drop the old restrictive INSERT policy
DROP POLICY IF EXISTS "profiles_insert_own_or_admin" ON public.profiles;

-- New INSERT policy: allow self-signup OR admin/super_admin
CREATE POLICY "profiles_insert_own_or_admin"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  -- Self-signup: user creates their own profile
  auth.uid() = user_id
  -- OR admin/super_admin creating someone else's profile
  OR public.has_role(auth.uid(), 'admin')
  OR public.is_super_admin()
);

-- ─────────────────────────────────────────────────────────────────────
-- 2. FIX organizations INSERT policy (for first super_admin signup)
-- ─────────────────────────────────────────────────────────────────────
-- Drop old policy if it exists
DROP POLICY IF EXISTS "admin_can_create_org" ON public.organizations;

-- Allow any authenticated user to create an org (needed for first signup)
-- The owner_user_id must be their own user_id
CREATE POLICY "admin_can_create_org"
ON public.organizations FOR INSERT TO authenticated
WITH CHECK (
  -- Self-signup: user creates org with themselves as owner
  owner_user_id = auth.uid()
  -- OR admin/super_admin creating orgs
  OR public.has_role(auth.uid(), 'admin')
  OR public.is_super_admin()
);

-- ─────────────────────────────────────────────────────────────────────
-- 3. FIX user_roles INSERT policy  
-- ─────────────────────────────────────────────────────────────────────
-- Drop duplicate/overlapping policies
DROP POLICY IF EXISTS "Users can create their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Allow first admin or admin-created roles" ON public.user_roles;

-- Single clean INSERT policy
CREATE POLICY "user_roles_insert_self_or_admin"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  -- First admin self-signup: no admin exists yet, user assigns themselves admin role
  (NOT public.admin_exists() AND auth.uid() = user_id AND role IN ('admin', 'super_admin'))
  -- Self-assignment of non-admin roles (vendeur, manager, comptable)
  OR (auth.uid() = user_id AND role IN ('vendeur', 'manager', 'comptable'))
  -- Admin creating roles for others
  OR public.has_role(auth.uid(), 'admin')
  -- Super admin creating roles
  OR public.is_super_admin()
);

-- ─────────────────────────────────────────────────────────────────────
-- 4. VERIFY: Check that RLS is still enabled on these tables
-- ─────────────────────────────────────────────────────────────────────
-- These should all return 'true'
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('profiles', 'user_roles', 'organizations');

-- ═══════════════════════════════════════════════════════════════════════
-- DONE! The self-signup flow should now work:
--   1. supabase.auth.signUp() → creates auth user
--   2. INSERT organizations → allowed (owner_user_id = auth.uid())
--   3. INSERT profiles → allowed (user_id = auth.uid())
--   4. INSERT user_roles → allowed (first admin OR admin-created)
-- ═══════════════════════════════════════════════════════════════════════
