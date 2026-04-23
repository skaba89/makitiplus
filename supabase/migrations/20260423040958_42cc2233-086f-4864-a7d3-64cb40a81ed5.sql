-- Function to check if any admin already exists (used to allow first signup as admin)
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  );
$$;

-- Ensure only one admin can exist (race condition protection)
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_admin ON public.user_roles (role)
WHERE role = 'admin';

-- RLS: only admin can insert into user_roles (except the very first admin)
DROP POLICY IF EXISTS "Users can insert their own role on signup" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert any role" ON public.user_roles;
DROP POLICY IF EXISTS "Allow first admin or admin-created roles" ON public.user_roles;

CREATE POLICY "Allow first admin or admin-created roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow if no admin exists yet AND user is creating their own admin role
  (NOT public.admin_exists() AND auth.uid() = user_id AND role = 'admin')
  OR
  -- Allow existing admins to create any role for any user
  public.has_role(auth.uid(), 'admin')
);

-- Allow admins to delete user_roles
DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
CREATE POLICY "Admins can delete user roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all user_roles
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

-- Allow admins to view/update all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

-- Allow admins to insert profiles for other users
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.profiles;
CREATE POLICY "Admins can insert any profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);