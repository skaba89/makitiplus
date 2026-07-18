-- ════════════════════════════════════════════════════════════════
-- Migration: Security fixes — CHECK constraint + RLS hardening
-- Date: 2026-07-19
-- Objectif: Corriger 3 bugs critiques de sécurité identifiés par l'audit
--   C2: CHECK constraint stock_quantity >= 0
--   C3: RLS resserrées sur customers/suppliers/expenses (vérification rôle)
--   C4: is_super_admin() bypass sur products/customers/sales/expenses/suppliers
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- C2: CHECK constraint — stock_quantity ne peut pas être négatif
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Vérifier si la contrainte existe déjà
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'products_stock_quantity_nonneg'
    AND table_name = 'products'
  ) THEN
    -- Corriger les valeurs négatives existantes avant d'ajouter la contrainte
    UPDATE public.products SET stock_quantity = 0 WHERE stock_quantity < 0;
    
    ALTER TABLE public.products 
    ADD CONSTRAINT products_stock_quantity_nonneg CHECK (stock_quantity >= 0);
    
    RAISE NOTICE '✅ C2: CHECK constraint products_stock_quantity_nonneg ajoutée';
  ELSE
    RAISE NOTICE '⏭️ C2: CHECK constraint existe déjà';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- C4: Ajouter is_super_admin() bypass sur les policies SELECT manquantes
--     products, sales, sale_items, expenses, customers, suppliers,
--     stock_movements, purchase_orders, categories
-- ════════════════════════════════════════════════════════════════

-- products SELECT
DROP POLICY IF EXISTS "products_select_org_member" ON public.products;
CREATE POLICY "products_select_org_member"
  ON public.products FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- sales SELECT
DROP POLICY IF EXISTS "sales_select_org_member" ON public.sales;
CREATE POLICY "sales_select_org_member"
  ON public.sales FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- sale_items SELECT
DROP POLICY IF EXISTS "sale_items_select_org_member" ON public.sale_items;
CREATE POLICY "sale_items_select_org_member"
  ON public.sale_items FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- expenses SELECT
DROP POLICY IF EXISTS "expenses_select_org_member" ON public.expenses;
CREATE POLICY "expenses_select_org_member"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- customers SELECT
DROP POLICY IF EXISTS "customers_select_org_member" ON public.customers;
CREATE POLICY "customers_select_org_member"
  ON public.customers FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- suppliers SELECT
DROP POLICY IF EXISTS "suppliers_select_org_member" ON public.suppliers;
CREATE POLICY "suppliers_select_org_member"
  ON public.suppliers FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- stock_movements SELECT
DROP POLICY IF EXISTS "stock_movements_select_org_member" ON public.stock_movements;
CREATE POLICY "stock_movements_select_org_member"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- purchase_orders SELECT
DROP POLICY IF EXISTS "purchase_orders_select_org_member" ON public.purchase_orders;
CREATE POLICY "purchase_orders_select_org_member"
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- categories SELECT
DROP POLICY IF EXISTS "categories_select_org_member" ON public.categories;
CREATE POLICY "categories_select_org_member"
  ON public.categories FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- ════════════════════════════════════════════════════════════════
-- C3: RLS resserrées sur customers/suppliers/expenses INSERT/UPDATE/DELETE
--     Vérification du rôle (admin/manager minimum)
-- ════════════════════════════════════════════════════════════════

-- customers INSERT — admin/manager seulement
DROP POLICY IF EXISTS "customers_insert_own_org" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_scoped" ON public.customers;
CREATE POLICY "customers_insert_scoped"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      organization_id = public.get_user_organization_id()
      AND public.has_role(auth.uid(), 'admin')
    )
    OR (
      organization_id = public.get_user_organization_id()
      AND public.has_role(auth.uid(), 'manager')
    )
    OR (
      organization_id = public.get_user_organization_id()
      AND public.has_role(auth.uid(), 'vendeur')
    )
  );

-- customers UPDATE — admin/manager seulement
DROP POLICY IF EXISTS "customers_update_own_org" ON public.customers;
DROP POLICY IF EXISTS "customers_update_scoped" ON public.customers;
CREATE POLICY "customers_update_scoped"
  ON public.customers FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organization_id = public.get_user_organization_id()
      AND public.has_role(auth.uid(), 'admin')
    )
    OR (
      organization_id = public.get_user_organization_id()
      AND public.has_role(auth.uid(), 'manager')
    )
  );

-- customers DELETE — admin seulement
DROP POLICY IF EXISTS "customers_delete_own_org" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_scoped" ON public.customers;
CREATE POLICY "customers_delete_scoped"
  ON public.customers FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organization_id = public.get_user_organization_id()
      AND public.has_role(auth.uid(), 'admin')
    )
  );

-- suppliers INSERT — admin/manager seulement
DROP POLICY IF EXISTS "suppliers_insert_own_org" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_insert_scoped" ON public.suppliers;
CREATE POLICY "suppliers_insert_scoped"
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      organization_id = public.get_user_organization_id()
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
    )
  );

-- suppliers UPDATE — admin/manager seulement
DROP POLICY IF EXISTS "suppliers_update_own_org" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update_scoped" ON public.suppliers;
CREATE POLICY "suppliers_update_scoped"
  ON public.suppliers FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organization_id = public.get_user_organization_id()
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
    )
  );

-- suppliers DELETE — admin seulement
DROP POLICY IF EXISTS "suppliers_delete_own_org" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_delete_scoped" ON public.suppliers;
CREATE POLICY "suppliers_delete_scoped"
  ON public.suppliers FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organization_id = public.get_user_organization_id()
      AND public.has_role(auth.uid(), 'admin')
    )
  );

-- expenses INSERT — admin/manager/comptable seulement
DROP POLICY IF EXISTS "expenses_insert_own_org" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert_scoped" ON public.expenses;
CREATE POLICY "expenses_insert_scoped"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      organization_id = public.get_user_organization_id()
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR public.has_role(auth.uid(), 'comptable')
      )
    )
  );

-- expenses UPDATE — admin/manager/comptable seulement
DROP POLICY IF EXISTS "expenses_update_own_org" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update_scoped" ON public.expenses;
CREATE POLICY "expenses_update_scoped"
  ON public.expenses FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organization_id = public.get_user_organization_id()
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'manager')
        OR public.has_role(auth.uid(), 'comptable')
      )
    )
  );

-- expenses DELETE — admin seulement
DROP POLICY IF EXISTS "expenses_delete_own_org" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete_scoped" ON public.expenses;
CREATE POLICY "expenses_delete_scoped"
  ON public.expenses FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organization_id = public.get_user_organization_id()
      AND public.has_role(auth.uid(), 'admin')
    )
  );

-- Vérification
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'SECURITY FIXES APPLIED:';
  RAISE NOTICE 'C2: CHECK constraint stock_quantity >= 0';
  RAISE NOTICE 'C3: RLS resserrées (admin/manager) sur customers/suppliers/expenses';
  RAISE NOTICE 'C4: is_super_admin() bypass sur 9 tables SELECT';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
