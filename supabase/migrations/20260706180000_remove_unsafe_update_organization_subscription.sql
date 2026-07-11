-- ============================================================
-- Remove unsafe own-organization subscription update RPC
-- Date: 2026-07-06
--
-- This RPC allowed authenticated users to update their own
-- subscription plan/status outside Stripe and outside platform
-- super_admin validation.
-- Manual subscription changes must go through:
-- public.admin_update_organization_subscription(...)
-- which enforces public.is_super_admin().
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.update_organization_subscription(TEXT, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_organization_subscription(TEXT, TEXT, TEXT) FROM anon;

DROP FUNCTION IF EXISTS public.update_organization_subscription(TEXT, TEXT, TEXT);

NOTIFY pgrst, 'reload schema';
