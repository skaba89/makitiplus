-- ============================================================
-- Stripe Integration: Add stripe_customer_id to organizations
-- Date: 2026-07-03
--
-- Adds the Stripe customer ID column to organizations table
-- so we can reuse the same Stripe customer across checkout sessions.
-- Also adds a billing_period column for yearly/monthly tracking.
-- ============================================================

-- Add stripe_customer_id to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT DEFAULT NULL;

-- Add billing_period to subscriptions (monthly vs yearly)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT 'monthly'
  CHECK (billing_period IN ('monthly', 'yearly'));

-- Index for fast lookup by Stripe customer ID
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON public.organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Add stripe_subscription_id to subscriptions for linking
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT DEFAULT NULL;

-- Index for Stripe subscription lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
