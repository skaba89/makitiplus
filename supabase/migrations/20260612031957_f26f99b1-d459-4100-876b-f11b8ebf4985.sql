REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_organization_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_member_of_organization(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_account_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_last_login() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_exists() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO service_role;