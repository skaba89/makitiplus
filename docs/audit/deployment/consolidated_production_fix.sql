-- ============================================================
-- CONSOLIDATED PRODUCTION FIX — Apply ALL corrections in one shot
-- Date: 2026-07-09
-- Référence: AUDIT-2026-007 + production-stabilization
--
-- This script consolidates ALL SQL fixes applied during the audit
-- and stabilization phases. It is IDEMPOTENT — safe to re-run.
--
-- Fixes included:
--   1. Helper functions (is_super_admin, is_org_admin, has_role, etc.)
--   2. Auth RPCs (register_user, touch_last_login, record_user_logout, log_user_activity)
--   3. Seller activity RPCs (get_seller_performance, get_seller_activities)
--   4. Subscription RPCs (get_organization_subscription, check_feature_access, check_plan_limit)
--   5. Admin RPCs (admin_get_all_subscriptions, get_admin_stores_summary)
--   6. Store RPCs (create_first_organization, delete_organization, get_organization_stores)
--   7. Other RPCs (get_categories, get_top_products, get_onboarding_checklist, check_account_status)
--   8. ENUM app_activity_action creation + column migration
--   9. PostgREST schema reload
--
-- IMPORTANT: This script uses DROP FUNCTION IF EXISTS to remove ALL
-- overloads before recreating. This prevents "cannot change return type"
-- errors and ensures only ONE version of each function exists.
--
-- No destructive operations (no DELETE, no TRUNCATE, no DROP TABLE).
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 0. Helper functions
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role TEXT)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = p_role::public.app_role
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- 1. ENUM app_activity_action
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_activity_action') THEN
    CREATE TYPE public.app_activity_action AS ENUM (
      'login', 'logout', 'session_timeout',
      'sale_created', 'sale_refunded', 'sale_cancelled',
      'product_created', 'product_updated', 'product_deleted',
      'stock_adjusted', 'stock_transfer',
      'customer_created', 'customer_updated', 'credit_payment',
      'supplier_created', 'supplier_updated',
      'purchase_order_created', 'purchase_order_received',
      'user_created', 'user_deactivated', 'user_reactivated',
      'password_reset', 'settings_updated',
      'backup_created', 'backup_restored',
      'store_created', 'store_updated'
    );
    RAISE NOTICE 'ENUM cree';
  END IF;
END $$;

-- Migrer la colonne action si necessaire
DO $$
DECLARE v_col_type TEXT;
BEGIN
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_name = 'user_activity_logs' AND column_name = 'action';
  IF v_col_type = 'text' THEN
    ALTER TABLE public.user_activity_logs
      ALTER COLUMN action DROP DEFAULT,
      ALTER COLUMN action TYPE public.app_activity_action
      USING CASE WHEN action::text = ANY(ARRAY[
        'login','logout','session_timeout','sale_created','sale_refunded','sale_cancelled',
        'product_created','product_updated','product_deleted','stock_adjusted','stock_transfer',
        'customer_created','customer_updated','credit_payment','supplier_created','supplier_updated',
        'purchase_order_created','purchase_order_received','user_created','user_deactivated',
        'user_reactivated','password_reset','settings_updated','backup_created','backup_restored',
        'store_created','store_updated'
      ]::text[]) THEN action::public.app_activity_action ELSE NULL END;
  ELSIF v_col_type IS NULL THEN
    ALTER TABLE public.user_activity_logs ADD COLUMN action public.app_activity_action;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- 2. Auth RPCs
-- ════════════════════════════════════════════════════════════════

-- touch_last_login
DROP FUNCTION IF EXISTS public.touch_last_login();
CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.profiles SET last_login_at = now() WHERE user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated, service_role;

-- record_user_logout
DROP FUNCTION IF EXISTS public.record_user_logout();
CREATE OR REPLACE FUNCTION public.record_user_logout()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.profiles SET last_logout_at = NOW() WHERE user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_user_logout() TO authenticated;

