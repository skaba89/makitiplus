-- ══════════════════════════════════════════════════════════════════════════════
-- FIX MISSING RPCs v5 — Restauration des 6 fonctions RPC manquantes
-- Erreurs 404 : check_feature_access, get_admin_stores_summary,
--   get_admin_article_ranking, get_admin_stock_movements,
--   get_admin_sales_trend, get_admin_payment_distribution
--
-- Ce script :
--   1. Vérifie et crée les objets prérequis (tables, fonctions utilitaires)
--   2. Drop toutes les signatures existantes incompatibles
--   3. Crée les 6 fonctions RPC avec les signatures attendues par le frontend
--   4. Accord les permissions d'exécution
--
-- Exécuter dans : Supabase Dashboard → SQL Editor → New Query
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- HELPER : Drop toutes les signatures d'une fonction par son nom
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION pg_temp.drop_all_signatures(p_func_name TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = p_func_name AND pronamespace = 'public'::regnamespace
  LOOP
    BEGIN
      EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
      RAISE NOTICE 'Dropped %', f.func_sig;
    EXCEPTION WHEN dependent_objects_still_exist THEN
      RAISE NOTICE 'Skipping drop of % (has dependent objects), using CREATE OR REPLACE instead', f.func_sig;
    END;
  END LOOP;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 0 : Prérequis — fonctions utilitaires
-- ══════════════════════════════════════════════════════════════════════════════

-- 0.1 get_user_organization_id — utilisée par check_feature_access
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;


-- 0.2 is_super_admin — utilisée par les fonctions admin analytics
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 1 : Tables SaaS prérequis (plans, subscriptions, feature_flags)
-- ══════════════════════════════════════════════════════════════════════════════

-- 1.1 plans — Définitions des plans avec limites
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC(10, 2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10, 2) DEFAULT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  max_stores INTEGER DEFAULT NULL,
  max_users INTEGER DEFAULT NULL,
  max_products INTEGER DEFAULT NULL,
  max_sales_per_month INTEGER DEFAULT NULL,
  has_advanced_reports BOOLEAN NOT NULL DEFAULT FALSE,
  has_exports BOOLEAN NOT NULL DEFAULT FALSE,
  has_supplier_management BOOLEAN NOT NULL DEFAULT FALSE,
  has_offline_advanced BOOLEAN NOT NULL DEFAULT FALSE,
  has_api_access BOOLEAN NOT NULL DEFAULT FALSE,
  has_priority_support BOOLEAN NOT NULL DEFAULT FALSE,
  has_custom_branding BOOLEAN NOT NULL DEFAULT FALSE,
  has_multi_currency BOOLEAN NOT NULL DEFAULT FALSE,
  has_ai_assistant BOOLEAN NOT NULL DEFAULT FALSE,
  has_loyalty_program BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if they don't exist yet
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS has_admin_analytics BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS has_backup_restore BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed plans (UPSERT pour idempotence)
INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, max_stores, max_users, max_products, has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced, has_admin_analytics, has_backup_restore, sort_order) VALUES
  ('starter', 'Starter', 'Ideal pour demarrer — caisse et stock de base', 0.00, NULL, 1, 2, 500, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 1),
  ('croissance', 'Croissance', 'Pour les boutiques qui grandissent — fournisseurs, rapports, exports', 29.00, 290.00, 3, 10, 5000, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, 2),
  ('enterprise', 'Enterprise', 'Pour les chaines et grossistes — analytics, API, support prioritaire', 79.00, 790.00, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_stores = EXCLUDED.max_stores,
  max_users = EXCLUDED.max_users,
  max_products = EXCLUDED.max_products,
  has_advanced_reports = EXCLUDED.has_advanced_reports,
  has_exports = EXCLUDED.has_exports,
  has_supplier_management = EXCLUDED.has_supplier_management,
  has_offline_advanced = EXCLUDED.has_offline_advanced,
  has_admin_analytics = EXCLUDED.has_admin_analytics,
  has_backup_restore = EXCLUDED.has_backup_restore,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Update enterprise premium features
UPDATE public.plans SET
  has_api_access = TRUE,
  has_priority_support = TRUE,
  has_custom_branding = TRUE,
  has_multi_currency = TRUE,
  has_ai_assistant = TRUE,
  has_loyalty_program = TRUE
WHERE id = 'enterprise';

-- Update croissance with some premium features
UPDATE public.plans SET
  has_custom_branding = TRUE,
  has_multi_currency = TRUE
WHERE id = 'croissance';


-- 1.2 subscriptions — Liens organisation ↔ plan
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'grace_period', 'read_only', 'cancelled', 'expired')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  trial_ends_at TIMESTAMPTZ DEFAULT NULL,
  grace_period_ends_at TIMESTAMPTZ DEFAULT NULL,
  cancelled_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);


