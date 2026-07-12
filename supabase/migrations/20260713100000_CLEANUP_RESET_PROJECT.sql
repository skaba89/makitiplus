-- ============================================================
-- SCRIPT DE NETTOYAGE — Vide le projet sauf super admin + catégories
-- Date: 2026-07-13
-- ============================================================
-- OBJECTIF :
--   - Garder le super admin kaba.sekouna@gmail.com
--   - Garder son organisation + son abonnement + ses magasins
--   - Garder les catégories de son organisation
--   - Supprimer TOUT le reste :
--     * Ventes (sales, sale_items)
--     * Produits
--     * Clients (customers, customer_credits)
--     * Fournisseurs (suppliers, supplier_products)
--     * Dépenses (expenses)
--     * Stock movements
--     * Commandes (purchase_orders)
--     * Tous les autres utilisateurs (auth.users, profiles, user_roles)
--     * Toutes les autres organisations (et leurs données en cascade)
--     * Tous les autres super_admins
--
-- ⚠️  OPÉRATION IRRÉVERSIBLE — FAIRE UNE SAUVEGARDE AVANT
--
-- Le script utilise une transaction (BEGIN/COMMIT) donc si une erreur
-- survient, ROLLBACK annule tout. Mais une fois COMMIT exécuté, c'est
-- définitif.
-- ============================================================

