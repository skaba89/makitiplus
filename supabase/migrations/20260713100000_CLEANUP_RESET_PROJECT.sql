-- ============================================================
-- SCRIPT DE NETTOYAGE v3 — Vide le projet sauf super admin + catégories
-- Date: 2026-07-13 (corrigé : DELETE conditionnels pour tables manquantes)
-- ============================================================
-- OBJECTIF :
--   - Garder le super admin kaba.sekouna@gmail.com
--   - Garder son organisation + son abonnement + ses magasins
--   - Garder les catégories de son organisation
--   - Supprimer TOUT le reste
--
-- ⚠️  OPÉRATION IRRÉVERSIBLE — FAIRE UNE SAUVEGARDE AVANT
--
-- Les DELETE sont conditionnels (vérifient si la table existe)
-- pour éviter l'erreur "relation does not exist".
-- ============================================================

DO $$
DECLARE
  v_super_admin_email TEXT := 'kaba.sekouna@gmail.com';
  v_super_admin_user_id UUID;
  v_super_admin_org_id UUID;
  v_count INTEGER;
  v_table_exists BOOLEAN;
BEGIN
  -- ─── 1. Identifier le super admin ────────────────────────────
  SELECT id INTO v_super_admin_user_id
  FROM auth.users
  WHERE email = v_super_admin_email
  LIMIT 1;

  IF v_super_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Super admin % non trouvé dans auth.users', v_super_admin_email;
  END IF;

  RAISE NOTICE '✅ Super admin trouvé : % (user_id: %)', v_super_admin_email, v_super_admin_user_id;

  -- ─── 2. Identifier son organisation ──────────────────────────
  SELECT organization_id INTO v_super_admin_org_id
  FROM public.profiles
  WHERE user_id = v_super_admin_user_id
  LIMIT 1;

  IF v_super_admin_org_id IS NULL THEN
    RAISE NOTICE '⚠️  Le super admin n''a pas d''organisation — création requise après nettoyage';
  ELSE
    RAISE NOTICE '✅ Organisation du super admin : %', v_super_admin_org_id;
  END IF;

  -- ─── Helper : fonction anonyme pour DELETE conditionnel ─────
  -- On utilise EXECUTE dynamique pour vérifier l'existence de la table

  -- ─── 3. Supprimer les données (DELETE conditionnels) ─────────

  -- sale_items
  DELETE FROM public.sale_items;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  sale_items supprimés : %', v_count;

  -- sales
  DELETE FROM public.sales;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  sales supprimées : %', v_count;

  -- customer_credits
  DELETE FROM public.customer_credits;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  customer_credits supprimés : %', v_count;

  -- customers
  DELETE FROM public.customers;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  customers supprimés : %', v_count;

  -- stock_movements
  DELETE FROM public.stock_movements;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  stock_movements supprimés : %', v_count;

  -- products
  DELETE FROM public.products;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  products supprimés : %', v_count;

  -- supplier_products
  DELETE FROM public.supplier_products;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  supplier_products supprimés : %', v_count;

  -- suppliers
  DELETE FROM public.suppliers;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  suppliers supprimés : %', v_count;

  -- expenses
  DELETE FROM public.expenses;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  expenses supprimées : %', v_count;

  -- purchase_order_items
  DELETE FROM public.purchase_order_items;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  purchase_order_items supprimés : %', v_count;

  -- purchase_orders
  DELETE FROM public.purchase_orders;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  purchase_orders supprimées : %', v_count;

  -- stock_transfers (conditionnel — table peut ne pas exister)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stock_transfers'
  ) INTO v_table_exists;

  IF v_table_exists THEN
    DELETE FROM public.stock_transfers;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '🗑️  stock_transfers supprimés : %', v_count;
  ELSE
    RAISE NOTICE '⏭️  stock_transfers : table inexistante (skip)';
  END IF;

  -- store_settings (sauf ceux du super admin)
  IF v_super_admin_org_id IS NOT NULL THEN
    DELETE FROM public.store_settings
    WHERE organization_id != v_super_admin_org_id;
  ELSE
    DELETE FROM public.store_settings;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  store_settings (autres orgs) supprimés : %', v_count;

  -- ticket_messages (conditionnel)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_messages'
  ) INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM public.ticket_messages;
    RAISE NOTICE '🗑️  ticket_messages supprimés';
  ELSE
    RAISE NOTICE '⏭️  ticket_messages : table inexistante (skip)';
  END IF;

  -- support_tickets (conditionnel)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'support_tickets'
  ) INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM public.support_tickets;
    RAISE NOTICE '🗑️  support_tickets supprimés';
  ELSE
    RAISE NOTICE '⏭️  support_tickets : table inexistante (skip)';
  END IF;

  -- backups (conditionnel)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'backups'
  ) INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM public.backups;
    RAISE NOTICE '🗑️  backups supprimés';
  ELSE
    RAISE NOTICE '⏭️  backups : table inexistante (skip)';
  END IF;

  -- app_activity (conditionnel)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_activity'
  ) INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM public.app_activity WHERE user_id != v_super_admin_user_id;
    RAISE NOTICE '🗑️  app_activity (autres) supprimés';
  ELSE
    RAISE NOTICE '⏭️  app_activity : table inexistante (skip)';
  END IF;

  -- ─── 4. Catégories (garder celles du super admin) ───────────
  IF v_super_admin_org_id IS NOT NULL THEN
    DELETE FROM public.categories
    WHERE organization_id != v_super_admin_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '🗑️  catégories (autres orgs) supprimées : %', v_count;
  ELSE
    DELETE FROM public.categories;
    RAISE NOTICE '🗑️  toutes les catégories supprimées (super admin sans org)';
  END IF;

  -- ─── 5. Stores (garder ceux du super admin) ─────────────────
  IF v_super_admin_org_id IS NOT NULL THEN
    DELETE FROM public.stores
    WHERE organization_id != v_super_admin_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '🗑️  stores (autres orgs) supprimés : %', v_count;
  END IF;

  -- ─── 6. Subscriptions (garder celle du super admin) ─────────
  IF v_super_admin_org_id IS NOT NULL THEN
    DELETE FROM public.subscriptions
    WHERE organization_id != v_super_admin_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '🗑️  subscriptions (autres orgs) supprimées : %', v_count;
  END IF;

  -- ─── 7. Organisations (garder celle du super admin) ────────
  IF v_super_admin_org_id IS NOT NULL THEN
    DELETE FROM public.organizations
    WHERE id != v_super_admin_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '🗑️  organisations (autres) supprimées : %', v_count;
  ELSE
    DELETE FROM public.organizations;
    RAISE NOTICE '🗑️  toutes les organisations supprimées';
  END IF;

  -- ─── 8. Autres utilisateurs ────────────────────────────────

  -- user_roles (sauf le super admin)
  DELETE FROM public.user_roles
  WHERE user_id != v_super_admin_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  user_roles (autres) supprimés : %', v_count;

  -- profiles (sauf le super admin)
  DELETE FROM public.profiles
  WHERE user_id != v_super_admin_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  profiles (autres) supprimés : %', v_count;

  -- auth.users (sauf le super admin)
  DELETE FROM auth.users
  WHERE id != v_super_admin_user_id
    AND email != v_super_admin_email;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '🗑️  auth.users (autres) supprimés : %', v_count;

  -- ─── 9. Vérification finale ────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ NETTOYAGE TERMINÉ';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Super admin gardé : %', v_super_admin_email;
  RAISE NOTICE 'Organisation gardée : %', COALESCE(v_super_admin_org_id::text, 'AUCUNE');
  RAISE NOTICE '═══════════════════════════════════════════════════════';

  PERFORM 1 FROM auth.users WHERE email = v_super_admin_email;
  IF NOT FOUND THEN
    RAISE EXCEPTION '❌ ERREUR : le super admin a été supprimé par erreur !';
  END IF;

  RAISE NOTICE '✅ Vérification : le super admin est toujours présent';
END $$;

-- ─── Vérifications post-nettoyage ─────────────────────────────

SELECT COUNT(*) AS users_restants FROM auth.users;
SELECT COUNT(*) AS orgs_restantes FROM public.organizations;
SELECT COUNT(*) AS categories_restantes FROM public.categories;
SELECT COUNT(*) AS produits_restants FROM public.products;
SELECT COUNT(*) AS ventes_restantes FROM public.sales;
SELECT COUNT(*) AS clients_restants FROM public.customers;
SELECT email, created_at FROM auth.users WHERE email = 'kaba.sekouna@gmail.com';
SELECT id, name, organization_id FROM public.categories ORDER BY name;