-- 1.3 feature_flags — Contrôle d'accès aux fonctionnalités par plan
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  description TEXT,
  allowed_plans TEXT[] NOT NULL DEFAULT '{"starter","croissance","enterprise"}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed feature flags
INSERT INTO public.feature_flags (feature_key, description, allowed_plans) VALUES
  ('pos', 'Acces caisse enregistreuse', '{"starter","croissance","enterprise"}'),
  ('stock_management', 'Gestion du stock', '{"starter","croissance","enterprise"}'),
  ('customer_credit', 'Credit clients', '{"starter","croissance","enterprise"}'),
  ('basic_reports', 'Rapports de base', '{"starter","croissance","enterprise"}'),
  ('advanced_reports', 'Rapports avances et analytics', '{"croissance","enterprise"}'),
  ('exports', 'Exports PDF et Excel', '{"croissance","enterprise"}'),
  ('supplier_management', 'Gestion fournisseurs', '{"croissance","enterprise"}'),
  ('offline_advanced', 'Mode offline avance', '{"croissance","enterprise"}'),
  ('custom_branding', 'Branding personnalise', '{"croissance","enterprise"}'),
  ('multi_currency', 'Multi-devises', '{"croissance","enterprise"}'),
  ('api_access', 'Acces API externe', '{"enterprise"}'),
  ('priority_support', 'Support prioritaire', '{"enterprise"}'),
  ('ai_assistant', 'Assistant IA metier', '{"enterprise"}'),
  ('loyalty_program', 'Programme fidelite', '{"enterprise"}'),
  ('admin_analytics', 'Analytics multi-boutiques admin', '{"enterprise"}'),
  ('backup_restore', 'Sauvegarde et restauration', '{"enterprise"}')
ON CONFLICT (feature_key) DO UPDATE SET
  description = EXCLUDED.description,
  allowed_plans = EXCLUDED.allowed_plans;


-- 1.4 RLS policies pour feature_flags (si pas encore fait)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feature_flags' AND policyname = 'Feature flags are readable by authenticated users'
  ) THEN
    ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Feature flags are readable by authenticated users" ON public.feature_flags
      FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = TRUE);
  END IF;
END;
$$;


-- 1.5 Backfill : créer abonnement starter pour les orgs sans subscription
INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
SELECT id, 'starter', 'active', NOW(), NOW() + INTERVAL '30 days'
FROM public.organizations
WHERE id NOT IN (SELECT organization_id FROM public.subscriptions)
ON CONFLICT (organization_id) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 2 : check_feature_access — Signature : p_feature_key TEXT
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("check_feature_access", { p_feature_key: "exports" })
-- Retour attendu : { allowed: boolean, plan_id: string }[]

SELECT pg_temp.drop_all_signatures('check_feature_access');

CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_feature_key TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  plan_id TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_plan_id TEXT;
  v_allowed_plans TEXT[];
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Get organization's plan
  SELECT s.plan_id INTO v_plan_id
  FROM public.subscriptions s
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Default to starter if no subscription
  IF v_plan_id IS NULL THEN
    v_plan_id := 'starter';
  END IF;

  -- Get feature's allowed plans from feature_flags table
  SELECT allowed_plans INTO v_allowed_plans
  FROM public.feature_flags
  WHERE feature_key = p_feature_key AND is_active = TRUE;

  IF NOT FOUND THEN
    -- Feature not found = not allowed
    RETURN QUERY SELECT FALSE, v_plan_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT (v_plan_id = ANY(v_allowed_plans))::BOOLEAN, v_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_feature_access(TEXT) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 3 : get_admin_stores_summary — Signature : p_period, p_start_date, p_end_date
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("get_admin_stores_summary", { p_period: "month" })
-- Retour attendu : StoreSummary[] (16 champs)

SELECT pg_temp.drop_all_signatures('get_admin_stores_summary');

