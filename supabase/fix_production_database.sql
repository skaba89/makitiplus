-- ═══════════════════════════════════════════════════════════════════════
-- FIX: Add super_admin access to ALL business table RLS policies
--
-- PROBLEM: super_admin cannot INSERT/UPDATE/DELETE on categories, products,
-- customers, expenses, sales, customer_credits, or stock_movements because
-- the RLS policies only check for 'admin' and 'manager' roles.
-- The is_super_admin() function EXISTS but is never referenced in these
-- business table policies (only in profiles/user_roles/organizations).
--
-- SOLUTION: Add "OR public.is_super_admin()" to every business table policy
-- that currently restricts to admin/manager/comptable.
--
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. CATEGORIES — Add super_admin to INSERT, UPDATE, DELETE
-- ─────────────────────────────────────────────────────────────────────

-- INSERT
DROP POLICY IF EXISTS "org_members_insert_categories" ON public.categories;
CREATE POLICY "org_members_insert_categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "org_admins_update_categories" ON public.categories;
CREATE POLICY "org_admins_update_categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  );

-- DELETE
DROP POLICY IF EXISTS "org_admins_delete_categories" ON public.categories;
CREATE POLICY "org_admins_delete_categories" ON public.categories
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 2. PRODUCTS — Add super_admin to INSERT, UPDATE, DELETE
-- ─────────────────────────────────────────────────────────────────────

-- INSERT
DROP POLICY IF EXISTS "org_members_insert_products" ON public.products;
CREATE POLICY "org_members_insert_products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "org_admins_update_products" ON public.products;
CREATE POLICY "org_admins_update_products" ON public.products
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  );

-- DELETE
DROP POLICY IF EXISTS "org_admins_delete_products" ON public.products;
CREATE POLICY "org_admins_delete_products" ON public.products
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 3. CUSTOMERS — Add super_admin to INSERT, UPDATE, DELETE
-- ─────────────────────────────────────────────────────────────────────

-- INSERT
DROP POLICY IF EXISTS "org_members_insert_customers" ON public.customers;
CREATE POLICY "org_members_insert_customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

-- UPDATE
DROP POLICY IF EXISTS "org_admins_update_customers" ON public.customers;
CREATE POLICY "org_admins_update_customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  );

-- DELETE
DROP POLICY IF EXISTS "org_admins_delete_customers" ON public.customers;
CREATE POLICY "org_admins_delete_customers" ON public.customers
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 4. SALES — Add super_admin to INSERT, UPDATE
-- ─────────────────────────────────────────────────────────────────────

-- INSERT
DROP POLICY IF EXISTS "org_members_insert_sales" ON public.sales;
CREATE POLICY "org_members_insert_sales" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

-- UPDATE
DROP POLICY IF EXISTS "org_admins_update_sales" ON public.sales;
CREATE POLICY "org_admins_update_sales" ON public.sales
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 5. SALE_ITEMS — Add super_admin to INSERT
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org_members_insert_sale_items" ON public.sale_items;
CREATE POLICY "org_members_insert_sale_items" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

-- ─────────────────────────────────────────────────────────────────────
-- 6. CUSTOMER_CREDITS — Add super_admin to INSERT, UPDATE, DELETE
-- ─────────────────────────────────────────────────────────────────────

-- INSERT
DROP POLICY IF EXISTS "org_admins_insert_credits" ON public.customer_credits;
CREATE POLICY "org_admins_insert_credits" ON public.customer_credits
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'comptable')
      OR public.is_super_admin()
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "org_admins_update_credits" ON public.customer_credits;
CREATE POLICY "org_admins_update_credits" ON public.customer_credits
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'comptable')
      OR public.is_super_admin()
    )
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'comptable')
      OR public.is_super_admin()
    )
  );

-- DELETE
DROP POLICY IF EXISTS "org_admins_delete_credits" ON public.customer_credits;
CREATE POLICY "org_admins_delete_credits" ON public.customer_credits
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.is_super_admin()
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 7. EXPENSES — Add super_admin to SELECT, INSERT, UPDATE, DELETE
-- ─────────────────────────────────────────────────────────────────────

-- SELECT
DROP POLICY IF EXISTS "org_members_view_expenses" ON public.expenses;
CREATE POLICY "org_members_view_expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'comptable')
      OR public.is_super_admin()
    )
  );

-- INSERT
DROP POLICY IF EXISTS "org_accountants_insert_expenses" ON public.expenses;
CREATE POLICY "org_accountants_insert_expenses" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'comptable')
      OR public.is_super_admin()
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "org_accountants_update_expenses" ON public.expenses;
CREATE POLICY "org_accountants_update_expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'comptable')
      OR public.is_super_admin()
    )
  );

-- DELETE
DROP POLICY IF EXISTS "org_admins_delete_expenses" ON public.expenses;
CREATE POLICY "org_admins_delete_expenses" ON public.expenses
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.is_super_admin()
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 8. STOCK_MOVEMENTS — Add super_admin to INSERT
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org_members_insert_stock" ON public.stock_movements;
CREATE POLICY "org_members_insert_stock" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

-- ─────────────────────────────────────────────────────────────────────
-- 9. SYNC_CONFLICTS — Ensure super_admin can INSERT
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "sync_conflicts_insert_own_org" ON public.sync_conflicts;
CREATE POLICY "sync_conflicts_insert_own_org" ON public.sync_conflicts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      organization_id = public.get_user_organization_id()
      OR public.is_super_admin()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- DONE! super_admin now has full access to all business tables.
--
-- After running this, verify with:
--   SELECT schemaname, tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
-- ═══════════════════════════════════════════════════════════════════════
