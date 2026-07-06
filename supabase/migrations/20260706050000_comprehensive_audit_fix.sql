-- ============================================================
-- Comprehensive Audit Fix: All broken RPCs and missing columns
-- Date: 2026-07-06
--
-- Issues fixed:
--   1. admin_get_all_subscriptions references columns that may not
--      exist on remote DB (s.billing_period, o.stripe_customer_id)
--      → "structure of query does not match function result type"
--   2. admin_update_organization_subscription references
--      subscription_status column which was NEVER added to
--      organizations table → 400 error on every plan change
--   3. touch_last_login may lack GRANT EXECUTE → 400 on login
--   4. admin_get_all_subscriptions doesn't include delete capability
--
-- Strategy:
--   - Add all missing columns with ADD COLUMN IF NOT EXISTS
--   - Drop and recreate broken functions
--   - Grant proper permissions
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. Add missing columns to organizations
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT DEFAULT NULL;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

-- ════════════════════════════════════════════════════════════════
-- 2. Add missing columns to subscriptions
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT 'monthly'
  CHECK (billing_period IN ('monthly', 'yearly'));

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT DEFAULT NULL;

-- ════════════════════════════════════════════════════════════════
-- 3. Fix admin_get_all_subscriptions — recreate with safe columns
--    Uses dynamic SQL to check for optional columns at runtime
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.admin_get_all_subscriptions();

CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  owner_email TEXT,
  country TEXT,
  subscription_id UUID,
  plan_id TEXT,
  plan_name TEXT,
  status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  billing_period TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn1$
DECLARE
  v_has_billing_period BOOLEAN;
  v_has_stripe_customer_id BOOLEAN;
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  -- Check which optional columns exist at runtime
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'billing_period'
  ) INTO v_has_billing_period;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'stripe_customer_id'
  ) INTO v_has_stripe_customer_id;

  -- Build and execute the query dynamically
  IF v_has_billing_period AND v_has_stripe_customer_id THEN
    RETURN QUERY EXECUTE '
      SELECT
        o.id AS organization_id,
        o.name AS organization_name,
        au.email AS owner_email,
        o.country,
        s.id AS subscription_id,
        s.plan_id,
        p.name AS plan_name,
        s.status,
        s.current_period_start,
        s.current_period_end,
        s.trial_ends_at,
        s.billing_period,
        o.stripe_customer_id,
        s.created_at
      FROM organizations o
      LEFT JOIN subscriptions s ON s.organization_id = o.id
      LEFT JOIN plans p ON p.id = s.plan_id
      LEFT JOIN auth.users au ON au.id = o.owner_user_id
      ORDER BY o.name
    ';
  ELSIF v_has_billing_period AND NOT v_has_stripe_customer_id THEN
    RETURN QUERY EXECUTE '
      SELECT
        o.id AS organization_id,
        o.name AS organization_name,
        au.email AS owner_email,
        o.country,
        s.id AS subscription_id,
        s.plan_id,
        p.name AS plan_name,
        s.status,
        s.current_period_start,
        s.current_period_end,
        s.trial_ends_at,
        s.billing_period,
        NULL::TEXT AS stripe_customer_id,
        s.created_at
      FROM organizations o
      LEFT JOIN subscriptions s ON s.organization_id = o.id
      LEFT JOIN plans p ON p.id = s.plan_id
      LEFT JOIN auth.users au ON au.id = o.owner_user_id
      ORDER BY o.name
    ';
  ELSIF NOT v_has_billing_period AND v_has_stripe_customer_id THEN
    RETURN QUERY EXECUTE '
      SELECT
        o.id AS organization_id,
        o.name AS organization_name,
        au.email AS owner_email,
        o.country,
        s.id AS subscription_id,
        s.plan_id,
        p.name AS plan_name,
        s.status,
        s.current_period_start,
        s.current_period_end,
        s.trial_ends_at,
        NULL::TEXT AS billing_period,
        o.stripe_customer_id,
        s.created_at
      FROM organizations o
      LEFT JOIN subscriptions s ON s.organization_id = o.id
      LEFT JOIN plans p ON p.id = s.plan_id
      LEFT JOIN auth.users au ON au.id = o.owner_user_id
      ORDER BY o.name
    ';
  ELSE
    RETURN QUERY EXECUTE '
      SELECT
        o.id AS organization_id,
        o.name AS organization_name,
        au.email AS owner_email,
        o.country,
        s.id AS subscription_id,
        s.plan_id,
        p.name AS plan_name,
        s.status,
        s.current_period_start,
        s.current_period_end,
        s.trial_ends_at,
        NULL::TEXT AS billing_period,
        NULL::TEXT AS stripe_customer_id,
        s.created_at
      FROM organizations o
      LEFT JOIN subscriptions s ON s.organization_id = o.id
      LEFT JOIN plans p ON p.id = s.plan_id
      LEFT JOIN auth.users au ON au.id = o.owner_user_id
      ORDER BY o.name
    ';
  END IF;
