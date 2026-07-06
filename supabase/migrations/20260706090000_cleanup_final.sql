-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Cleanup All Data Except Categories (Final Version)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Handles ALL FK constraints: profiles, categories -> organizations
-- ═══════════════════════════════════════════════════════════════════════════════

-- STEP 0: Add missing columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: DETACH ALL FK references to organizations
-- ═══════════════════════════════════════════════════════════════════════════════

-- Profiles -> organizations
UPDATE public.profiles SET organization_id = NULL;

-- Categories -> organizations (we want to keep categories but detach from orgs)
UPDATE public.categories SET organization_id = NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Delete all child tables then organizations
-- ═══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.sale_items;
DELETE FROM public.sales;
DELETE FROM public.stock_movements;
DELETE FROM public.products;
DELETE FROM public.customer_credits;
DELETE FROM public.customers;
DELETE FROM public.expenses;
DELETE FROM public.supplier_products;
DELETE FROM public.suppliers;
DELETE FROM public.purchase_order_items;
DELETE FROM public.purchase_orders;
DELETE FROM public.user_activity_logs;
DELETE FROM public.store_settings;
DELETE FROM public.stores;
DELETE FROM public.subscriptions;
DELETE FROM public.organizations;  -- NOW SAFE!

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Clean orphaned tables
-- ═══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.password_reset_tokens;
DELETE FROM public.subscription_events;
DELETE FROM public.stripe_events;
DELETE FROM public.usage_counters;
DELETE FROM public.sync_conflicts;
DELETE FROM public.user_audit_log;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Keep ONE user by email
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_keep_email TEXT := 'skaba89@gmail.com';  -- REMPLACEZ PAR VOTRE EMAIL!
  v_keep_user_id UUID;
BEGIN
  SELECT id INTO v_keep_user_id FROM auth.users WHERE email = v_keep_email LIMIT 1;
  
  IF v_keep_user_id IS NOT NULL THEN
    DELETE FROM public.profiles WHERE user_id != v_keep_user_id;
    DELETE FROM public.user_roles WHERE user_id != v_keep_user_id;
    
    INSERT INTO public.user_roles (user_id, role, created_at)
    VALUES (v_keep_user_id, 'super_admin', NOW())
    ON CONFLICT (user_id, role) DO NOTHING;
    
    DELETE FROM auth.users WHERE id != v_keep_user_id;
    RAISE NOTICE 'Kept user %', v_keep_email;
  ELSE
    -- Fallback: keep first user
    SELECT id INTO v_keep_user_id FROM auth.users LIMIT 1;
    DELETE FROM public.profiles WHERE user_id != v_keep_user_id;
    DELETE FROM public.user_roles WHERE user_id != v_keep_user_id;
    INSERT INTO public.user_roles (user_id, role, created_at)
    VALUES (v_keep_user_id, 'super_admin', NOW())
    ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM auth.users WHERE id != v_keep_user_id;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Verify
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT table_name, count FROM (
  SELECT 'organizations' as table_name, COUNT(*) as count FROM public.organizations
  UNION ALL SELECT 'stores', COUNT(*) FROM public.stores
  UNION ALL SELECT 'profiles', COUNT(*) FROM public.profiles
  UNION ALL SELECT 'sales', COUNT(*) FROM public.sales
  UNION ALL SELECT 'products', COUNT(*) FROM public.products
  UNION ALL SELECT 'customers', COUNT(*) FROM public.customers
  UNION ALL SELECT 'categories' as table_name, COUNT(*) as count FROM public.categories
  UNION ALL SELECT 'user_roles', COUNT(*) FROM public.user_roles
  UNION ALL SELECT 'auth_users', COUNT(*) FROM auth.users
) ORDER BY table_name;