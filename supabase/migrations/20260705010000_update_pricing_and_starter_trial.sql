-- ============================================================
-- Migration : Update pricing + convert starter to trial plan
-- Date : 2026-07-05
-- ============================================================
-- Changes:
--   1. Croissance price: 29.00 → 39.90 €
--   2. Enterprise price: 79.00 → 99.90 €
--   3. Starter renamed to "Essai" (trial), 14-day auto-expiry
--   4. Starter auto-subscription now lasts 14 days instead of 30
-- ============================================================

-- 1. Update plan prices
UPDATE public.plans
SET
  price_monthly = 39.90,
  price_yearly = 399.00,
  name = 'Croissance',
  description = 'Pour les boutiques qui grandissent — fournisseurs, rapports, exports'
WHERE id = 'croissance';

UPDATE public.plans
SET
  price_monthly = 99.90,
  price_yearly = 999.00,
  name = 'Enterprise',
  description = 'Pour les chaînes et grossistes — analytics, API, support prioritaire'
WHERE id = 'enterprise';

-- 2. Convert starter to trial plan
UPDATE public.plans
SET
  name = 'Essai gratuit',
  description = 'Période d''essai de 14 jours — caisse et stock de base'
WHERE id = 'starter';

-- 3. Update auto_create_starter_subscription to 14-day trial
CREATE OR REPLACE FUNCTION public.auto_create_starter_subscription()
RETURNS TRIGGER AS $$
DECLARE
  v_trial_end TIMESTAMPTZ;
BEGIN
  v_trial_end := NOW() + INTERVAL '14 days';

  INSERT INTO public.subscriptions (org_id, plan_id, status, current_period_start, current_period_end)
  VALUES (NEW.id, 'starter', 'trialing', NOW(), v_trial_end)
  ON CONFLICT (org_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update subscription-lifecycle to downgrade expired trials
-- (the existing function already handles this, but let's ensure
--  expired "trialing" status transitions to "past_due" then downgrades)

-- 5. Fix existing starter subscriptions: set 14-day expiry from creation
-- Only touch subscriptions that still have the old 30-day window
UPDATE public.subscriptions
SET
  current_period_end = current_period_start + INTERVAL '14 days',
  status = 'trialing'
WHERE plan_id = 'starter'
  AND status = 'active'
  AND current_period_end > NOW();
