-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION : Add Stripe columns to organizations table
-- Execute dans : Supabase Dashboard -> SQL Editor -> New Query
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add stripe_customer_id column
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Add stripe_subscription_id column (for reference)
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Create index for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
ON public.organizations (stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;

-- Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'organizations'
  AND column_name IN ('stripe_customer_id', 'stripe_subscription_id', 'subscription_plan', 'subscription_expires_at')
ORDER BY ordinal_position;
