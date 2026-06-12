-- Revoke PUBLIC on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.is_user_active(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_organization_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_sale_item_organization() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_sale_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_stock_conflict(integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_organization_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_member_of_organization(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_account_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_last_login() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_exists() FROM PUBLIC;

-- Re-grant only to legitimate roles
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_member_of_organization(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_user_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_stock_conflict(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_sale_number() TO service_role;