-- Tighten RLS policies: restrict UPDATE on categories/customers/products/credits
-- to admin/manager, fix sync_conflicts INSERT with org scoping.

-- ═══════════════════════════════════════════════════════════
-- 1. sync_conflicts: Add organization_id column and fix INSERT policy
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.sync_conflicts
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_org
  ON public.sync_conflicts(organization_id);

-- Backfill existing rows from user's profile
UPDATE public.sync_conflicts sc
SET organization_id = (
  SELECT organization_id FROM public.profiles
  WHERE user_id = sc.user_id LIMIT 1
)
WHERE sc.organization_id IS NULL;

-- Replace wide-open INSERT policy with org-scoped one
DROP POLICY IF EXISTS "sync_conflicts_insert_authenticated" ON public.sync_conflicts;
CREATE POLICY "sync_conflicts_insert_own_org"
  ON public.sync_conflicts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.get_user_organization_id()
  );

-- ═══════════════════════════════════════════════════════════
-- 2. categories UPDATE: restrict to admin/manager only
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "org_members_update_categories" ON public.categories;
CREATE POLICY "org_admins_update_categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- ═══════════════════════════════════════════════════════════
-- 3. customers UPDATE: restrict to admin/manager only
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "org_members_update_customers" ON public.customers;
CREATE POLICY "org_admins_update_customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- ═══════════════════════════════════════════════════════════
-- 4. products UPDATE: restrict to admin/manager only
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "org_members_update_products" ON public.products;
CREATE POLICY "org_admins_update_products" ON public.products
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- ═══════════════════════════════════════════════════════════
-- 5. customer_credits UPDATE + INSERT: restrict to admin/manager/comptable
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "org_members_update_credits" ON public.customer_credits;
CREATE POLICY "org_admins_update_credits" ON public.customer_credits
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable'))
  );

DROP POLICY IF EXISTS "org_members_insert_credits" ON public.customer_credits;
CREATE POLICY "org_admins_insert_credits" ON public.customer_credits
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable'))
  );

-- ═══════════════════════════════════════════════════════════
-- 6. Cleanup: remove duplicate user_roles SELECT policy
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
