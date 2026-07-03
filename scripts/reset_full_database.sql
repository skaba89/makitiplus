-- ═══════════════════════════════════════════════════════════════════════════════
-- RESET COMPLET — Base vide, uniquement super_admin + 1 admin magasin
-- Execute dans : Supabase Dashboard -> SQL Editor -> New Query
-- ═══════════════════════════════════════════════════════════════════════════════

-- Désactiver les triggers RLS temporairement
SET session_replication_role = 'replica';

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 1 : Vider TOUTES les données métier
-- ══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.sale_items;
DELETE FROM public.sales;
DELETE FROM public.stock_movements;
DELETE FROM public.purchase_order_items;
DELETE FROM public.purchase_orders;
DELETE FROM public.supplier_products;
DELETE FROM public.products;
DELETE FROM public.categories;
DELETE FROM public.customers;
DELETE FROM public.suppliers;
DELETE FROM public.expenses;
DELETE FROM public.stores;
DELETE FROM public.password_reset_tokens;
DELETE FROM public.user_audit_log;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 : Supprimer TOUTES les organisations
-- ══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.organizations;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 3 : Supprimer TOUS les profils et rôles (sauf ton compte auth)
-- ══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.user_roles;
DELETE FROM public.profiles;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 4 : Créer l'organisation du magasin
-- ══════════════════════════════════════════════════════════════════════════════
-- ⚠️ REMPLACE l'email ci-dessous par TON vrai email de compte Supabase

INSERT INTO public.organizations (id, name, subscription_plan, subscription_expires_at)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Mon Magasin Test',
  'enterprise',
  NOW() + INTERVAL '1 year'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 5 : Créer le profil super_admin
-- ══════════════════════════════════════════════════════════════════════════════
-- ⚠️ REMPLACE l'user_id par le tien (voir ci-dessous comment le trouver)

INSERT INTO public.profiles (user_id, business_name, owner_name, phone, organization_id, is_active)
VALUES (
  'TON_USER_ID_ICI',  -- ← Remplace par ton auth.uid()
  'Mon Magasin Test',
  'Ton Nom',
  NULL,
  'a0000000-0000-0000-0000-000000000001',
  true
);

-- Rôle super_admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('TON_USER_ID_ICI', 'super_admin');

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 6 : Créer l'admin du magasin
-- ══════════════════════════════════════════════════════════════════════════════
-- ⚠️ REMPLACE l'user_id par celui de ton admin magasin
-- Si tu n'as pas encore créé le compte, tu pourras le faire depuis l'app
-- après t'être connecté en super_admin

-- INSERT INTO public.profiles (user_id, business_name, owner_name, phone, organization_id, is_active)
-- VALUES (
--   'USER_ID_ADMIN_MAGASIN',
--   'Mon Magasin Test',
--   'Nom de l''admin',
--   NULL,
--   'a0000000-0000-0000-0000-000000000001',
--   true
-- );
--
-- INSERT INTO public.user_roles (user_id, role)
-- VALUES ('USER_ID_ADMIN_MAGASIN', 'admin');

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 7 : Réactiver les triggers + reset séquences
-- ══════════════════════════════════════════════════════════════════════════════

SET session_replication_role = 'origin';

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
ALTER SEQUENCE IF EXISTS public.organizations_id_seq RESTART WITH 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION
-- ══════════════════════════════════════════════════════════════════════════════

SELECT 'organizations' AS tbl, COUNT(*) AS cnt FROM public.organizations
UNION ALL SELECT 'profiles', COUNT(*) FROM public.profiles
UNION ALL SELECT 'user_roles', COUNT(*) FROM public.user_roles
UNION ALL SELECT 'sales', COUNT(*) FROM public.sales
UNION ALL SELECT 'products', COUNT(*) FROM public.products
UNION ALL SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL SELECT 'suppliers', COUNT(*) FROM public.suppliers
UNION ALL SELECT 'expenses', COUNT(*) FROM public.expenses;

-- Résultat attendu :
-- organizations = 1, profiles = 1, user_roles = 1, tout le reste = 0
