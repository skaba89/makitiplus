-- 1. Add IP address column to audit log (admin-only visible via existing RLS)
ALTER TABLE public.user_audit_log
  ADD COLUMN IF NOT EXISTS ip_address text;

-- 2. Tighten password_reset_tokens RLS: admins only see tokens of their own org
DROP POLICY IF EXISTS admins_view_reset_tokens ON public.password_reset_tokens;

CREATE POLICY admins_view_reset_tokens_org
ON public.password_reset_tokens
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND organization_id = public.get_user_organization_id()
);

-- Insert policy: admin must insert for their own org
DROP POLICY IF EXISTS admins_insert_reset_tokens ON public.password_reset_tokens;

CREATE POLICY admins_insert_reset_tokens_org
ON public.password_reset_tokens
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND organization_id = public.get_user_organization_id()
);
