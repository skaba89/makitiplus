-- ============================================================
-- Auth profile/role bootstrap safety
-- Date: 2026-07-07
--
-- Purpose:
--   Fix production login state where Supabase Auth succeeds but the
--   frontend cannot load the authenticated user's role/profile.
--
-- Safety:
--   - No destructive data reset.
--   - No access granted to auth.users.
--   - No POS/offline/Stripe/Billing changes.
--   - Read policies are scoped to auth.uid().
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read only their own profile.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Allow authenticated users to update only their own profile.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Allow authenticated users to read only their own role rows.
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Super admins can read profiles/roles for admin screens.
-- This depends on the existing public.is_super_admin() helper.
DROP POLICY IF EXISTS "profiles_select_super_admin" ON public.profiles;
CREATE POLICY "profiles_select_super_admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS "user_roles_select_super_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_super_admin"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.is_super_admin());

-- Diagnostic helper for the connected user.
-- The frontend can call this when login succeeds but userRole/profile is missing.
CREATE OR REPLACE FUNCTION public.auth_bootstrap_status()
RETURNS TABLE (
  user_id UUID,
  has_profile BOOLEAN,
  has_role BOOLEAN,
  role public.app_role,
  profile_is_active BOOLEAN,
  organization_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  RETURN QUERY
  SELECT
    v_user_id AS user_id,
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.user_id = v_user_id
    ) AS has_profile,
    EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_user_id
    ) AS has_role,
    (
      SELECT ur.role FROM public.user_roles ur
      WHERE ur.user_id = v_user_id
      ORDER BY CASE ur.role WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
      LIMIT 1
    ) AS role,
    (
      SELECT p.is_active FROM public.profiles p
      WHERE p.user_id = v_user_id
      LIMIT 1
    ) AS profile_is_active,
    (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = v_user_id
      LIMIT 1
    ) AS organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.auth_bootstrap_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_bootstrap_status() TO authenticated;

NOTIFY pgrst, 'reload schema';
