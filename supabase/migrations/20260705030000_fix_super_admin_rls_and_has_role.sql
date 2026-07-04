-- Migration: Fix super_admin access — RLS policies + has_role fix
-- Date: 2026-07-05
-- Changes:
--   1. Fix user_roles SELECT RLS policy to include is_super_admin()
--   2. Fix profiles SELECT RLS policy to include is_super_admin()
--   3. Fix has_role() so super_admin is treated as having admin privileges
--   4. Fix organizations UPDATE and audit_log SELECT RLS for super_admin


-- STEP 0: Drop conflicting user_roles SELECT policy (only checks 'admin', not 'super_admin')
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public.user_roles;

CREATE POLICY "user_roles_select_own_or_admin"
ON public.user_roles FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_super_admin()
  OR public.has_role(auth.uid(), 'admin')
);


-- STEP 1: Fix profiles SELECT — ensure super_admin can see all profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR organization_id = public.get_user_organization_id()
  );


-- STEP 2: Fix has_role to also match super_admin when checking 'admin'
-- (super_admin should be treated as having admin privileges too)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Self-check: user can check their own role
  IF _user_id = auth.uid() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND (role = _role OR (_role = 'admin' AND role = 'super_admin'))
    );
  END IF;

  -- Super admin can check any user's role
  IF public.is_super_admin() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND (role = _role OR (_role = 'admin' AND role = 'super_admin'))
    );
  END IF;

  -- Admin of the same organization can check
  DECLARE
    v_caller_org uuid;
    v_target_org uuid;
  BEGIN
    SELECT organization_id INTO v_caller_org
    FROM public.profiles WHERE user_id = auth.uid() AND is_active = true;

    SELECT organization_id INTO v_target_org
    FROM public.profiles WHERE user_id = _user_id;

    IF v_caller_org IS NOT NULL AND v_caller_org = v_target_org THEN
      IF EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
      ) THEN
        RETURN EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = _user_id AND (role = _role OR (_role = 'admin' AND role = 'super_admin'))
        );
      END IF;
    END IF;

    RETURN FALSE;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;


-- STEP 3: Fix organizations UPDATE RLS for super_admin
DROP POLICY IF EXISTS "admin_can_update_org" ON public.organizations;
CREATE POLICY "admin_can_update_org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.is_super_admin()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );


-- STEP 4: Fix user_audit_log SELECT RLS for super_admin
DROP POLICY IF EXISTS "admins_view_audit_log" ON public.user_audit_log;
CREATE POLICY "admins_view_audit_log" ON public.user_audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin')
  );


-- STEP 5: Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
