-- ============================================================
-- Fix: Store deletion + Organizations DELETE RLS policy
-- Date: 2026-07-06
--
-- Problems fixed:
--   1. organizations table has FORCE ROW LEVEL SECURITY but NO DELETE policy
--      → nobody can delete organizations
--   2. No delete_store RPC exists — code was using raw .from("organizations").delete()
--      which deletes the entire org (cascading to ALL stores) instead of one store
--   3. stock_transfers FK uses ON DELETE RESTRICT, blocking store deletion
--      → changed to ON DELETE SET NULL (orphan transfers instead of blocking)
--   4. Super admin Stores page passes organization ID to delete_store(),
--      but delete_store() expects a store ID → needs delete_organization() RPC
--
-- This migration:
--   - Adds DELETE RLS policy on organizations (super_admin only)
--   - Creates delete_store() RPC for safe, plan-aware store deletion
--   - Creates delete_organization() RPC for super admin org deletion
--   - Changes stock_transfers FK from RESTRICT to SET NULL (conditional)
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. Add DELETE RLS policy on organizations (super_admin only)
-- ════════════════════════════════════════════════════════════════
CREATE POLICY "super_admin_can_delete_org"
  ON public.organizations
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ════════════════════════════════════════════════════════════════
-- 2. Fix stock_transfers FK: RESTRICT → SET NULL
--    This allows store deletion without blocking on transfer history
--    Wrapped in DO block to handle case where stock_transfers
--    table hasn't been deployed yet.
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Only apply FK changes if stock_transfers table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stock_transfers'
  ) THEN
    -- Drop existing RESTRICT constraints and recreate as SET NULL
    ALTER TABLE public.stock_transfers
      DROP CONSTRAINT IF EXISTS stock_transfers_from_store_id_fkey,
      DROP CONSTRAINT IF EXISTS stock_transfers_to_store_id_fkey;

    ALTER TABLE public.stock_transfers
      ADD CONSTRAINT stock_transfers_from_store_id_fkey
        FOREIGN KEY (from_store_id) REFERENCES public.stores(id) ON DELETE SET NULL,
      ADD CONSTRAINT stock_transfers_to_store_id_fkey
        FOREIGN KEY (to_store_id) REFERENCES public.stores(id) ON DELETE SET NULL;

    RAISE NOTICE 'stock_transfers FK constraints updated from RESTRICT to SET NULL';
  ELSE
    RAISE NOTICE 'stock_transfers table does not exist yet — skipping FK fix (will be applied when stock_transfers migration runs with corrected FKs)';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- 3. Create delete_store() RPC
--
--    Safely deletes a single store with:
--    - super_admin or admin ownership check
--    - Prevents deletion of the last/headquarters store
--    - Audit logging
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

  -- Log the deletion in subscription_events for audit
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

  RETURN jsonb_build_object(
    'success', TRUE,
    'store_id', p_store_id,
    'store_name', v_store_name
  );
END;
$$;

-- Grant execute to authenticated users (authorization is handled inside the function)
GRANT EXECUTE ON FUNCTION public.delete_store(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. Create delete_organization() RPC
--
--    Safely deletes an entire organization with:
--    - Super admin only (platform-level operation)
--    - Audit logging before deletion
--    - Cascade: deleting the org automatically deletes its stores,
--      subscriptions, usage counters, and all org-scoped data
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
  v_store_count INTEGER;
  v_user_count INTEGER;
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

  -- Gather stats for audit before deletion
  SELECT COUNT(*) INTO v_store_count
  FROM public.stores
  WHERE organization_id = p_organization_id;

  SELECT COUNT(*) INTO v_user_count
  FROM public.profiles
  WHERE organization_id = p_organization_id;

  SELECT subscription_plan INTO v_subscription_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  -- Log the deletion BEFORE actually deleting (so the org still exists for the FK)
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

  -- Also log to user_audit_log if it exists (using dynamic SQL to avoid parse-time errors)
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

-- Grant execute to authenticated users (authorization is handled inside the function)
GRANT EXECUTE ON FUNCTION public.delete_organization(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 5. Reload PostgREST schema cache
-- ════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
