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
  v_table_exists BOOLEAN;
BEGIN
  RAISE NOTICE '=== NETTOYAGE DES DONNÉES TRANSACTIONNELLES ===';
  RAISE NOTICE 'Conservé : users, profiles, user_roles, organizations, stores, subscriptions, categories';
  RAISE NOTICE '';

  -- sale_items
  DELETE FROM public.sale_items;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'sale_items supprimés : %', v_count;

  -- sales
  DELETE FROM public.sales;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'sales supprimées : %', v_count;

  -- customer_credits
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customer_credits') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM public.customer_credits;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'customer_credits supprimés : %', v_count;
  END IF;

  -- customers
  DELETE FROM public.customers;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'customers supprimés : %', v_count;

  -- stock_movements
  DELETE FROM public.stock_movements;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'stock_movements supprimés : %', v_count;

  -- products
  DELETE FROM public.products;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'products supprimés : %', v_count;

  -- supplier_products
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='supplier_products') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM public.supplier_products;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'supplier_products supprimés : %', v_count;
  END IF;

  -- suppliers
  DELETE FROM public.suppliers;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'suppliers supprimés : %', v_count;

  -- expenses
  DELETE FROM public.expenses;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'expenses supprimées : %', v_count;

  -- purchase_order_items
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_order_items') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM public.purchase_order_items;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'purchase_order_items supprimés : %', v_count;
  END IF;

  -- purchase_orders
  DELETE FROM public.purchase_orders;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'purchase_orders supprimées : %', v_count;

  RAISE NOTICE '';
  RAISE NOTICE '=== DONNÉES CONSERVÉES ===';

  SELECT COUNT(*) INTO v_count FROM auth.users;
  RAISE NOTICE 'Utilisateurs : %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.organizations;
  RAISE NOTICE 'Organisations : %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.stores;
  RAISE NOTICE 'Magasins : %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.categories;
  RAISE NOTICE 'Catégories : %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.subscriptions;
  RAISE NOTICE 'Abonnements : %', v_count;

  RAISE NOTICE '';
  RAISE NOTICE '✅ NETTOYAGE TERMINÉ — users + magasins + catégories conservés';
END $$;
