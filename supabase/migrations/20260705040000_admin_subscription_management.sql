-- ============================================================
-- Admin Subscription Management for Super Admin
-- Date: 2026-07-05
--
-- Enables super_admin to:
--   - View all organizations with their subscription details
--   - Change any organization's plan, status, and duration
--   - Log all changes to subscription_events
--
-- Also creates the missing update_organization_subscription RPC
-- used by Billing.tsx (for own-org changes by any admin).
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. RLS: Allow super_admin to UPDATE subscriptions for any org
-- ════════════════════════════════════════════════════════════════
CREATE POLICY "Super admin can update any subscription"
  ON public.subscriptions
  FOR UPDATE USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Allow super_admin to INSERT subscriptions (for new orgs)
CREATE POLICY "Super admin can insert subscriptions"
  ON public.subscriptions
  FOR INSERT WITH CHECK (public.is_super_admin());

-- ════════════════════════════════════════════════════════════════
-- 2. admin_get_all_subscriptions — List all orgs with sub details
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
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  RETURN QUERY
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
  ORDER BY o.name;
END;
$fn1$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. admin_update_organization_subscription — Change any org's sub
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.admin_update_organization_subscription(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_update_organization_subscription(
  p_organization_id UUID,
  p_plan_id TEXT,
  p_status TEXT DEFAULT 'active',
  p_duration TEXT DEFAULT '1 month'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn2$
DECLARE
  v_old_plan TEXT;
  v_old_status TEXT;
  v_event_type TEXT;
  v_period_end TIMESTAMPTZ;
  v_billing_period TEXT;
  v_sub_id UUID;
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  -- Validate plan exists
  IF NOT EXISTS (SELECT 1 FROM plans WHERE id = p_plan_id AND is_active) THEN
    RAISE EXCEPTION 'Invalid plan_id: %', p_plan_id;
  END IF;

  -- Validate status
  IF p_status NOT IN ('active', 'trialing', 'past_due', 'grace_period', 'read_only', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- Calculate period end
  IF p_duration = '1 year' THEN
    v_period_end := NOW() + INTERVAL '1 year';
    v_billing_period := 'yearly';
  ELSE
    v_period_end := NOW() + INTERVAL '1 month';
    v_billing_period := 'monthly';
  END IF;

  -- Get current subscription info (for audit)
  SELECT plan_id, status, id INTO v_old_plan, v_old_status, v_sub_id
  FROM subscriptions WHERE organization_id = p_organization_id;

  IF v_sub_id IS NOT NULL THEN
    -- Update existing subscription
    UPDATE subscriptions SET
      plan_id = p_plan_id,
      status = p_status,
      current_period_start = NOW(),
      current_period_end = v_period_end,
      billing_period = v_billing_period,
      updated_at = NOW()
    WHERE organization_id = p_organization_id;

    -- Determine event type
    IF v_old_plan IS DISTINCT FROM p_plan_id THEN
      IF p_plan_id > v_old_plan THEN  -- enterprise > croissance > starter
        v_event_type := 'upgraded';
      ELSE
        v_event_type := 'downgraded';
      END IF;
    ELSIF v_old_status IS DISTINCT FROM p_status THEN
      v_event_type := 'status_changed';
    ELSE
      v_event_type := 'renewed';
    END IF;

    -- Log event
    INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
    VALUES (
      p_organization_id,
      v_event_type,
      v_old_plan,
      p_plan_id,
      auth.uid(),
      jsonb_build_object(
        'old_status', v_old_status,
        'new_status', p_status,
        'duration', p_duration,
        'changed_by', 'super_admin'
      )
    );
  ELSE
    -- Create new subscription
    INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start, current_period_end, billing_period)
    VALUES (p_organization_id, p_plan_id, p_status, NOW(), v_period_end, v_billing_period)
    RETURNING id INTO v_sub_id;

    -- Log creation event
    INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
    VALUES (
      p_organization_id,
      'created',
      NULL,
      p_plan_id,
      auth.uid(),
      jsonb_build_object(
        'status', p_status,
        'duration', p_duration,
        'changed_by', 'super_admin'
      )
    );
  END IF;

  -- Also update the legacy cache column on organizations
  UPDATE organizations SET
    subscription_plan = p_plan_id,
    subscription_expires_at = v_period_end,
    updated_at = NOW()
  WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'subscription_id', v_sub_id,
    'plan_id', p_plan_id,
    'status', p_status,
    'period_end', v_period_end
  );
END;
$fn2$;

GRANT EXECUTE ON FUNCTION public.admin_update_organization_subscription(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. update_organization_subscription — Own-org sub change (used by Billing.tsx)
--    This was called by Billing.tsx but didn't exist. Now we create it.
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.update_organization_subscription(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_organization_subscription(
  p_plan_id TEXT,
  p_status TEXT DEFAULT 'active',
  p_duration TEXT DEFAULT '1 month'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn3$
DECLARE
  v_org_id UUID;
  v_old_plan TEXT;
  v_event_type TEXT;
  v_period_end TIMESTAMPTZ;
  v_billing_period TEXT;
  v_sub_id UUID;
BEGIN
  -- Get caller's organization
  SELECT organization_id INTO v_org_id
  FROM profiles WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  -- Validate plan exists
  IF NOT EXISTS (SELECT 1 FROM plans WHERE id = p_plan_id AND is_active) THEN
    RAISE EXCEPTION 'Invalid plan_id: %', p_plan_id;
  END IF;

  -- Calculate period end
  IF p_duration = '1 year' THEN
    v_period_end := NOW() + INTERVAL '1 year';
    v_billing_period := 'yearly';
  ELSE
    v_period_end := NOW() + INTERVAL '1 month';
    v_billing_period := 'monthly';
  END IF;

  -- Get current subscription info
  SELECT plan_id, id INTO v_old_plan, v_sub_id
  FROM subscriptions WHERE organization_id = v_org_id;

  IF v_sub_id IS NOT NULL THEN
    -- Update existing
    UPDATE subscriptions SET
      plan_id = p_plan_id,
      status = p_status,
      current_period_start = NOW(),
      current_period_end = v_period_end,
      billing_period = v_billing_period,
      updated_at = NOW()
    WHERE organization_id = v_org_id;

    IF v_old_plan IS DISTINCT FROM p_plan_id THEN
      IF p_plan_id > v_old_plan THEN
        v_event_type := 'upgraded';
      ELSE
        v_event_type := 'downgraded';
      END IF;
    ELSE
      v_event_type := 'renewed';
    END IF;

    INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
    VALUES (v_org_id, v_event_type, v_old_plan, p_plan_id, auth.uid(),
      jsonb_build_object('new_status', p_status, 'duration', p_duration));
  ELSE
    -- Create new
    INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start, current_period_end, billing_period)
    VALUES (v_org_id, p_plan_id, p_status, NOW(), v_period_end, v_billing_period)
    RETURNING id INTO v_sub_id;

    INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
    VALUES (v_org_id, 'created', NULL, p_plan_id, auth.uid(),
      jsonb_build_object('status', p_status, 'duration', p_duration));
  END IF;

  -- Update legacy cache
  UPDATE organizations SET
    subscription_plan = p_plan_id,
    subscription_expires_at = v_period_end,
    updated_at = NOW()
  WHERE id = v_org_id;

  RETURN jsonb_build_object('success', TRUE, 'plan_id', p_plan_id, 'period_end', v_period_end);
END;
$fn3$;

GRANT EXECUTE ON FUNCTION public.update_organization_subscription(TEXT, TEXT, TEXT) TO authenticated;
