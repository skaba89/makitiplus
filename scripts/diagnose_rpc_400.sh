#!/usr/bin/env bash
# ============================================================
# MakitiPlus — Diagnose & Fix RPC HTTP 400 Errors
# ============================================================
# This script checks which critical RPCs are missing or have
# wrong signatures in the Supabase database, and provides
# the SQL to fix them.
#
# Usage:
#   ./scripts/diagnose_rpc_400.sh
#
# Then apply the fixes in Supabase SQL Editor:
#   https://supabase.com/dashboard/project/<REF>/sql
# ============================================================

set -euo pipefail

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  MakitiPlus — Diagnose RPC HTTP 400 Errors                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "The HTTP 400 errors on these RPCs indicate they are either"
echo "not deployed or have a signature mismatch:"
echo ""
echo "  1. touch_last_login()         — Missing GRANT EXECUTE"
echo "  2. admin_get_all_subscriptions() — Not deployed or GRANT missing"
echo "  3. admin_update_organization_subscription() — Signature mismatch"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📋 ROOT CAUSE ANALYSIS"
echo ""
echo "The migration 20260705050000_secure_manual_subscription_management.sql"
echo "defines admin_update_organization_subscription with 5 parameters:"
echo "  (p_organization_id UUID, p_plan_id TEXT, p_duration TEXT,"
echo "   p_payment_reference TEXT, p_reason TEXT)"
echo ""
echo "But the earlier migration 20260705040000 defined it with 4 parameters:"
echo "  (p_organization_id UUID, p_plan_id TEXT, p_status TEXT, p_duration TEXT)"
echo ""
echo "The TypeScript code (Billing.tsx, OrganizationManagement.tsx) calls"
echo "the 5-parameter version. If only the 4-param version is deployed,"
echo "PostgREST returns HTTP 400 because it can't find a matching signature."
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "🔧 HOW TO FIX"
echo ""
echo "Option A: Apply pending migrations via Supabase CLI"
echo "──────────────────────────────────────────────────"
echo "  supabase db push --linked"
echo ""
echo "Option B: Run the fix SQL manually in Supabase SQL Editor"
echo "──────────────────────────────────────────────────────────"
echo "  Go to: https://supabase.com/dashboard/project/<YOUR_REF>/sql"
echo "  Copy and paste the SQL from:"
echo "    supabase/migrations/20260705050000_secure_manual_subscription_management.sql"
echo ""
echo "  Then also apply the GRANT EXECUTE fix:"
echo "    supabase/migrations/20260704030000_add_missing_grant_execute.sql"
echo ""
echo "Option C: Quick fix — run the minimal SQL below"
echo "──────────────────────────────────────────────────"
echo ""
cat << 'QUICKFIX'
-- ════════════════════════════════════════════════════════════════
-- QUICK FIX: Apply critical missing RPCs and GRANTs
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════

-- 1. Drop old 4-param version if it exists
DROP FUNCTION IF EXISTS public.admin_update_organization_subscription(UUID, TEXT, TEXT, TEXT);

-- 2. Create the correct 5-param version matching the TypeScript code
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
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : seuls les super_admin peuvent modifier les abonnements.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Plan invalide : % n''existe pas ou est inactif.', p_plan_id;
  END IF;

  CASE p_duration
    WHEN '1_month'  THEN v_duration_interval := INTERVAL '1 month';
    WHEN '3_months' THEN v_duration_interval := INTERVAL '3 months';
    WHEN '6_months' THEN v_duration_interval := INTERVAL '6 months';
    WHEN '1_year'   THEN v_duration_interval := INTERVAL '1 year';
    ELSE RAISE EXCEPTION 'Durée invalide : %. Valeurs acceptées : 1_month, 3_months, 6_months, 1_year.', p_duration;
  END CASE;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Organisation introuvable : %', p_organization_id;
  END IF;

  SELECT plan_id, status INTO v_old_plan_id, v_old_status
  FROM public.subscriptions
  WHERE organization_id = p_organization_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_new_period_end := NOW() + v_duration_interval;

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

  UPDATE public.organizations
  SET
    subscription_plan = p_plan_id,
    subscription_status = 'active',
    subscription_expires_at = v_new_period_end,
    updated_at = NOW()
  WHERE id = p_organization_id;

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

-- 3. GRANT EXECUTE on the 5-param version
GRANT EXECUTE ON FUNCTION public.admin_update_organization_subscription(
  UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- 4. GRANT EXECUTE on touch_last_login (if missing)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'touch_last_login() does not exist yet — create it first';
END $$;

-- 5. GRANT EXECUTE on admin_get_all_subscriptions (if missing)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'admin_get_all_subscriptions() does not exist yet — apply migration 20260705040000';
END $$;

-- 6. GRANT EXECUTE on is_super_admin (if missing)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'is_super_admin() does not exist yet — apply migration 20260704010000';
END $$;

-- 7. Reload PostgREST schema cache so changes take effect immediately
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- Verify: check the function signature
-- ════════════════════════════════════════════════════════════════
SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS args,
  pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'admin_update_organization_subscription',
    'admin_get_all_subscriptions',
    'touch_last_login',
    'is_super_admin'
  )
ORDER BY p.proname;

QUICKFIX

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "⚠️  After applying the fix, wait ~10 seconds for PostgREST to"
echo "    reload its schema cache (or run NOTIFY pgrst, 'reload schema')."
echo ""
echo "✅ Then refresh your browser and check that the errors are gone."