-- log_user_activity (accepte TEXT, cast en interne)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE proname = 'log_user_activity' AND pronamespace = 'public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.log_user_activity(
  p_action TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID; v_log_id UUID; v_action_enum public.app_activity_action;
BEGIN
  BEGIN
    v_action_enum := p_action::public.app_activity_action;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT organization_id INTO v_org_id FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.user_activity_logs (user_id, organization_id, action, description, metadata)
  VALUES (auth.uid(), v_org_id, v_action_enum, p_description, p_metadata)
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_user_activity(TEXT, TEXT, JSONB) TO authenticated;

-- update_updated_at_column (trigger manquant)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- 3. Seller Activity RPCs
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE proname = 'get_seller_performance' AND pronamespace = 'public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig; END LOOP;
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE proname = 'get_seller_activities' AND pronamespace = 'public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_seller_performance(
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID, seller_name TEXT, role TEXT,
  total_sales BIGINT, total_revenue NUMERIC, avg_sale_amount NUMERIC,
  last_login_at TIMESTAMPTZ, last_logout_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ, is_active BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  SELECT p.organization_id INTO v_org_id FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Aucune organisation'; END IF;
  IF NOT (public.is_super_admin() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Acces refuse';
  END IF;
  RETURN QUERY
  SELECT
    p.user_id,
    COALESCE(p.owner_name, p.business_name, 'Inconnu')::TEXT AS seller_name,
    COALESCE(ur.role::TEXT, 'vendeur') AS role,
    COALESCE(ss.total_sales, 0)::BIGINT AS total_sales,
    COALESCE(ss.total_revenue, 0)::NUMERIC AS total_revenue,
    COALESCE(ss.avg_sale_amount, 0)::NUMERIC AS avg_sale_amount,
    p.last_login_at, p.last_logout_at, p.last_seen_at,
    COALESCE(p.is_active, true) AS is_active
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS total_sales,
      COALESCE(SUM(s.total_amount), 0)::NUMERIC AS total_revenue,
      CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(s.total_amount), 2) ELSE 0 END::NUMERIC AS avg_sale_amount
    FROM public.sales s
    WHERE s.user_id = p.user_id AND s.organization_id = v_org_id
      AND (p_period_start IS NULL OR s.created_at >= p_period_start)
      AND (p_period_end IS NULL OR s.created_at <= p_period_end)
  ) ss ON true
  WHERE p.organization_id = v_org_id
  ORDER BY COALESCE(ss.total_revenue, 0) DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_seller_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_seller_activities(
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID, user_id UUID, seller_name TEXT,
  action TEXT, description TEXT, metadata JSONB, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  SELECT p.organization_id INTO v_org_id FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Aucune organisation'; END IF;
  IF NOT (public.is_super_admin() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Acces refuse';
  END IF;
  RETURN QUERY
  SELECT ual.id, ual.user_id,
    COALESCE(p.owner_name, p.business_name, 'Inconnu')::TEXT AS seller_name,
    ual.action::TEXT AS action, ual.description, ual.metadata, ual.created_at
  FROM public.user_activity_logs ual
  JOIN public.profiles p ON p.user_id = ual.user_id
  WHERE ual.organization_id = v_org_id AND (p_user_id IS NULL OR ual.user_id = p_user_id)
  ORDER BY ual.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_seller_activities(UUID, INTEGER) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. Subscription RPCs (JSONB)
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_organization_subscription();
CREATE OR REPLACE FUNCTION public.get_organization_subscription()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN jsonb_build_object('error', 'no_organization'); END IF;
  SELECT jsonb_build_object(
    'subscription_id', s.id, 'plan_id', s.plan_id, 'plan_name', p.name,
    'status', s.status, 'current_period_end', s.current_period_end,
    'trial_ends_at', s.trial_ends_at, 'grace_period_ends_at', s.grace_period_ends_at,
    'max_stores', p.max_stores, 'max_users', p.max_users,
    'max_products', p.max_products, 'max_sales_per_month', p.max_sales_per_month,
    'has_advanced_reports', p.has_advanced_reports, 'has_exports', p.has_exports,
    'has_supplier_management', p.has_supplier_management, 'has_offline_advanced', p.has_offline_advanced,
    'has_api_access', p.has_api_access, 'has_priority_support', p.has_priority_support,
    'has_custom_branding', p.has_custom_branding, 'has_multi_currency', p.has_multi_currency,
    'has_ai_assistant', p.has_ai_assistant, 'has_loyalty_program', p.has_loyalty_program
  ) INTO v_result
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id AND s.status IN ('active','trialing','past_due','grace_period')
  ORDER BY s.created_at DESC LIMIT 1;
  IF v_result IS NULL THEN
    SELECT jsonb_build_object('plan_id','starter','plan_name',p.name,'status','active',
      'max_stores',p.max_stores,'max_users',p.max_users,'max_products',p.max_products,
      'max_sales_per_month',p.max_sales_per_month)
    INTO v_result FROM public.plans p WHERE p.id = 'starter';
  END IF;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_organization_subscription() TO authenticated;

-- check_feature_access
DROP FUNCTION IF EXISTS public.check_feature_access(TEXT);
CREATE OR REPLACE FUNCTION public.check_feature_access(p_feature_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_plan_id TEXT; v_allowed_plans TEXT[]; v_allowed BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN v_plan_id := 'starter';
  ELSE
    SELECT s.plan_id::text INTO v_plan_id FROM public.subscriptions s
    WHERE s.organization_id = v_org_id AND s.status IN ('active','past_due','grace_period','trialing')
    ORDER BY s.created_at DESC LIMIT 1;
    IF v_plan_id IS NULL THEN v_plan_id := 'starter'; END IF;
  END IF;
  SELECT allowed_plans INTO v_allowed_plans FROM public.feature_flags WHERE feature_key = p_feature_key LIMIT 1;
  v_allowed := CASE WHEN v_allowed_plans IS NULL THEN FALSE ELSE v_plan_id = ANY(v_allowed_plans) END;
  RETURN jsonb_build_object('allowed', v_allowed, 'plan_id', v_plan_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_feature_access(TEXT) TO authenticated;

-- check_plan_limit
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'check_plan_limit' AND pronamespace = 'public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.check_plan_limit(p_limit_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_sub RECORD; v_current INTEGER; v_limit INTEGER; v_plan_id TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN jsonb_build_object('allowed',false,'current',0,'limit',0,'plan_id','starter'); END IF;
  SELECT s.plan_id::text, p.max_stores, p.max_users, p.max_products, p.max_sales_per_month
  INTO v_sub FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id AND s.status IN ('active','trialing','past_due','grace_period')
  ORDER BY s.created_at DESC LIMIT 1;
  IF NOT FOUND THEN SELECT * INTO v_sub FROM public.plans WHERE id = 'starter'; v_plan_id := 'starter';
  ELSE v_plan_id := v_sub.plan_id; END IF;
  CASE p_limit_type
    WHEN 'stores' THEN SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id; v_limit := v_sub.max_stores;
    WHEN 'users' THEN SELECT COUNT(*) INTO v_current FROM public.user_roles ur JOIN public.profiles p ON p.user_id = ur.user_id WHERE p.organization_id = v_org_id; v_limit := v_sub.max_users;
    WHEN 'products' THEN SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id; v_limit := v_sub.max_products;
    WHEN 'sales_this_month' THEN SELECT COUNT(*) INTO v_current FROM public.sales WHERE organization_id = v_org_id AND created_at >= date_trunc('month', NOW()); v_limit := v_sub.max_sales_per_month;
    ELSE v_current := 0; v_limit := NULL;
  END CASE;
  RETURN jsonb_build_object('allowed',(v_limit IS NULL OR v_current < v_limit),'current',v_current,'limit',v_limit,'plan_id',v_plan_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 5. Admin RPCs
-- ════════════════════════════════════════════════════════════════

-- admin_get_all_subscriptions (casts explicites)
DROP FUNCTION IF EXISTS public.admin_get_all_subscriptions();
CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Access denied: super_admin only'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'organization_id', o.id, 'organization_name', o.name,
    'owner_email', au.email, 'country', o.country,
    'subscription_id', s.id, 'plan_id', s.plan_id, 'plan_name', p.name,
    'status', s.status, 'current_period_start', s.current_period_start,
    'current_period_end', s.current_period_end, 'trial_ends_at', s.trial_ends_at,
    'billing_period', s.billing_period, 'stripe_customer_id', o.stripe_customer_id,
    'created_at', s.created_at
  ) ORDER BY o.name), '[]'::jsonb) INTO v_result
  FROM organizations o
  LEFT JOIN subscriptions s ON s.organization_id = o.id
  LEFT JOIN plans p ON p.id = s.plan_id
  LEFT JOIN auth.users au ON au.id = o.owner_user_id;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;

-- get_admin_stores_summary
DROP FUNCTION IF EXISTS public.get_admin_stores_summary();
CREATE OR REPLACE FUNCTION public.get_admin_stores_summary()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN RETURN jsonb_build_object('error','access_denied'); END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'store_id', s.id, 'store_name', s.name, 'org_name', o.name,
    'country', s.country, 'currency', s.currency, 'category', s.category,
    'product_count', (SELECT count(*) FROM public.products p WHERE p.organization_id = o.id),
    'sale_count', (SELECT count(*) FROM public.sales sa WHERE sa.organization_id = o.id),
    'created_at', s.created_at
  ) ORDER BY s.created_at DESC), '[]'::jsonb) INTO v_result
  FROM public.stores s JOIN public.organizations o ON o.id = s.organization_id;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_stores_summary() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 6. Store RPCs
