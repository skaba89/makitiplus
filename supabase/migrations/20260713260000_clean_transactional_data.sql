-- ============================================================
-- Script : Nettoyer les données transactionnelles (garde users + magasins)
-- Date: 2026-07-13
-- ============================================================
-- Garde : users, profiles, user_roles, organizations, stores, subscriptions, categories, store_settings
-- Supprime : sales, sale_items, products, customers, suppliers, expenses, stock_movements, purchase_orders
-- ============================================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Supprimer dans le bon ordre (enfants d'abord, parents ensuite)
  DELETE FROM public.sale_items;
  DELETE FROM public.sales;
  DELETE FROM public.customer_credits;
  DELETE FROM public.customers;
  DELETE FROM public.stock_movements;
  DELETE FROM public.purchase_order_items;
  DELETE FROM public.purchase_orders;
  DELETE FROM public.supplier_products;
  DELETE FROM public.suppliers;
  DELETE FROM public.expenses;
  DELETE FROM public.products;

  RAISE NOTICE 'NETTOYAGE TERMINE';
  RAISE NOTICE 'Conserve : % users', (SELECT COUNT(*) FROM auth.users);
  RAISE NOTICE 'Conserve : % magasins', (SELECT COUNT(*) FROM public.stores);
  RAISE NOTICE 'Conserve : % categories', (SELECT COUNT(*) FROM public.categories);
END $$;
