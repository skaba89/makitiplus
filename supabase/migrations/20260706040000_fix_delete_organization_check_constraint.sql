-- ============================================================
-- Fix: delete_organization 400 error + CHECK constraint
-- Date: 2026-07-06
--
-- Root cause:
--   subscription_events.event_type CHECK constraint does NOT include
--   'store_deleted' or 'organization_deleted', so the INSERT in
--   delete_organization() and delete_store() fails with a CHECK
--   violation → PostgREST returns 400.
--
-- Also:
--   - Replaces delete_organization() with the resilient version from
--     20260706030000 (dynamic SQL for optional tables like stores,
--     subscription_events, user_audit_log)
--   - Improves delete_store() similarly with conditional logging
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. Expand subscription_events CHECK constraint
--    Add: 'store_deleted', 'organization_deleted'
-- ════════════════════════════════════════════════════════════════
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
    'auto_downgraded',
    'store_deleted',
    'organization_deleted'
  ));

-- ════════════════════════════════════════════════════════════════
-- 2. Replace delete_organization() with resilient version
--    Uses dynamic SQL for optional tables (stores, subscription_events,
--    user_audit_log) to avoid errors when tables don't exist yet
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.delete_organization(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name TEXT;
  v_owner_user_id UUID;
  v_store_count INTEGER := 0;
  v_user_count INTEGER := 0;
  v_subscription_plan TEXT;
BEGIN
  -- Check if the organization exists
  SELECT name, owner_user_id INTO v_org_name, v_owner_user_id
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable : %', p_organization_id;
  END IF;

  -- Only super_admin can delete organizations
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : seul un super administrateur peut supprimer une organisation.';
  END IF;

  -- Gather stats for audit before deletion (dynamic SQL for optional tables)

  -- stores count (may not exist yet)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stores'
  ) THEN
    EXECUTE 'SELECT COUNT(*) FROM public.stores WHERE organization_id = $1'
      INTO v_store_count USING p_organization_id;
  END IF;

  -- profiles count
  SELECT COUNT(*) INTO v_user_count
  FROM public.profiles
  WHERE organization_id = p_organization_id;

  -- subscription_plan
  SELECT subscription_plan INTO v_subscription_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  -- Log the deletion BEFORE actually deleting (conditional on subscription_events existing)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscription_events'
  ) THEN
    INSERT INTO public.subscription_events (
      organization_id, event_type, from_plan, to_plan, performed_by, metadata
    ) VALUES (
      p_organization_id,
      'organization_deleted',
      v_subscription_plan, NULL,
      auth.uid(),
      jsonb_build_object(
        'organization_id', p_organization_id,
        'organization_name', v_org_name,
        'owner_user_id', v_owner_user_id,
        'store_count', v_store_count,
        'user_count', v_user_count,
        'deleted_by', 'super_admin'
      )
    );
  END IF;

  -- Also log to user_audit_log if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_audit_log'
  ) THEN
    EXECUTE format(
      'INSERT INTO public.user_audit_log (actor_id, action, details) VALUES ($1, $2, $3)'
    ) USING auth.uid(), 'delete_organization', jsonb_build_object(
      'organization_id', p_organization_id,
      'organization_name', v_org_name,
      'store_count', v_store_count,
      'user_count', v_user_count
    );
  END IF;

  -- Delete the organization (CASCADE will handle stores, subscriptions, etc.)
  DELETE FROM public.organizations WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'organization_id', p_organization_id,
    'organization_name', v_org_name,
    'deleted_stores', v_store_count,
    'deleted_users', v_user_count
  );
END;
$$;

-- Re-grant execute
GRANT EXECUTE ON FUNCTION public.delete_organization(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. Improve delete_store() with conditional subscription_events logging
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.delete_store(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_store_name TEXT;
  v_is_super_admin BOOLEAN;
  v_user_org_id UUID;
BEGIN
  -- Check if the store exists and get its org
  SELECT organization_id, name INTO v_org_id, v_store_name
  FROM public.stores
  WHERE id = p_store_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Magasin introuvable : %', p_store_id;
  END IF;

  -- Get caller's org
  SELECT organization_id INTO v_user_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Check if super_admin
  v_is_super_admin := public.is_super_admin();

  -- Authorization: super_admin can delete any store, admin can delete own org's stores
  IF NOT v_is_super_admin THEN
    IF v_user_org_id IS NULL OR v_user_org_id != v_org_id THEN
      RAISE EXCEPTION 'Accès refusé : vous ne pouvez supprimer que les magasins de votre organisation.';
    END IF;

    -- Check if caller is at least admin of the org
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin')
    ) THEN
      RAISE EXCEPTION 'Accès refusé : seuls les administrateurs peuvent supprimer des magasins.';
    END IF;
  END IF;

  -- Prevent deletion of the last/headquarters store
  IF EXISTS (
    SELECT 1 FROM public.stores
    WHERE organization_id = v_org_id
    AND is_headquarters = true
    AND id = p_store_id
  ) THEN
    -- Count total stores for this org
    IF (SELECT COUNT(*) FROM public.stores WHERE organization_id = v_org_id) <= 1 THEN
      RAISE EXCEPTION 'Impossible de supprimer le magasin principal. C''est le seul magasin de l''organisation.';
    END IF;
  END IF;

  -- Delete the store (FK SET NULL on related tables will handle orphaning)
  DELETE FROM public.stores WHERE id = p_store_id;

  -- Log the deletion in subscription_events for audit (conditional)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscription_events'
  ) THEN
    INSERT INTO public.subscription_events (
      organization_id, event_type, from_plan, to_plan, performed_by, metadata
    ) VALUES (
      v_org_id,
      'store_deleted',
      NULL, NULL,
      auth.uid(),
      jsonb_build_object(
        'store_id', p_store_id,
        'store_name', v_store_name,
        'deleted_by', CASE WHEN v_is_super_admin THEN 'super_admin' ELSE 'admin' END
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'store_id', p_store_id,
    'store_name', v_store_name
  );
END;
$$;

-- Re-grant execute
GRANT EXECUTE ON FUNCTION public.delete_store(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. Reload PostgREST schema cache
-- ════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
