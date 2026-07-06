-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Cleanup All Data Except Categories (Robust Version)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Works even when auth.uid() is NULL (SQL Editor context)
-- ═══════════════════════════════════════════════════════════════════════════════

-- STEP 0: Add missing columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NULL;

-- STEP 1: Detach profiles from organizations (BREAK FK FIRST!)
-- This is the key fix - null out the FK before deleting organizations
UPDATE public.profiles SET organization_id = NULL;

-- STEP 2: Now we can safely delete organizations
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
DELETE FROM public.organizations;  -- Now safe!

-- STEP 3: Clean orphaned tables
DELETE FROM public.password_reset_tokens;
DELETE FROM public.subscription_events;
DELETE FROM public.stripe_events;
DELETE FROM public.usage_counters;
DELETE FROM public.sync_conflicts;
DELETE FROM public.user_audit_log;

-- STEP 4: Keep ONE profile for your email (replace with your actual email)
-- Find your user by email and keep only that one
DO $$
DECLARE
  v_keep_email TEXT := 'skaba89@gmail.com';  -- REPLACE WITH YOUR EMAIL!
  v_keep_user_id UUID;
BEGIN
  -- Get the user ID to keep
  SELECT id INTO v_keep_user_id FROM auth.users WHERE email = v_keep_email LIMIT 1;
  
  IF v_keep_user_id IS NOT NULL THEN
    -- Delete other profiles
    DELETE FROM public.profiles WHERE user_id != v_keep_user_id;
    
    -- Delete other user_roles
    DELETE FROM public.user_roles WHERE user_id != v_keep_user_id;
    
    -- Ensure super_admin role for kept user
    INSERT INTO public.user_roles (user_id, role, created_at)
    VALUES (v_keep_user_id, 'super_admin', NOW())
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Delete other auth.users
    DELETE FROM auth.users WHERE id != v_keep_user_id;
    
    RAISE NOTICE 'Kept user % with email %', v_keep_user_id, v_keep_email;
  ELSE
    RAISE NOTICE 'Email % not found in auth.users - keeping first user', v_keep_email;
    -- Keep first user as fallback
    SELECT id INTO v_keep_user_id FROM auth.users LIMIT 1;
    IF v_keep_user_id IS NOT NULL THEN
      DELETE FROM public.profiles WHERE user_id != v_keep_user_id;
      DELETE FROM public.user_roles WHERE user_id != v_keep_user_id;
      INSERT INTO public.user_roles (user_id, role, created_at)
      VALUES (v_keep_user_id, 'super_admin', NOW())
      ON CONFLICT (user_id, role) DO NOTHING;
      DELETE FROM auth.users WHERE id != v_keep_user_id;
    END IF;
  END IF;
END $$;

-- STEP 5: Verify
SELECT 'organizations' as table_name, COUNT(*) as count FROM public.organizations
UNION ALL SELECT 'stores', COUNT(*) FROM public.stores
UNION ALL SELECT 'profiles', COUNT(*) FROM public.profiles
UNION ALL SELECT 'sales', COUNT(*) FROM public.sales
UNION ALL SELECT 'products', COUNT(*) FROM public.products
UNION ALL SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL SELECT 'user_roles', COUNT(*) FROM public.user_roles
UNION ALL SELECT 'auth_users', COUNT(*) FROM auth.users;