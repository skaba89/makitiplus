-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Cleanup All Data Except Categories
-- ═══════════════════════════════════════════════════════════════════════════════
-- Purpose: Delete all data from the database except:
--   - categories table (preserve product categories)
--   - plans table (preserve subscription plan definitions)
--   - feature_flags table (preserve system flags)
--
-- This script also ensures the executing user has super_admin role
-- ═══════════════════════════════════════════════════════════════════════════════

-- Step 1: Ensure current user has super_admin role
-- ═══════════════════════════════════════════════════════════════════════════════

-- Get the current authenticated user
DO $$
DECLARE
  v_user_id UUID;
  v_existing_role TEXT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No authenticated user - skipping role assignment';
  ELSE
    -- Check if user already has super_admin
    SELECT role INTO v_existing_role
    FROM public.user_roles
    WHERE user_id = v_user_id AND role = 'super_admin';
    
    IF v_existing_role IS NULL THEN
      -- Upsert super_admin role
      INSERT INTO public.user_roles (user_id, role, created_at)
      VALUES (v_user_id, 'super_admin', NOW())
      ON CONFLICT (user_id, role) DO NOTHING;
      
      RAISE NOTICE 'Granted super_admin role to user %', v_user_id;
    ELSE
      RAISE NOTICE 'User % already has super_admin role', v_user_id;
    END IF;
    
    -- Also ensure profile exists and is active
    UPDATE public.profiles
    SET is_active = TRUE
    WHERE user_id = v_user_id;
    
    RAISE NOTICE 'Profile activated for user %', v_user_id;
  END IF;
END $$;

-- Step 2: Delete all organizations (cascade will handle most related data)
-- ═══════════════════════════════════════════════════════════════════════════════

-- The organizations table has CASCADE on delete, so deleting organizations
-- will automatically delete:
--   - stores (FK to organizations)
--   - profiles (FK to organizations)
--   - subscriptions (FK to organizations)
--   - products (via store FK)
--   - sales (via store FK)
--   - sale_items (via sale FK)
--   - customers (via organization_id FK)
--   - expenses (via organization_id FK)
--   - suppliers (via organization_id FK)
--   - stock_movements (via organization_id FK)
--   - user_activity_logs (via organization_id FK)
--   - etc.

-- First, let's see what we're deleting
DO $$
DECLARE
  v_org_count INTEGER;
  v_store_count INTEGER;
  v_user_count INTEGER;
  v_sale_count INTEGER;
  v_product_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_org_count FROM public.organizations;
  SELECT COUNT(*) INTO v_store_count FROM public.stores;
  SELECT COUNT(*) INTO v_user_count FROM public.profiles;
  SELECT COUNT(*) INTO v_sale_count FROM public.sales;
  SELECT COUNT(*) INTO v_product_count FROM public.products;
  
  RAISE NOTICE 'Before cleanup:';
  RAISE NOTICE '  Organizations: %', v_org_count;
  RAISE NOTICE '  Stores: %', v_store_count;
  RAISE NOTICE '  Users: %', v_user_count;
  RAISE NOTICE '  Sales: %', v_sale_count;
  RAISE NOTICE '  Products: %', v_product_count;
END $$;

-- Delete all organizations (CASCADE handles stores, profiles, sales, etc.)
DELETE FROM public.organizations;

-- Step 3: Clean up tables that don't cascade from organizations
-- ═══════════════════════════════════════════════════════════════════════════════

-- These tables have loose FKs or no FK to organizations

-- user_roles (except for current user)
DELETE FROM public.user_roles
WHERE user_id != auth.uid();

-- password_reset_tokens
DELETE FROM public.password_reset_tokens;

-- subscription_events (organization already deleted, clean orphaned)
DELETE FROM public.subscription_events;

-- stripe_events
DELETE FROM public.stripe_events;

-- usage_counters (organization already deleted)
DELETE FROM public.usage_counters;

-- sync_conflicts
DELETE FROM public.sync_conflicts;

-- user_audit_log (keep for audit trail? or delete)
DELETE FROM public.user_audit_log;

-- purchase_orders (should have cascaded via organization/store)
-- But let's make sure
DELETE FROM public.purchase_order_items;
DELETE FROM public.purchase_orders;

-- supplier_products (should cascade from supplier)
DELETE FROM public.supplier_products;

-- customer_credits (should cascade from customer)
DELETE FROM public.customer_credits;

-- stock_movements (orphaned records)
DELETE FROM public.stock_movements;

-- store_settings (orphaned)
DELETE FROM public.store_settings;

-- Step 4: Clean auth.users except super_admin
-- ═══════════════════════════════════════════════════════════════════════════════

-- Delete all auth.users except the current super admin
-- This is dangerous! Only do this if you want a complete reset
-- We'll keep the current user

DO $$
DECLARE
  v_current_user UUID;
  v_deleted_count INTEGER;
BEGIN
  v_current_user := auth.uid();
  
  IF v_current_user IS NOT NULL THEN
    -- Delete all other users from auth.users
    -- Note: This will cascade to profiles via FK
    DELETE FROM auth.users
    WHERE id != v_current_user;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % auth.users (kept current user %)', v_deleted_count, v_current_user;
  END IF;
END $$;

-- Step 5: Verify cleanup
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_org_count INTEGER;
  v_store_count INTEGER;
  v_profile_count INTEGER;
  v_sale_count INTEGER;
  v_product_count INTEGER;
  v_customer_count INTEGER;
  v_category_count INTEGER;
  v_plan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_org_count FROM public.organizations;
  SELECT COUNT(*) INTO v_store_count FROM public.stores;
  SELECT COUNT(*) INTO v_profile_count FROM public.profiles;
  SELECT COUNT(*) INTO v_sale_count FROM public.sales;
  SELECT COUNT(*) INTO v_product_count FROM public.products;
  SELECT COUNT(*) INTO v_customer_count FROM public.customers;
  SELECT COUNT(*) INTO v_category_count FROM public.categories;
  SELECT COUNT(*) INTO v_plan_count FROM public.plans;
  
  RAISE NOTICE 'After cleanup:';
  RAISE NOTICE '  Organizations: % (should be 0)', v_org_count;
  RAISE NOTICE '  Stores: % (should be 0)', v_store_count;
  RAISE NOTICE '  Profiles: % (should be 1 - current user)', v_profile_count;
  RAISE NOTICE '  Sales: % (should be 0)', v_sale_count;
  RAISE NOTICE '  Products: % (should be 0)', v_product_count;
  RAISE NOTICE '  Customers: % (should be 0)', v_customer_count;
  RAISE NOTICE '  Categories: % (PRESERVED)', v_category_count;
  RAISE NOTICE '  Plans: % (PRESERVED)', v_plan_count;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- End of cleanup script
-- ═══════════════════════════════════════════════════════════════════════════════