CREATE OR REPLACE FUNCTION public.get_admin_stores_summary(
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  store_category text,
  owner_name text,
  owner_phone text,
  city text,
  country text,
  total_sales numeric,
  transaction_count bigint,
  avg_basket numeric,
  total_expenses numeric,
  net_revenue numeric,
  product_count bigint,
  active_product_count bigint,
  customer_count bigint,
  low_stock_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  -- Determine date range
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  -- Only super_admin can call this
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acces refuse : reserve au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    o.category::text AS store_category,
    p.owner_name,
    p.phone AS owner_phone,
    p.city,
    p.country,
    COALESCE(s_summary.total_sales, 0) AS total_sales,
    COALESCE(s_summary.transaction_count, 0) AS transaction_count,
    COALESCE(s_summary.avg_basket, 0) AS avg_basket,
    COALESCE(e_summary.total_expenses, 0) AS total_expenses,
    COALESCE(s_summary.total_sales, 0) - COALESCE(e_summary.total_expenses, 0) AS net_revenue,
    COALESCE(prod_summary.product_count, 0) AS product_count,
    COALESCE(prod_summary.active_product_count, 0) AS active_product_count,
    COALESCE(cust_summary.customer_count, 0) AS customer_count,
    COALESCE(prod_summary.low_stock_count, 0) AS low_stock_count
  FROM organizations o
  LEFT JOIN profiles p ON p.organization_id = o.id AND p.user_id = o.owner_user_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(s.total_amount) AS total_sales,
      COUNT(*) AS transaction_count,
      AVG(s.total_amount) AS avg_basket
    FROM sales s
    WHERE s.organization_id = o.id
      AND s.created_at >= v_start
      AND s.created_at < v_end
  ) s_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      SUM(e.amount) AS total_expenses
    FROM expenses e
    WHERE e.organization_id = o.id
      AND e.expense_date >= v_start::date
      AND e.expense_date < v_end::date
  ) e_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS product_count,
      COUNT(*) FILTER (WHERE pr.is_active = true) AS active_product_count,
      COUNT(*) FILTER (WHERE pr.is_active = true AND pr.stock_quantity <= COALESCE(pr.min_stock_alert, 5)) AS low_stock_count
    FROM products pr
    WHERE pr.organization_id = o.id
  ) prod_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS customer_count
    FROM customers c
    WHERE c.organization_id = o.id
  ) cust_summary ON true
  ORDER BY COALESCE(s_summary.total_sales, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stores_summary(text, timestamptz, timestamptz) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 4 : get_admin_article_ranking — Signature : p_organization_id, p_period, p_limit, p_start_date, p_end_date
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("get_admin_article_ranking", { p_period, p_limit, p_organization_id? })
-- Retour attendu : ArticleRanking[] (12 champs + ranking_category "top"/"bad")

SELECT pg_temp.drop_all_signatures('get_admin_article_ranking');

CREATE OR REPLACE FUNCTION public.get_admin_article_ranking(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_limit integer DEFAULT 10,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  product_id uuid,
  product_name text,
  category_name text,
  quantity_sold bigint,
  total_revenue numeric,
  unit_price numeric,
  cost_price numeric,
  margin numeric,
  current_stock integer,
  ranking_category text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acces refuse : reserve au super administrateur';
  END IF;

  -- Top articles (highest revenue)
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    si.product_id,
    si.product_name,
    COALESCE(c.name, 'Sans categorie') AS category_name,
    SUM(si.quantity) AS quantity_sold,
    SUM(si.total_price) AS total_revenue,
    si.unit_price,
    COALESCE(pr.cost_price, 0) AS cost_price,
    si.unit_price - COALESCE(pr.cost_price, 0) AS margin,
    COALESCE(pr.stock_quantity, 0) AS current_stock,
    'top'::text AS ranking_category
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  JOIN organizations o ON o.id = si.organization_id
  LEFT JOIN products pr ON pr.id = si.product_id
  LEFT JOIN categories c ON c.id = pr.category_id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR si.organization_id = p_organization_id)
  GROUP BY o.id, o.name, si.product_id, si.product_name, c.name, si.unit_price, pr.cost_price, pr.stock_quantity
  ORDER BY SUM(si.total_price) DESC
  LIMIT p_limit;

  -- Bad articles (products with zero or lowest sales in period)
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    pr.id AS product_id,
    pr.name AS product_name,
    COALESCE(c.name, 'Sans categorie') AS category_name,
    COALESCE(sold.qty, 0) AS quantity_sold,
    COALESCE(sold.revenue, 0) AS total_revenue,
    pr.price AS unit_price,
    COALESCE(pr.cost_price, 0) AS cost_price,
    pr.price - COALESCE(pr.cost_price, 0) AS margin,
    pr.stock_quantity AS current_stock,
    'bad'::text AS ranking_category
  FROM products pr
  JOIN organizations o ON o.id = pr.organization_id
  LEFT JOIN categories c ON c.id = pr.category_id
  LEFT JOIN LATERAL (
    SELECT SUM(si2.quantity) AS qty, SUM(si2.total_price) AS revenue
    FROM sale_items si2
    JOIN sales s2 ON s2.id = si2.sale_id
    WHERE si2.product_id = pr.id
      AND s2.created_at >= v_start
      AND s2.created_at < v_end
  ) sold ON true
  WHERE pr.is_active = true
    AND (p_organization_id IS NULL OR pr.organization_id = p_organization_id)
  ORDER BY COALESCE(sold.revenue, 0) ASC, pr.stock_quantity DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_article_ranking(uuid, text, integer, timestamptz, timestamptz) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 5 : get_admin_stock_movements — Signature : p_organization_id, p_period, p_limit, p_start_date, p_end_date
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("get_admin_stock_movements", { p_period, p_limit, p_organization_id? })
-- Retour attendu : StockMovement[] (11 champs)

SELECT pg_temp.drop_all_signatures('get_admin_stock_movements');

CREATE OR REPLACE FUNCTION public.get_admin_stock_movements(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_limit integer DEFAULT 50,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  movement_id uuid,
  product_id uuid,
  product_name text,
  movement_type text,
  quantity integer,
  previous_quantity integer,
  new_quantity integer,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acces refuse : reserve au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    sm.id AS movement_id,
    sm.product_id,
    COALESCE(pr.name, 'Produit supprime') AS product_name,
    sm.type AS movement_type,
    sm.quantity,
    sm.previous_quantity,
    sm.new_quantity,
    sm.reason,
    sm.created_at
  FROM stock_movements sm
  JOIN organizations o ON o.id = sm.organization_id
  LEFT JOIN products pr ON pr.id = sm.product_id
  WHERE sm.created_at >= v_start
    AND sm.created_at < v_end
    AND (p_organization_id IS NULL OR sm.organization_id = p_organization_id)
  ORDER BY sm.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stock_movements(uuid, text, integer, timestamptz, timestamptz) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 6 : get_admin_sales_trend — Signature : p_organization_id, p_period, p_start_date, p_end_date
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("get_admin_sales_trend", { p_period, p_organization_id? })
-- Retour attendu : SalesTrend[] (6 champs)

SELECT pg_temp.drop_all_signatures('get_admin_sales_trend');

CREATE OR REPLACE FUNCTION public.get_admin_sales_trend(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  date text,
  organization_id uuid,
  store_name text,
  total_sales numeric,
  transaction_count bigint,
  avg_basket numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acces refuse : reserve au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD') AS date,
    o.id AS organization_id,
    o.name AS store_name,
    SUM(s.total_amount) AS total_sales,
    COUNT(*) AS transaction_count,
    AVG(s.total_amount) AS avg_basket
  FROM sales s
  JOIN organizations o ON o.id = s.organization_id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  GROUP BY date_trunc('day', s.created_at), o.id, o.name
  ORDER BY date_trunc('day', s.created_at) ASC, SUM(s.total_amount) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_sales_trend(uuid, text, timestamptz, timestamptz) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 7 : get_admin_payment_distribution — Signature : p_organization_id, p_period, p_start_date, p_end_date
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("get_admin_payment_distribution", { p_period, p_organization_id? })
-- Retour attendu : PaymentDistribution[] (4 champs)

SELECT pg_temp.drop_all_signatures('get_admin_payment_distribution');

CREATE OR REPLACE FUNCTION public.get_admin_payment_distribution(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  payment_method text,
  total_amount numeric,
  transaction_count bigint,
  percentage numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_total numeric;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acces refuse : reserve au super administrateur';
  END IF;

  -- Get total for percentage calculation
  SELECT COALESCE(SUM(s.total_amount), 0) INTO v_total
  FROM sales s
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id);

  RETURN QUERY
  SELECT
    s.payment_method::text AS payment_method,
    SUM(s.total_amount) AS total_amount,
    COUNT(*) AS transaction_count,
    CASE WHEN v_total > 0 THEN ROUND((SUM(s.total_amount) / v_total) * 100, 1) ELSE 0 END AS percentage
  FROM sales s
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  GROUP BY s.payment_method
  ORDER BY SUM(s.total_amount) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_payment_distribution(uuid, text, timestamptz, timestamptz) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 8 : Vérification finale
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  missing TEXT[] := '{}';
  fn TEXT;
  expected_fns TEXT[] := ARRAY[
    'check_feature_access',
    'get_admin_stores_summary',
    'get_admin_article_ranking',
    'get_admin_stock_movements',
    'get_admin_sales_trend',
    'get_admin_payment_distribution',
    'get_user_organization_id',
    'is_super_admin'
  ];
BEGIN
  FOREACH fn IN ARRAY expected_fns LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = fn AND pronamespace = 'public'::regnamespace
    ) THEN
      missing := array_append(missing, fn);
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE WARNING 'Fonctions toujours manquantes : %', array_to_string(missing, ', ');
  ELSE
    RAISE NOTICE 'Toutes les fonctions RPC sont installees avec succes !';
  END IF;
END;
$$;

-- Recharger le cache PostgREST pour que les nouvelles fonctions soient visibles
NOTIFY pgrst, 'reload schema';

SELECT 'Fix missing RPCs v5 applique avec succes — 6 fonctions restaurees' AS status;
