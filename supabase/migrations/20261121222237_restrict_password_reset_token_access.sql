-- Reset tokens are minted and redeemed by server-side Edge Functions only.
-- Keep the existing tenant-scoped admin history panel, but never expose hashes
-- or permit a browser to mint, alter or delete a token.
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_reset_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, channel, destination, created_at, expires_at, used_at)
  ON public.password_reset_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.password_reset_tokens TO service_role;

DROP POLICY IF EXISTS admins_view_reset_tokens ON public.password_reset_tokens;
DROP POLICY IF EXISTS admins_view_reset_tokens_org ON public.password_reset_tokens;
CREATE POLICY admins_view_reset_tokens_org
  ON public.password_reset_tokens FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      public.is_super_admin()
      OR (organization_id = public.get_user_organization_id()
          AND public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );
