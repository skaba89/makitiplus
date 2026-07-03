-- ============================================================
-- P1 Fix: Add missing GRANT EXECUTE on SECURITY DEFINER functions
-- Date: 2026-07-03
--
-- Trigger functions (RETURNS TRIGGER) do NOT need GRANT EXECUTE
-- because they are called by PostgreSQL internally, not by users.
--
-- This migration adds GRANT EXECUTE only on RPC/utility functions
-- that may be called by authenticated users or by other RPCs.
-- ============================================================

-- ─── Utility functions used by RPCs and frontend ────────────────

-- get_user_organization_id: called by almost every RPC
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;

-- is_member_of_organization: membership check
GRANT EXECUTE ON FUNCTION public.is_member_of_organization(UUID) TO authenticated;

-- admin_exists: signup-time check (also used by anon for registration)
GRANT EXECUTE ON FUNCTION public.admin_exists() TO authenticated, anon;

-- touch_last_login: called after auth
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;

-- is_user_active: account status check
GRANT EXECUTE ON FUNCTION public.is_user_active() TO authenticated;

-- check_account_status: account status check
GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated;

-- ─── Done ──────────────────────────────────────────────────────
