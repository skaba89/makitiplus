-- ============================================================
-- Fix: Make delete_organization work without stores table
-- Date: 2026-07-06
--
-- Problem: delete_organization references public.stores which
-- doesn't exist yet on the remote DB, causing 400 errors.
-- Fix: Use dynamic SQL with existence checks for optional tables.
-- ============================================================

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

  -- Gather stats for audit before deletion (use dynamic SQL to handle missing tables)
  -- stores table
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

  -- Log the deletion BEFORE actually deleting (so the org still exists for the FK)
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

  -- Also log to user_audit_log if it exists (using dynamic SQL)
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

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
