REVOKE EXECUTE ON FUNCTION public.is_user_active(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_organization_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_sale_item_organization() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_sale_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_stock_conflict(integer, integer, integer) FROM anon, authenticated;