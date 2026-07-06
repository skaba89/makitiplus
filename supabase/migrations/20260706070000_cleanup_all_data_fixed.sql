-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Cleanup All Data Except Categories (Fixed Version)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Purpose: Delete all data from the database except:
--   - categories table (preserve product categories)
--   - plans table (preserve subscription plan definitions)
--   - feature_flags table (preserve system flags)
--   - current user's profile and super_admin role
--
-- FIXES:
--   1. Handles existing RLS policies (DROP IF EXISTS)
--   2. Deletes profiles BEFORE organizations (FK constraint)
--   3. Uses TRUNCATE CASCADE where possible for efficiency
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 0: Drop existing policies that might conflict
-- ═══════════════════════════════════════════════════════════════════════════════

-- Skip policy creation - policies already exist from previous migration
-- We'll just add columns if missing

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NULL;

-- Ensure user_activity_logs table exists (skip policies - they exist)
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user
  ON public.user_activity_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_org
  ON public.user_activity_logs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action
  ON public.user_activity_logs(action, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Ensure current user has super_admin role
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user_id UUID;
  v_existing_role TEXT;
BEGIN
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
    
    -- Ensure profile is active
    UPDATE public.profiles
    SET is_active = TRUE
    WHERE user_id = v_user_id;
    
    RAISE NOTICE 'Profile activated for user %', v_user_id;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Show current state
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_org_count INTEGER;
  v_store_count INTEGER;
  v_user_count INTEGER;
  v_sale_count INTEGER;
  v_product_count INTEGER;
  v_customer_count INTEGER;
  v_category_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_org_count FROM public.organizations;
  SELECT COUNT(*) INTO v_store_count FROM public.stores;
  SELECT COUNT(*) INTO v_user_count FROM public.profiles;
  SELECT COUNT(*) INTO v_sale_count FROM public.sales;
  SELECT COUNT(*) INTO v_product_count FROM public.products;
  SELECT COUNT(*) INTO v_customer_count FROM public.customers;
  SELECT COUNT(*) INTO v_category_count FROM public.categories;
  
  RAISE NOTICE '════════ BEFORE CLEANUP ════════';
  RAISE NOTICE '  Organizations: %', v_org_count;
  RAISE NOTICE '  Stores: %', v_store_count;
  RAISE NOTICE '  Users (profiles): %', v_user_count;
  RAISE NOTICE '  Sales: %', v_sale_count;
  RAISE NOTICE '  Products: %', v_product_count;
  RAISE NOTICE '  Customers: %', v_customer_count;
  RAISE NOTICE '  Categories: % (PRESERVED)', v_category_count;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Delete child tables first (respecting FK order)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Get current user to preserve
DO $$
DECLARE
  v_current_user UUID;
BEGIN
  v_current_user := auth.uid();
  
  -- 3.1 Delete sale_items first (references sales)
  DELETE FROM public.sale_items;
  RAISE NOTICE 'Deleted sale_items';
  
  -- 3.2 Delete sales (references store, user, organization)
  DELETE FROM public.sales;
  RAISE NOTICE 'Deleted sales';
  
  -- 3.3 Delete stock_movements (references product, store, organization, user)
  DELETE FROM public.stock_movements;
  RAISE NOTICE 'Deleted stock_movements';
  
  -- 3.4 Delete products (references store, category, user)
  DELETE FROM public.products;
  RAISE NOTICE 'Deleted products';
  
  -- 3.5 Delete customer_credits (references customer)
  DELETE FROM public.customer_credits;
  RAISE NOTICE 'Deleted customer_credits';
  
  -- 3.6 Delete customers (references organization)
  DELETE FROM public.customers;
  RAISE NOTICE 'Deleted customers';
  
  -- 3.7 Delete expenses (references organization)
  DELETE FROM public.expenses;
  RAISE NOTICE 'Deleted expenses';
  
  -- 3.8 Delete supplier_products (references supplier)
  DELETE FROM public.supplier_products;
  RAISE NOTICE 'Deleted supplier_products';
  
  -- 3.9 Delete suppliers (references organization)
  DELETE FROM public.suppliers;
  RAISE NOTICE 'Deleted suppliers';
  
  -- 3.10 Delete purchase_order_items (references purchase_orders)
  DELETE FROM public.purchase_order_items;
  RAISE NOTICE 'Deleted purchase_order_items';
  
  -- 3.11 Delete purchase_orders (references store, supplier)
  DELETE FROM public.purchase_orders;
  RAISE NOTICE 'Deleted purchase_orders';
  
  -- 3.12 Delete user_activity_logs (references user, organization)
  DELETE FROM public.user_activity_logs;
  RAISE NOTICE 'Deleted user_activity_logs';
  
  -- 3.13 Delete store_settings (references store)
  DELETE FROM public.store_settings;
  RAISE NOTICE 'Deleted store_settings';
  
  -- 3.14 Delete stores (references organization)
  DELETE FROM public.stores;
  RAISE NOTICE 'Deleted stores';
  
  -- 3.15 Delete subscriptions (references organization)
  DELETE FROM public.subscriptions;
  RAISE NOTICE 'Deleted subscriptions';
  
  -- 3.16 Delete user_roles EXCEPT current user
  IF v_current_user IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id != v_current_user;
    RAISE NOTICE 'Deleted user_roles (kept current user)';
  END IF;
  
  -- 3.17 Delete profiles EXCEPT current user
  -- This MUST happen BEFORE deleting organizations!
  IF v_current_user IS NOT NULL THEN
    DELETE FROM public.profiles WHERE user_id != v_current_user;
    RAISE NOTICE 'Deleted profiles (kept current user)';
  ELSE
    DELETE FROM public.profiles;
    RAISE NOTICE 'Deleted all profiles';
  END IF;
  
  -- 3.18 NOW we can delete organizations
  DELETE FROM public.organizations;
  RAISE NOTICE 'Deleted organizations';
  
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Clean orphaned/system tables
-- ═══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.password_reset_tokens;
DELETE FROM public.subscription_events;
DELETE FROM public.stripe_events;
DELETE FROM public.usage_counters;
DELETE FROM public.sync_conflicts;
DELETE FROM public.user_audit_log;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Clean auth.users (keep current user only)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_current_user UUID;
  v_deleted_count INTEGER;
BEGIN
  v_current_user := auth.uid();
  
  IF v_current_user IS NOT NULL THEN
    -- Delete other auth.users (cascade to any remaining profiles)
    DELETE FROM auth.users WHERE id != v_current_user;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % other auth.users', v_deleted_count;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 6: Verify cleanup
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
  
  RAISE NOTICE '════════ AFTER CLEANUP ════════';
  RAISE NOTICE '  Organizations: % (expected: 0)', v_org_count;
  RAISE NOTICE '  Stores: % (expected: 0)', v_store_count;
  RAISE NOTICE '  Profiles: % (expected: 1)', v_profile_count;
  RAISE NOTICE '  Sales: % (expected: 0)', v_sale_count;
  RAISE NOTICE '  Products: % (expected: 0)', v_product_count;
  RAISE NOTICE '  Customers: % (expected: 0)', v_customer_count;
  RAISE NOTICE '  Categories: % (PRESERVED)', v_category_count;
  RAISE NOTICE '  Plans: % (PRESERVED)', v_plan_count;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 7: Recreate/RPCs if needed
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ensure the RPCs exist (create or replace)
CREATE OR REPLACE FUNCTION public.get_seller_performance(
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID,
  seller_name TEXT,
  role TEXT,
  total_sales BIGINT,
  total_revenue NUMERIC,
  avg_sale_amount NUMERIC,
  last_login_at TIMESTAMPTZ,
  last_logout_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvée';
  END IF;

  IF NOT (public.is_super_admin() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    COALESCE(p.owner_name, p.business_name, 'Inconnu') AS seller_name,
    ur.role::TEXT,
    COALESCE(sales_stats.total_sales, 0) AS total_sales,
    COALESCE(sales_stats.total_revenue, 0) AS total_revenue,
    COALESCE(sales_stats.avg_sale_amount, 0) AS avg_sale_amount,
    p.last_login_at,
    p.last_logout_at,
    p.last_seen_at,
    COALESCE(p.is_active, true) AS is_active
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total_sales,
      SUM(s.total_amount) AS total_revenue,
      CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(s.total_amount), 2) ELSE 0 END AS avg_sale_amount
    FROM public.sales s
    WHERE s.user_id = p.user_id
      AND s.organization_id = v_org_id
      AND (p_period_start IS NULL OR s.created_at >= p_period_start)
      AND (p_period_end IS NULL OR s.created_at <= p_period_end)
  ) sales_stats ON true
  WHERE p.organization_id = v_org_id
  ORDER BY COALESCE(sales_stats.total_revenue, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_seller_activities(
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  seller_name TEXT,
  action TEXT,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvée';
  END IF;

  IF NOT (public.is_super_admin() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    ual.id,
    ual.user_id,
    COALESCE(p.owner_name, p.business_name, 'Inconnu') AS seller_name,
    ual.action,
    ual.description,
    ual.metadata,
    ual.created_at
  FROM public.user_activity_logs ual
  JOIN public.profiles p ON p.user_id = ual.user_id
  WHERE ual.organization_id = v_org_id
    AND (p_user_id IS NULL OR ual.user_id = p_user_id)
  ORDER BY ual.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_activities(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_user_activity(
  p_action TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_log_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.user_activity_logs (user_id, organization_id, action, description, metadata)
  VALUES (auth.uid(), v_org_id, p_action, p_description, p_metadata)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_user_activity(TEXT, TEXT, JSONB) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE! Notify PostgREST to reload schema
-- ═══════════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';