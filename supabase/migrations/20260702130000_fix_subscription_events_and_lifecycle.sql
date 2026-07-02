-- ════════════════════════════════════════════════════════════════════════════
-- Fix: Expand subscription_events CHECK constraint + Add lifecycle automation
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Add missing event types to CHECK constraint (checkout_initiated, etc.)
-- 2. Create auto-lifecycle function + pg_cron schedule
-- 3. Add subscription event insertions in existing triggers
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Drop and recreate CHECK constraint with expanded event types ───────

ALTER TABLE public.subscription_events DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;

ALTER TABLE public.subscription_events ADD CONSTRAINT subscription_events_event_type_check
  CHECK (event_type IN (
    'created',
    'upgraded',
    'downgraded',
    'renewed',
    'cancelled',
    'expired',
    'grace_period_started',
    'read_only_started',
    'trial_started',
    'trial_ended',
    'payment_received',
    'payment_failed',
    'checkout_initiated',
    'checkout_completed',
    'subscription_reactivated',
    'grace_period_ended',
    'auto_downgraded'
  ));

-- ─── 2. Add event logging to auto_create_starter_subscription trigger ─────

CREATE OR REPLACE FUNCTION public.auto_create_starter_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
  VALUES (
    NEW.id,
    'starter',
    'active',
    NOW(),
    NOW() + INTERVAL '30 days'
  )
  ON CONFLICT (organization_id) DO NOTHING;

  -- Log the creation event
  INSERT INTO public.subscription_events (organization_id, event_type, to_plan, metadata)
  VALUES (
    NEW.id,
    'created',
    'starter',
    jsonb_build_object('trigger', 'auto_create_starter_subscription')
  );

  RETURN NEW;
END;
$$;


-- ─── 3. Subscription lifecycle automation function ─────────────────────────
-- Runs periodically (pg_cron) to transition subscriptions through their lifecycle:
--   grace_period → read_only  (when grace_period_ends_at < NOW())
--   read_only → expired       (when read_only for > 14 days)
--   expired → downgraded to starter (when expired for > 30 days)

CREATE OR REPLACE FUNCTION public.process_subscription_lifecycle()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_grace_to_read_only INT := 0;
  v_read_only_to_expired INT := 0;
  v_expired_to_starter INT := 0;
  v_org_id UUID;
  v_sub_id UUID;
BEGIN
  -- ─── Transition 1: grace_period → read_only ────────────────────────
  FOR v_org_id, v_sub_id IN
    SELECT s.organization_id, s.id
    FROM public.subscriptions s
    WHERE s.status = 'grace_period'
      AND s.grace_period_ends_at IS NOT NULL
      AND s.grace_period_ends_at < NOW()
  LOOP
    UPDATE public.subscriptions SET
      status = 'read_only',
      updated_at = NOW()
    WHERE id = v_sub_id;

    INSERT INTO public.subscription_events (organization_id, event_type, to_plan, metadata)
    VALUES (v_org_id, 'read_only_started', 'starter', jsonb_build_object(
      'trigger', 'lifecycle_cron',
      'previous_status', 'grace_period',
      'grace_period_ends_at_was', (SELECT grace_period_ends_at FROM public.subscriptions WHERE id = v_sub_id)
    ));

    v_grace_to_read_only := v_grace_to_read_only + 1;
  END LOOP;

  -- ─── Transition 2: read_only → expired (after 14 days) ─────────────
  FOR v_org_id, v_sub_id IN
    SELECT s.organization_id, s.id
    FROM public.subscriptions s
    WHERE s.status = 'read_only'
      AND s.updated_at < NOW() - INTERVAL '14 days'
  LOOP
    UPDATE public.subscriptions SET
      status = 'expired',
      updated_at = NOW()
    WHERE id = v_sub_id;

    INSERT INTO public.subscription_events (organization_id, event_type, to_plan, metadata)
    VALUES (v_org_id, 'expired', 'starter', jsonb_build_object(
      'trigger', 'lifecycle_cron',
      'previous_status', 'read_only',
      'days_read_only', 14
    ));

    v_read_only_to_expired := v_read_only_to_expired + 1;
  END LOOP;

  -- ─── Transition 3: expired → auto-downgrade to starter (after 30 days)
  FOR v_org_id, v_sub_id IN
    SELECT s.organization_id, s.id
    FROM public.subscriptions s
    WHERE s.status = 'expired'
      AND s.plan_id != 'starter'
      AND s.updated_at < NOW() - INTERVAL '30 days'
  LOOP
    UPDATE public.subscriptions SET
      plan_id = 'starter',
      status = 'active',
      current_period_start = NOW(),
      current_period_end = NOW() + INTERVAL '30 days',
      trial_ends_at = NULL,
      grace_period_ends_at = NULL,
      updated_at = NOW()
    WHERE id = v_sub_id;

    -- Clear Stripe subscription ID
    UPDATE public.stripe_customers SET
      stripe_subscription_id = NULL,
      updated_at = NOW()
    WHERE organization_id = v_org_id;

    INSERT INTO public.subscription_events (organization_id, event_type, from_plan, to_plan, metadata)
    VALUES (v_org_id, 'auto_downgraded',
      (SELECT plan_id FROM public.subscriptions WHERE id = v_sub_id),
      'starter',
      jsonb_build_object(
        'trigger', 'lifecycle_cron',
        'previous_status', 'expired',
        'days_expired', 30
      )
    );

    v_expired_to_starter := v_expired_to_starter + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'grace_to_read_only', v_grace_to_read_only,
    'read_only_to_expired', v_read_only_to_expired,
    'expired_to_starter', v_expired_to_starter,
    'processed_at', NOW()
  );
END;
$$;

-- No GRANT — called by service role only (pg_cron or Edge Function)


-- ─── 4. pg_cron schedule (requires pg_cron extension) ─────────────────────
-- Run the lifecycle function every hour
-- Note: pg_cron must be enabled in Supabase Dashboard → Database → Extensions

-- Uncomment the following lines after enabling pg_cron:
-- SELECT cron.schedule(
--   'subscription-lifecycle-hourly',
--   '0 * * * *',  -- Every hour at minute 0
--   $$SELECT public.process_subscription_lifecycle();$$
-- );

-- Alternative: Run every 6 hours if hourly is too frequent
-- SELECT cron.schedule(
--   'subscription-lifecycle-6h',
--   '0 */6 * * *',  -- Every 6 hours
--   $$SELECT public.process_subscription_lifecycle();$$
-- );
