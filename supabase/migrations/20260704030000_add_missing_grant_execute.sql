-- ============================================================
-- Add missing GRANT EXECUTE on SECURITY DEFINER functions
-- Date: 2026-07-04
--
-- The SQL validator found 49 warnings about SECURITY DEFINER
-- functions missing GRANT EXECUTE TO authenticated.
-- Without explicit GRANT, only the function owner (postgres) can
-- call them. PostgREST requires authenticated users to have EXECUTE
-- permission to call RPCs. Some functions already work because they
-- were created by the postgres role, but this is fragile.
--
-- This migration adds GRANT EXECUTE TO authenticated for all
-- SECURITY DEFINER functions that are NOT triggers.
-- ============================================================

-- ─── Core auth helpers ────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.admin_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_of_organization() TO authenticated;

-- ─── Onboarding ───────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.update_onboarding_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_onboarding_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_business_type() TO authenticated;
GRANT EXECUTE ON FUNCTION public.setup_onboarding_store() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_onboarding_checklist() TO authenticated;

-- ─── Stock transfers ─────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.generate_transfer_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_stock_transfer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_stock_transfer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_stock_transfer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_transfers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_transfer_details() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_transfers_count() TO authenticated;

-- ─── Restock suggestions ─────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_restock_suggestions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_suggestions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_order_history() TO authenticated;

-- ─── Loyalty ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.earn_loyalty_points() TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_loyalty_tier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_loyalty_stats() TO authenticated;

-- ─── Backup/Restore ──────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.generate_backup_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_backup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_backup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_backups() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_backup_details() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_backup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_backup_stats() TO authenticated;

-- ─── Support tickets ─────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.generate_ticket_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_ticket() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_ticket_message() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ticket_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ticket_messages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_support_ticket() TO authenticated;

-- ─── Subscription lifecycle ──────────────────────────────────
GRANT EXECUTE ON FUNCTION public.process_subscription_lifecycle() TO authenticated;

-- ─── Multi-store (from _deploy_combined.sql) ─────────────────
GRANT EXECUTE ON FUNCTION public.get_organization_stores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_update_stock() TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
