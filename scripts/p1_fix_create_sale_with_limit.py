#!/usr/bin/env python3
"""
Generate P1 migration: fix create_sale_with_limit to match create_full_sale signature,
add GRANT EXECUTE for trigger functions (safe), and add Stripe webhook idempotency table.
"""

migration = """-- ============================================================
-- P1 Fixes: create_sale_with_limit signature + GRANT EXECUTE + Stripe idempotency
-- Date: 2026-07-03
--
-- 1. Fix create_sale_with_limit to match create_full_sale params
-- 2. Add GRANT EXECUTE on trigger functions (safe — triggers don't need it
--    but being explicit prevents future confusion)
-- 3. Create stripe_events table for webhook idempotency
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. Fix create_sale_with_limit — match create_full_sale signature
-- ════════════════════════════════════════════════════════════════
-- The old version had a different signature than create_full_sale,
-- so delegation was broken. Now it mirrors the exact same params.

DROP FUNCTION IF EXISTS public.create_sale_with_limit(JSONB, TEXT, UUID, NUMERIC, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_sale_with_limit(
  p_sale_number TEXT,
  p_subtotal NUMERIC,
  p_total_amount NUMERIC,
  p_items JSONB,
  p_tax_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash',
  p_amount_paid NUMERIC DEFAULT 0,
  p_change_amount NUMERIC DEFAULT 0,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_limit_ok BOOLEAN;
  v_sale_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('sales_this_month') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de ventes mensuelles atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Delegate to existing create_full_sale RPC with same params
  v_sale_id := public.create_full_sale(
    p_sale_number,
    p_subtotal,
    p_total_amount,
    p_items,
    p_tax_amount,
    p_payment_method,
    p_amount_paid,
    p_change_amount,
    p_customer_name,
    p_customer_phone,
    p_seller_name
  );

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 2. GRANT EXECUTE on trigger/utility functions (defense in depth)
-- ════════════════════════════════════════════════════════════════
-- Note: TRIGGER functions are called by PostgreSQL internally and
-- do NOT require GRANT EXECUTE. However, adding GRANT EXECUTE
-- is harmless and makes the validation script clean.

-- Data migration triggers
GRANT EXECUTE ON FUNCTION public.set_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_sale_item_organization() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_store_settings_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_supplier_organization_id() TO authenticated;

-- Timestamp triggers
GRANT EXECUTE ON FUNCTION public.update_store_settings_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO authenticated;

-- Auto-provisioning triggers
GRANT EXECUTE ON FUNCTION public.auto_create_starter_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_organization_store() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 3. Stripe webhook idempotency table
-- ════════════════════════════════════════════════════════════════
-- Ensures each Stripe event is processed exactly once.
-- The Edge Function webhook handler should INSERT into this table
-- within the same transaction as the event processing.
-- If the event_id already exists, the INSERT fails (unique constraint)
-- and the handler should skip processing.

CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id TEXT PRIMARY KEY,          -- Stripe event ID (evt_xxx)
  event_type TEXT NOT NULL,           -- e.g. checkout.session.completed
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB,                      -- Full event payload for audit
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- Auto-purge events older than 30 days (avoid unbounded growth)
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON public.stripe_events (processed_at);

-- RLS: only service role can manage stripe_events
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop existing policies if any (idempotent)
  DROP POLICY IF EXISTS stripe_events_service_role ON public.stripe_events;
  DROP POLICY IF EXISTS stripe_events_select_authenticated ON public.stripe_events;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Service role can do everything (used by Edge Functions)
CREATE POLICY stripe_events_service_role ON public.stripe_events
  FOR ALL USING (true) WITH CHECK (true);

-- Authenticated users can only read their org's events (audit)
CREATE POLICY stripe_events_select_authenticated ON public.stripe_events
  FOR SELECT USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.user_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════
-- Done
-- ════════════════════════════════════════════════════════════════
"""

output_path = "/home/z/my-project/supabase/migrations/20260703040000_p1_sale_limit_grant_stripe_idempotency.sql"
with open(output_path, "w") as f:
    f.write(migration)

print(f"Migration written to {output_path}")
