-- ============================================================
-- Fix: Allow vendeurs to update product stock during sales
-- ============================================================
-- Problem: vendeurs get 409 when making sales because the
-- "org_admins_update_products" RLS policy only allows admin/manager.
-- Solution: Add a separate policy allowing vendeurs to update
-- stock_quantity on products in their organization.

-- Remove any previously created version of this policy
DROP POLICY IF EXISTS "org_vendeurs_update_stock" ON public.products;

-- Allow vendeurs to update products in their org (for stock decrements during sales)
CREATE POLICY "org_vendeurs_update_stock" ON public.products
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_role(auth.uid(), 'vendeur')
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_role(auth.uid(), 'vendeur')
  );