-- ════════════════════════════════════════════════════════════════

-- delete_organization (cascade profils + stores)
DROP FUNCTION IF EXISTS public.delete_organization(UUID);
CREATE OR REPLACE FUNCTION public.delete_organization(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_name TEXT; v_owner_user_id UUID;
  v_store_count INTEGER := 0; v_user_count INTEGER := 0;
  v_subscription_plan TEXT; v_detach_count INTEGER := 0;
BEGIN
  SELECT name, owner_user_id INTO v_org_name, v_owner_user_id FROM public.organizations WHERE id = p_organization_id;
  IF v_org_name IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Acces refuse'; END IF;
  SELECT COUNT(*) INTO v_store_count FROM public.stores WHERE organization_id = p_organization_id;
  SELECT COUNT(*) INTO v_user_count FROM public.profiles WHERE organization_id = p_organization_id;
  SELECT subscription_plan INTO v_subscription_plan FROM public.organizations WHERE id = p_organization_id;
  -- Détacher les profils
  UPDATE public.profiles SET organization_id = NULL, updated_at = now() WHERE organization_id = p_organization_id;
  GET DIAGNOSTICS v_detach_count = ROW_COUNT;
  -- Supprimer les stores
  IF v_store_count > 0 THEN DELETE FROM public.stores WHERE organization_id = p_organization_id; END IF;
  -- Supprimer l'org
  DELETE FROM public.organizations WHERE id = p_organization_id;
  RETURN jsonb_build_object('success', TRUE, 'organization_name', v_org_name,
    'deleted_stores', v_store_count, 'detached_users', v_detach_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_organization(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 7. Other RPCs (casts explicites)
-- ════════════════════════════════════════════════════════════════

-- get_organization_stores
DROP FUNCTION IF EXISTS public.get_organization_stores();
CREATE OR REPLACE FUNCTION public.get_organization_stores()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, country TEXT, currency TEXT, category TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT s.id, s.name::text, s.slug::text, s.country::text, s.currency::text, s.category::text, s.created_at
  FROM public.stores s WHERE s.organization_id = public.get_user_organization_id() ORDER BY s.created_at;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_organization_stores() TO authenticated;

-- get_top_products
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'get_top_products' AND pronamespace = 'public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_top_products(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  product_id UUID, product_name TEXT, barcode TEXT, unit TEXT, total_sold INTEGER, total_revenue NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name::text, p.barcode::text, p.unit::text,
    COALESCE(SUM(si.quantity), 0)::integer, COALESCE(SUM(si.quantity * si.unit_price), 0)
  FROM public.products p
  LEFT JOIN public.sale_items si ON si.product_id = p.id
  LEFT JOIN public.sales s ON s.id = si.sale_id
  WHERE p.organization_id = public.get_user_organization_id()
    AND (s.organization_id = public.get_user_organization_id() OR s.id IS NULL)
  GROUP BY p.id, p.name, p.barcode, p.unit ORDER BY total_sold DESC LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_products(INTEGER) TO authenticated;

-- get_onboarding_checklist
DROP FUNCTION IF EXISTS public.get_onboarding_checklist();
CREATE OR REPLACE FUNCTION public.get_onboarding_checklist()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN jsonb_build_object('error','no_organization'); END IF;
  SELECT jsonb_build_object(
    'has_products', (SELECT count(*) > 0 FROM public.products WHERE organization_id = v_org_id),
    'has_categories', (SELECT count(*) > 0 FROM public.categories WHERE organization_id = v_org_id),
    'has_customers', (SELECT count(*) > 0 FROM public.customers WHERE organization_id = v_org_id),
    'has_sales', (SELECT count(*) > 0 FROM public.sales WHERE organization_id = v_org_id),
    'has_stores', (SELECT count(*) > 0 FROM public.stores WHERE organization_id = v_org_id),
    'product_count', (SELECT count(*) FROM public.products WHERE organization_id = v_org_id),
    'store_count', (SELECT count(*) FROM public.stores WHERE organization_id = v_org_id),
    'sale_count', (SELECT count(*) FROM public.sales WHERE organization_id = v_org_id)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_onboarding_checklist() TO authenticated;

-- check_account_status
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'check_account_status' AND pronamespace = 'public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE (
  is_active BOOLEAN, is_test_account BOOLEAN, test_expires_at TIMESTAMPTZ, deactivation_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT p.is_active, p.is_test_account, p.test_expires_at, p.deactivation_reason::text
  FROM public.profiles p WHERE p.user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated;

-- get_categories
DROP FUNCTION IF EXISTS public.get_categories();
CREATE OR REPLACE FUNCTION public.get_categories()
RETURNS TABLE (
  id UUID, name TEXT, description TEXT, sort_order INTEGER, product_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name::text, c.description::text, c.sort_order,
    (SELECT count(*) FROM public.products p WHERE p.category_id = c.id)
  FROM public.categories c WHERE c.organization_id = public.get_user_organization_id()
  ORDER BY c.sort_order, c.name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_categories() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 8. PostgREST reload
-- ════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- 9. Vérification — chaque fonction doit avoir exactement 1 version
-- ════════════════════════════════════════════════════════════════
SELECT proname, count(*) AS versions
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'is_super_admin', 'is_org_admin', 'get_user_organization_id', 'has_role',
    'touch_last_login', 'record_user_logout', 'log_user_activity', 'update_updated_at_column',
    'get_seller_performance', 'get_seller_activities',
    'get_organization_subscription', 'check_feature_access', 'check_plan_limit',
    'admin_get_all_subscriptions', 'get_admin_stores_summary',
    'delete_organization', 'get_organization_stores',
    'get_top_products', 'get_onboarding_checklist', 'check_account_status', 'get_categories'
  )
GROUP BY proname
ORDER BY proname;
