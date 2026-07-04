-- ═══════════════════════════════════════════════════════════════════════════════
-- RESET DATABASE — Vide toutes les données métier, garde compte + organisation
-- Execute dans : Supabase Dashboard -> SQL Editor -> New Query
-- ═══════════════════════════════════════════════════════════════════════════════

-- Désactiver temporairement les triggers RLS qui pourraient bloquer
SET session_replication_role = 'replica';

-- 1. Vider les ventes et leurs lignes
DELETE FROM public.sale_items;
DELETE FROM public.sales;

-- 2. Vider les mouvements de stock
DELETE FROM public.stock_movements;

-- 3. Vider les commandes fournisseur
DELETE FROM public.purchase_order_items;
DELETE FROM public.purchase_orders;

-- 4. Vider les produits et catégories
DELETE FROM public.supplier_products;
DELETE FROM public.products;
DELETE FROM public.categories;

-- 5. Vider les clients et fournisseurs
DELETE FROM public.customers;
DELETE FROM public.suppliers;

-- 6. Vider les dépenses
DELETE FROM public.expenses;

-- 7. Vider les magasins (sauf le magasin par défaut de l'org)
DELETE FROM public.stores WHERE name != 'Principal';

-- 8. Vider les logs d'audit (optionnel — décommenter si voulu)
-- DELETE FROM public.user_audit_log;

-- 9. Vider les tokens de reset
DELETE FROM public.password_reset_tokens;

-- Réactiver les triggers
SET session_replication_role = 'origin';

-- 10. Réinitialiser les compteurs de séquences
ALTER SEQUENCE IF EXISTS public.sale_items_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.sales_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.products_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.categories_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.customers_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.suppliers_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.expenses_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.stock_movements_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.stores_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.purchase_orders_id_seq RESTART WITH 1;

-- 11. Rétablir le plan Enterprise pour test
UPDATE public.organizations
SET subscription_plan = 'enterprise',
    subscription_expires_at = NOW() + INTERVAL '1 year'
WHERE subscription_plan IS NULL OR subscription_plan != 'enterprise';

-- 12. Vérification
SELECT
  'sales' AS table_name, COUNT(*) AS remaining FROM public.sales
UNION ALL
SELECT 'products', COUNT(*) FROM public.products
UNION ALL
SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL
SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL
SELECT 'suppliers', COUNT(*) FROM public.suppliers
UNION ALL
SELECT 'expenses', COUNT(*) FROM public.expenses
UNION ALL
SELECT 'stock_movements', COUNT(*) FROM public.stock_movements
UNION ALL
SELECT 'organizations (ton compte)', COUNT(*) FROM public.organizations;

-- Résultat attendu : tout à 0 sauf organizations = 1
