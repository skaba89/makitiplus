-- ============================================================
-- Force Row Level Security on all user-facing tables
-- Date: 2026-07-05
--
-- Without FORCE ROW LEVEL SECURITY, the table owner (postgres)
-- and superusers bypass RLS policies. This migration forces
-- RLS evaluation for ALL roles including table owners, ensuring
-- that no backend script or future admin can accidentally bypass
-- tenant isolation.
--
-- This is a one-time hardening migration. Idempotent (ALTER is
-- safe to re-run).
-- ============================================================

-- Core business tables
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stores FORCE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements FORCE ROW LEVEL SECURITY;

-- SaaS / subscription tables
ALTER TABLE public.plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events FORCE ROW LEVEL SECURITY;

-- Supplier & procurement tables
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items FORCE ROW LEVEL SECURITY;

-- Loyalty tables
ALTER TABLE public.loyalty_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rewards FORCE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions FORCE ROW LEVEL SECURITY;

-- Support & sync tables
ALTER TABLE public.support_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sync_conflicts FORCE ROW LEVEL SECURITY;

-- Security & audit tables
ALTER TABLE public.user_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.backups FORCE ROW LEVEL SECURITY;

-- Verify: count tables with FORCE RLS
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relforcerowsecurity = true;

  RAISE NOTICE 'FORCE ROW LEVEL SECURITY active on % public tables', v_count;
END;
$$;
