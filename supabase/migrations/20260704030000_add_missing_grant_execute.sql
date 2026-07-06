-- ============================================================
-- Add missing GRANT EXECUTE on SECURITY DEFINER functions
-- Date: 2026-07-04 (v2 — fixed: resilient to missing functions)
--
-- Each GRANT is wrapped in a DO block that catches the
-- "function does not exist" error (42883) so the migration
-- does not fail if a function hasn't been deployed yet.
-- ============================================================

-- ─── Core auth helpers ────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.admin_exists() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'admin_exists() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'touch_last_login() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.is_user_active() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'is_user_active() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'check_account_status() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_user_organization_id() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.is_member_of_organization() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'is_member_of_organization() does not exist, skipping';
END $$;

-- ─── Onboarding ───────────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.update_onboarding_progress() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_onboarding_progress() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'complete_onboarding() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_onboarding_status() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_onboarding_status() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.update_business_type() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_business_type() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.setup_onboarding_store() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'setup_onboarding_store() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_onboarding_checklist() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_onboarding_checklist() does not exist, skipping';
END $$;

-- ─── Stock transfers ─────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.generate_transfer_number() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'generate_transfer_number() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_stock_transfer() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'create_stock_transfer() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.send_stock_transfer() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'send_stock_transfer() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.receive_stock_transfer() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'receive_stock_transfer() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.cancel_stock_transfer() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'cancel_stock_transfer() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_stock_transfers() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_stock_transfers() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_stock_transfer_details() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_stock_transfer_details() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_pending_transfers_count() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_pending_transfers_count() does not exist, skipping';
END $$;

-- ─── Restock suggestions ─────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_restock_suggestions() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_restock_suggestions() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_suggestions() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'create_purchase_order_from_suggestions() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_supplier_order_history() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_supplier_order_history() does not exist, skipping';
END $$;

-- ─── Loyalty ──────────────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.earn_loyalty_points() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'earn_loyalty_points() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'redeem_loyalty_points() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.update_loyalty_tier() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_loyalty_tier() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_loyalty_stats() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_loyalty_stats() does not exist, skipping';
END $$;

-- ─── Backup/Restore ──────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.generate_backup_number() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'generate_backup_number() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_backup() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'create_backup() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.restore_backup() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'restore_backup() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_backups() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_backups() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_backup_details() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_backup_details() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.delete_backup() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'delete_backup() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_backup_stats() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_backup_stats() does not exist, skipping';
END $$;

-- ─── Support tickets ─────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.generate_ticket_number() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'generate_ticket_number() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_support_ticket() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'create_support_ticket() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.add_ticket_message() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'add_ticket_message() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.update_ticket_status() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_ticket_status() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_support_tickets() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_support_tickets() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_ticket_messages() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_ticket_messages() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_support_stats() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_support_stats() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.delete_support_ticket() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'delete_support_ticket() does not exist, skipping';
END $$;

-- ─── Subscription lifecycle ──────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.process_subscription_lifecycle() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'process_subscription_lifecycle() does not exist, skipping';
END $$;

-- ─── Multi-store ─────────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_organization_stores() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_organization_stores() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.batch_update_stock() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'batch_update_stock() does not exist, skipping';
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
