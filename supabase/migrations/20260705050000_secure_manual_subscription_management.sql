-- ============================================================
-- Secure Manual Subscription Management — Hotfix
-- Date: 2026-07-05
--
-- Secures the manual subscription governance so that only
-- super_admin (platform operator) can change or extend plans.
-- Tenant admins (admin role) can no longer self-upgrade to
-- Croissance or Enterprise plans without platform validation.
--
-- Creates:
--   admin_update_organization_subscription() — SECURITY DEFINER RPC
--     - Only callable by super_admin
--     - Validates plan_id and duration
--     - Server-side period_end calculation
--     - Upsert on subscriptions
--     - Updates organizations cache columns
--     - Full audit logging via subscription_events
--
-- Security rules enforced:
--   1. is_super_admin() check at RPC entry
--   2. plan_id must be valid (exists in plans table)
--   3. duration must be one of: 1_month, 3_months, 6_months, 1_year
--   4. organization_id must exist
--   5. No direct subscriptions table mutation from frontend
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. Drop existing function if it was created in a prior migration
--    (42P13 return type change requires DROP + CREATE)
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.admin_update_organization_subscription(UUID, TEXT, TEXT);

-- ════════════════════════════════════════════════════════════════
-- 2. Create the secured RPC with full parameter set
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
  -- ─── Guard 1: Only super_admin can call this ────────────────
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : seuls les super_admin peuvent modifier les abonnements.';
  END IF;

  -- ─── Guard 2: Validate plan_id ─────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Plan invalide : % n''existe pas ou est inactif.', p_plan_id;
  END IF;

  -- ─── Guard 3: Validate duration ────────────────────────────
  CASE p_duration
    WHEN '1_month'  THEN v_duration_interval := INTERVAL '1 month';
    WHEN '3_months' THEN v_duration_interval := INTERVAL '3 months';
    WHEN '6_months' THEN v_duration_interval := INTERVAL '6 months';
    WHEN '1_year'   THEN v_duration_interval := INTERVAL '1 year';
    ELSE RAISE EXCEPTION 'Durée invalide : %. Valeurs acceptées : 1_month, 3_months, 6_months, 1_year.', p_duration;
  END CASE;

  -- ─── Guard 4: Validate organization exists ─────────────────
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Organisation introuvable : %', p_organization_id;
  END IF;

  -- ─── Get current subscription info ─────────────────────────
  SELECT plan_id, status INTO v_old_plan_id, v_old_status
  FROM public.subscriptions
  WHERE organization_id = p_organization_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- ─── Calculate new period end ──────────────────────────────
  v_new_period_end := NOW() + v_duration_interval;

  -- ─── Determine event type ──────────────────────────────────
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

  -- ─── Upsert subscription ───────────────────────────────────
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

  -- ─── Update organizations cache columns ────────────────────
  UPDATE public.organizations
  SET
    subscription_plan = p_plan_id,
    subscription_status = 'active',
    updated_at = NOW()
  WHERE id = p_organization_id;

  -- ─── Audit log ─────────────────────────────────────────────
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

  -- ─── Return result ─────────────────────────────────────────
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

-- ════════════════════════════════════════════════════════════════
-- 3. Grant execute to authenticated users (actual access control
--    is handled by is_super_admin() inside the function)
-- ════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.admin_update_organization_subscription(
  UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. Revoke direct INSERT/UPDATE on subscriptions from non-super_admin
--    RLS policies: only super_admin can INSERT/UPDATE subscriptions
-- ════════════════════════════════════════════════════════════════

-- Drop existing overly-permissive policies if they exist
DROP POLICY IF EXISTS "Users can read own org subscription" ON public.subscriptions;

-- Re-create SELECT policy (org members can still read)
CREATE POLICY "Users can read own org subscription" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- Add INSERT policy: only super_admin
CREATE POLICY "Only super_admin can insert subscriptions" ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

-- Add UPDATE policy: only super_admin
CREATE POLICY "Only super_admin can update subscriptions" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ════════════════════════════════════════════════════════════════
-- 5. Verify the RPC exists
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_update_organization_subscription'
  ), 'RPC admin_update_organization_subscription not found after creation';
END;
$$;