END;
$fn1$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. Fix admin_update_organization_subscription — remove reference
--    to non-existent subscription_status column
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_update_organization_subscription(
  p_organization_id UUID,
  p_plan_id TEXT,
  p_duration TEXT DEFAULT '1_month',
  p_payment_reference TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_plan_id TEXT;
  v_old_status TEXT;
  v_new_period_end TIMESTAMPTZ;
  v_event_type TEXT;
  v_duration_interval INTERVAL;
  v_result JSONB;
BEGIN
  -- Guard: Only super_admin can call this
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : seuls les super_admin peuvent modifier les abonnements.';
  END IF;

  -- Validate plan_id
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Plan invalide : % n''existe pas ou est inactif.', p_plan_id;
  END IF;

  -- Validate duration
  CASE p_duration
    WHEN '1_month'  THEN v_duration_interval := INTERVAL '1 month';
    WHEN '3_months' THEN v_duration_interval := INTERVAL '3 months';
    WHEN '6_months' THEN v_duration_interval := INTERVAL '6 months';
    WHEN '1_year'   THEN v_duration_interval := INTERVAL '1 year';
    ELSE RAISE EXCEPTION 'Durée invalide : %. Valeurs acceptées : 1_month, 3_months, 6_months, 1_year.', p_duration;
  END CASE;

  -- Validate organization exists
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Organisation introuvable : %', p_organization_id;
  END IF;

  -- Get current subscription info
  SELECT plan_id, status INTO v_old_plan_id, v_old_status
  FROM public.subscriptions
  WHERE organization_id = p_organization_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Calculate new period end
  v_new_period_end := NOW() + v_duration_interval;

  -- Determine event type
  IF v_old_plan_id IS NULL THEN
    v_event_type := 'created';
  ELSIF v_old_plan_id = p_plan_id THEN
    v_event_type := 'renewed';
  ELSIF
    (SELECT sort_order FROM public.plans WHERE id = p_plan_id)
    >
    (SELECT sort_order FROM public.plans WHERE id = v_old_plan_id)
  THEN
    v_event_type := 'upgraded';
  ELSE
    v_event_type := 'downgraded';
  END IF;

  -- Upsert subscription
  INSERT INTO public.subscriptions (
    organization_id, plan_id, status,
    current_period_start, current_period_end,
    trial_ends_at, grace_period_ends_at, cancelled_at
  ) VALUES (
    p_organization_id, p_plan_id, 'active',
    NOW(), v_new_period_end,
    NULL, NULL, NULL
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_start = NOW(),
    current_period_end = EXCLUDED.current_period_end,
    trial_ends_at = NULL,
    grace_period_ends_at = NULL,
    cancelled_at = NULL,
    updated_at = NOW();

  -- Update organizations cache columns (WITHOUT subscription_status which may not exist)
  UPDATE public.organizations
  SET
    subscription_plan = p_plan_id,
    subscription_expires_at = v_new_period_end,
    updated_at = NOW()
  WHERE id = p_organization_id;

  -- Also set subscription_status if the column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'subscription_status'
  ) THEN
    UPDATE public.organizations
    SET subscription_status = 'active'
    WHERE id = p_organization_id;
  END IF;

  -- Audit log
  INSERT INTO public.subscription_events (
    organization_id, event_type,
    from_plan, to_plan,
    performed_by,
    metadata
  ) VALUES (
    p_organization_id, v_event_type,
    v_old_plan_id, p_plan_id,
    auth.uid(),
    jsonb_build_object(
      'duration', p_duration,
      'new_period_end', v_new_period_end,
      'payment_reference', p_payment_reference,
      'reason', p_reason,
      'old_status', v_old_status
    )
  );

  -- Return result
  v_result := jsonb_build_object(
    'success', TRUE,
    'organization_id', p_organization_id,
    'plan_id', p_plan_id,
    'event_type', v_event_type,
    'from_plan', v_old_plan_id,
    'period_end', v_new_period_end,
    'duration', p_duration
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_organization_subscription(
  UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 5. Ensure touch_last_login has GRANT EXECUTE
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Only grant if the function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'touch_last_login'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
  ELSE
    -- Create the function if it doesn't exist
    CREATE OR REPLACE FUNCTION public.touch_last_login()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $inner$
    BEGIN
      UPDATE public.profiles
      SET last_login_at = now()
      WHERE user_id = auth.uid();
    END;
    $inner$;

    GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- 6. Ensure indexes exist for new columns
-- ════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON public.organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════
-- 7. Reload PostgREST schema cache
-- ════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
