-- P0: organization ownership is not platform-wide authorization.
-- The historical helper also returned true for every organization owner,
-- causing policies that allow super_admin to expose unrelated tenants.
-- Preserve the RPC signature and explicit platform roles; no role/data rewrite.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'::public.app_role
  );
$$;
