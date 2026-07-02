-- ════════════════════════════════════════════════════════════════════════════
-- Step 7: Stripe Payment Integration Tables
-- ════════════════════════════════════════════════════════════════════════════
-- Creates:
--   1. stripe_customers — link orgs to Stripe customers
--   2. stripe_payments — payment audit trail
--   3. RLS policies
--   4. RPCs: get_stripe_customer, handle_subscription_change
--
-- IMPORTANT: Run AFTER step1-6 have been executed successfully.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Stripe Customers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id TEXT NOT NULL UNIQUE,          -- cus_xxx
  stripe_subscription_id TEXT,                       -- sub_xxx (current active subscription)
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_org ON public.stripe_customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe ON public.stripe_customers(stripe_customer_id);

-- ─── 2. Stripe Payments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  stripe_invoice_id TEXT,                            -- in_xxx
  stripe_payment_intent_id TEXT,                     -- pi_xxx
  amount BIGINT NOT NULL,                            -- Amount in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',            -- pending | paid | failed | refunded
  plan_id TEXT,                                      -- plan at time of payment
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  invoice_url TEXT,                                  -- Stripe hosted invoice URL
  invoice_pdf TEXT,                                  -- PDF download URL
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_org ON public.stripe_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_stripe_sub ON public.stripe_payments(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_status ON public.stripe_payments(status);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_created ON public.stripe_payments(created_at DESC);

-- ─── 3. RLS Policies ─────────────────────────────────────────────────────

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;

-- stripe_customers: org admins can read, system manages writes
CREATE POLICY "Org admins can read stripe_customers"
  ON public.stripe_customers FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );

-- stripe_payments: org admins can read
CREATE POLICY "Org admins can read stripe_payments"
  ON public.stripe_payments FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );


-- ─── 4. RPC: get_stripe_customer ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_stripe_customer()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'id', sc.id,
    'stripe_customer_id', sc.stripe_customer_id,
    'stripe_subscription_id', sc.stripe_subscription_id,
    'email', sc.email,
    'name', sc.name
  ) INTO result
  FROM stripe_customers sc
  WHERE sc.organization_id = v_org_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stripe_customer() TO authenticated;


-- ─── 5. RPC: get_payment_history ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_payment_history(p_limit INTEGER DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN '[]'::JSONB; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(sp.*) ORDER BY sp.created_at DESC), '[]'::JSONB) INTO result
  FROM (
    SELECT * FROM stripe_payments
    WHERE organization_id = v_org_id
    ORDER BY created_at DESC
    LIMIT p_limit
  ) sp;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_history(INTEGER) TO authenticated;


-- ─── 6. RPC: upsert_stripe_customer ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_stripe_customer(
  p_stripe_customer_id TEXT,
  p_email TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  INSERT INTO public.stripe_customers (organization_id, stripe_customer_id, email, name)
  VALUES (v_org_id, p_stripe_customer_id, p_email, p_name)
  ON CONFLICT (organization_id) DO UPDATE SET
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_stripe_customer(TEXT, TEXT, TEXT) TO authenticated;


-- ─── 7. RPC: handle_subscription_change ──────────────────────────────────
-- Called by webhook to update subscription plan and log events
CREATE OR REPLACE FUNCTION public.handle_subscription_change(
  p_org_id UUID,
  p_plan_id TEXT,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'active',
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_event_type TEXT DEFAULT 'upgraded'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_plan TEXT;
BEGIN
  -- Get current plan
  SELECT plan_id INTO v_old_plan
  FROM subscriptions
  WHERE organization_id = p_org_id
  LIMIT 1;

  -- Update subscription
  UPDATE subscriptions SET
    plan_id = p_plan_id,
    status = CASE
      WHEN p_status = 'active' THEN 'active'
      WHEN p_status = 'past_due' THEN 'past_due'
      WHEN p_status = 'canceled' THEN 'cancelled'
      ELSE p_status
    END,
    current_period_start = COALESCE(p_period_start, current_period_start),
    current_period_end = COALESCE(p_period_end, current_period_end),
    updated_at = now()
  WHERE organization_id = p_org_id;

  -- Update stripe_customers with subscription id
  IF p_stripe_subscription_id IS NOT NULL THEN
    UPDATE stripe_customers SET
      stripe_subscription_id = p_stripe_subscription_id,
      updated_at = now()
    WHERE organization_id = p_org_id;
  END IF;

  -- Log event
  INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, metadata)
  VALUES (
    p_org_id,
    p_event_type,
    v_old_plan,
    p_plan_id,
    jsonb_build_object(
      'stripe_subscription_id', p_stripe_subscription_id,
      'status', p_status,
      'period_start', p_period_start,
      'period_end', p_period_end
    )
  );

  RETURN true;
END;
$$;

-- No GRANT — this is called by service role (webhook) only


-- ─── 8. Update plans with Stripe price IDs ───────────────────────────────
-- These will be set when you create products/prices in Stripe Dashboard
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_price_id_monthly TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_price_id_yearly TEXT;

-- Placeholder values — replace with actual Stripe price IDs after setup
UPDATE public.plans SET stripe_price_id_monthly = NULL, stripe_price_id_yearly = NULL;
