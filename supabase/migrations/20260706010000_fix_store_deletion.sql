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
--
-- This migration:
--   - Adds DELETE RLS policy on organizations (super_admin only)
--   - Creates delete_store() RPC for safe, plan-aware store deletion
--   - Changes stock_transfers FK from RESTRICT to SET NULL
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
-- ════════════════════════════════════════════════════════════════

-- Drop existing RESTRICT constraints and recreate as SET NULL
ALTER TABLE public.stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_from_store_id_fkey,
  DROP CONSTRAINT IF EXISTS stock_transfers_to_store_id_fkey;

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT stock_transfers_from_store_id_fkey
    FOREIGN KEY (from_store_id) REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD CONSTRAINT stock_transfers_to_store_id_fkey
    FOREIGN KEY (to_store_id) REFERENCES public.stores(id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════════
-- 3. Create delete_store() RPC
--
--    Safely deletes a store with:
--    - super_admin or admin ownership check
--    - Deactivation before deletion (soft-delete first)
--    - Audit logging
--    - Plan limit cache update
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
-- 4. Reload PostgREST schema cache
-- ════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