-- Variables de configuration
DO $$
DECLARE
  v_super_admin_email TEXT := 'kaba.sekouna@gmail.com';
  v_super_admin_user_id UUID;
  v_super_admin_org_id UUID;
  v_deleted_counts JSONB := '{}';
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
    RAISE NOTICE '⚠️  Le super admin n''a pas d''organisation — création d''une nouvelle org requise après nettoyage';
  ELSE
    RAISE NOTICE '✅ Organisation du super admin : %', v_super_admin_org_id;
  END IF;

  -- ─── 3. Supprimer les données de TOUTES les organisations ────
  -- (y compris celle du super admin — on garde seulement l'org, les stores,
  --  les catégories, et le subscription)

  -- 3a. sale_items (liés aux sales qu'on va supprimer)
  DELETE FROM public.sale_items;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{sale_items}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  sale_items supprimés : %', (v_deleted_counts->>'sale_items')::int;

  -- 3b. sales
  DELETE FROM public.sales;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{sales}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  sales supprimées : %', (v_deleted_counts->>'sales')::int;

  -- 3c. customer_credits
  DELETE FROM public.customer_credits;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{customer_credits}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  customer_credits supprimés : %', (v_deleted_counts->>'customer_credits')::int;

  -- 3d. customers
  DELETE FROM public.customers;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{customers}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  customers supprimés : %', (v_deleted_counts->>'customers')::int;

  -- 3e. stock_movements
  DELETE FROM public.stock_movements;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{stock_movements}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  stock_movements supprimés : %', (v_deleted_counts->>'stock_movements')::int;

  -- 3f. products
  DELETE FROM public.products;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{products}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  products supprimés : %', (v_deleted_counts->>'products')::int;

  -- 3g. supplier_products
  DELETE FROM public.supplier_products;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{supplier_products}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  supplier_products supprimés : %', (v_deleted_counts->>'supplier_products')::int;

  -- 3h. suppliers
  DELETE FROM public.suppliers;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{suppliers}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  suppliers supprimés : %', (v_deleted_counts->>'suppliers')::int;

  -- 3i. expenses
  DELETE FROM public.expenses;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{expenses}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  expenses supprimées : %', (v_deleted_counts->>'expenses')::int;

  -- 3j. purchase_order_items
  DELETE FROM public.purchase_order_items;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{purchase_order_items}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  purchase_order_items supprimés : %', (v_deleted_counts->>'purchase_order_items')::int;

  -- 3k. purchase_orders
  DELETE FROM public.purchase_orders;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{purchase_orders}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  purchase_orders supprimées : %', (v_deleted_counts->>'purchase_orders')::int;

  -- 3l. stock_transfers
  DELETE FROM public.stock_transfers;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{stock_transfers}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  stock_transfers supprimés : %', (v_deleted_counts->>'stock_transfers')::int;

  -- 3m. store_settings (on garde les stores du super admin, mais on vide les settings
  -- — ils seront recréés automatiquement)
  -- En fait on garde les store_settings des stores du super admin
  -- Donc on supprime seulement les store_settings des autres orgs
  IF v_super_admin_org_id IS NOT NULL THEN
    DELETE FROM public.store_settings
    WHERE organization_id != v_super_admin_org_id;
  END IF;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{store_settings}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  store_settings (autres orgs) supprimés : %', (v_deleted_counts->>'store_settings')::int;

  -- 3n. support_tickets et messages
  DELETE FROM public.ticket_messages;
  DELETE FROM public.support_tickets;

  -- 3o. backups
  DELETE FROM public.backups;

  -- ─── 4. Supprimer les catégories des AUTRES organisations ────
  -- (on garde les catégories du super admin)
  IF v_super_admin_org_id IS NOT NULL THEN
    DELETE FROM public.categories
    WHERE organization_id != v_super_admin_org_id;
    GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{categories_other}', to_jsonb(ROW_COUNT));
    RAISE NOTICE '🗑️  catégories (autres orgs) supprimées : %', (v_deleted_counts->>'categories_other')::int;
  ELSE
    -- Si le super admin n'a pas d'org, supprimer toutes les catégories
    DELETE FROM public.categories;
    RAISE NOTICE '🗑️  toutes les catégories supprimées (super admin sans org)';
  END IF;

  -- ─── 5. Supprimer les stores des AUTRES organisations ────────
  IF v_super_admin_org_id IS NOT NULL THEN
    DELETE FROM public.stores
    WHERE organization_id != v_super_admin_org_id;
    GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{stores_other}', to_jsonb(ROW_COUNT));
    RAISE NOTICE '🗑️  stores (autres orgs) supprimés : %', (v_deleted_counts->>'stores_other')::int;
  END IF;

  -- ─── 6. Supprimer les subscriptions des AUTRES organisations ─
  IF v_super_admin_org_id IS NOT NULL THEN
    DELETE FROM public.subscriptions
    WHERE organization_id != v_super_admin_org_id;
    GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{subscriptions_other}', to_jsonb(ROW_COUNT));
    RAISE NOTICE '🗑️  subscriptions (autres orgs) supprimées : %', (v_deleted_counts->>'subscriptions_other')::int;
  END IF;

  -- ─── 7. Supprimer les autres organisations ──────────────────
  -- delete_organization() fait le cascade, mais on a déjà supprimé les données
  -- donc on peut faire un DELETE direct
  IF v_super_admin_org_id IS NOT NULL THEN
    DELETE FROM public.organizations
    WHERE id != v_super_admin_org_id;
    GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{organizations_other}', to_jsonb(ROW_COUNT));
    RAISE NOTICE '🗑️  organisations (autres) supprimées : %', (v_deleted_counts->>'organizations_other')::int;
  ELSE
    -- Si le super admin n'a pas d'org, supprimer toutes les orgs
    DELETE FROM public.organizations;
    RAISE NOTICE '🗑️  toutes les organisations supprimées';
  END IF;

  -- ─── 8. Supprimer les autres utilisateurs ───────────────────
  -- 8a. user_roles (sauf le super admin)
  DELETE FROM public.user_roles
  WHERE user_id != v_super_admin_user_id;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{user_roles}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  user_roles (autres) supprimés : %', (v_deleted_counts->>'user_roles')::int;

  -- 8b. profiles (sauf le super admin)
  DELETE FROM public.profiles
  WHERE user_id != v_super_admin_user_id;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{profiles}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  profiles (autres) supprimés : %', (v_deleted_counts->>'profiles')::int;

  -- 8c. app_activity (logs d'activité des autres utilisateurs)
  DELETE FROM public.app_activity
  WHERE user_id != v_super_admin_user_id;

  -- 8d. auth.users (sauf le super admin) — ATTENTION : cascade vers identities, sessions, etc.
  DELETE FROM auth.users
  WHERE id != v_super_admin_user_id
    AND email != v_super_admin_email;
  GET DIAGNOSTICS v_deleted_counts = jsonb_set(v_deleted_counts, '{auth_users}', to_jsonb(ROW_COUNT));
  RAISE NOTICE '🗑️  auth.users (autres) supprimés : %', (v_deleted_counts->>'auth_users')::int;

  -- ─── 9. Vérification finale ─────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ NETTOYAGE TERMINÉ';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Super admin gardé : %', v_super_admin_email;
  RAISE NOTICE 'Organisation gardée : %', COALESCE(v_super_admin_org_id::text, 'AUCUNE');
  RAISE NOTICE 'Catégories du super admin : conservées';
  RAISE NOTICE 'Stores du super admin : conservés';
  RAISE NOTICE 'Subscription du super admin : conservée';
  RAISE NOTICE '═══════════════════════════════════════════════════════';

  -- Vérifier qu'il ne reste que le super admin
  PERFORM 1 FROM auth.users WHERE email = v_super_admin_email;
  IF NOT FOUND THEN
    RAISE EXCEPTION '❌ ERREUR : le super admin a été supprimé par erreur !';
  END IF;

  RAISE NOTICE '✅ Vérification : le super admin est toujours présent';
END $$;

-- ─── Vérifications post-nettoyage (à exécuter séparément) ──────
-- Ces requêtes affichent l'état final après nettoyage :

-- Nombre d'utilisateurs restants (doit être 1)
SELECT COUNT(*) AS users_restants FROM auth.users;

-- Nombre d'organisations restantes (doit être 1 ou 0)
SELECT COUNT(*) AS orgs_restantes FROM public.organizations;

-- Nombre de catégories restantes (doit être > 0)
SELECT COUNT(*) AS categories_restantes FROM public.categories;

-- Nombre de produits restants (doit être 0)
SELECT COUNT(*) AS produits_restants FROM public.products;

-- Nombre de ventes restantes (doit être 0)
SELECT COUNT(*) AS ventes_restantes FROM public.sales;

-- Nombre de clients restants (doit être 0)
SELECT COUNT(*) AS clients_restants FROM public.customers;

-- Super admin restant
SELECT email, created_at FROM auth.users WHERE email = 'kaba.sekouna@gmail.com';

-- Catégories restantes
SELECT id, name, organization_id FROM public.categories ORDER BY name;
