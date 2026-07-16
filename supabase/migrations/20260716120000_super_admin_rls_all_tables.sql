-- ════════════════════════════════════════════════════════════════
-- Migration: Super admin RLS — lecture globale sur tables métier
-- Date: 2026-07-16
-- Objectif: Le super_admin doit pouvoir lire les données de TOUTES les
--           organisations (sales, expenses, products, customers, suppliers,
--           stock_movements, purchase_orders, sale_items) pour le Dashboard
--           et les autres pages avec sélecteur d'org.
-- ════════════════════════════════════════════════════════════════

-- Fonction helper pour ajouter OR public.is_super_admin() à une policy existante
-- On recrée les policies SELECT en ajoutant is_super_admin()

-- ════════════════════════════════════════════════════════════════
-- SALES
-- ════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════
-- SALE_ITEMS (hérite de sales via sale_id)
-- ════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════
-- EXPENSES
-- ════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════
-- PRODUCTS
-- ════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════
-- CUSTOMERS
-- ════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════
-- SUPPLIERS
-- ════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════
-- STOCK_MOVEMENTS
-- ════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════
-- PURCHASE_ORDERS
-- ════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════
-- CATEGORIES
-- ════════════════════════════════════════════════════════════════
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
-- VÉRIFICATION
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Policies RLS mises à jour pour super_admin :';
  RAISE NOTICE '- sales (lecture globale)';
  RAISE NOTICE '- sale_items (lecture globale)';
  RAISE NOTICE '- expenses (lecture globale)';
  RAISE NOTICE '- products (lecture globale)';
  RAISE NOTICE '- customers (lecture globale)';
  RAISE NOTICE '- suppliers (lecture globale)';
  RAISE NOTICE '- stock_movements (lecture globale)';
  RAISE NOTICE '- purchase_orders (lecture globale)';
  RAISE NOTICE '- categories (lecture globale)';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
