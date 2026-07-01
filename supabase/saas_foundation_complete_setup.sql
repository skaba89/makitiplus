-- ============================================================
-- SaaS Foundation — COMPLETE SETUP (idempotent)
-- Date: 2026-07-02
--
-- This script creates the ENTIRE SaaS billing and quota system
- from scratch. It is safe to run even if no tables exist yet.
--
- Run this in the Supabase SQL Editor.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. plans — Plan definitions with limits (NULL = unlimited)
-- ════════════════════════════════════════════════════════════════
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

-- If the table was created with NOT NULL columns, fix them
DO $$
BEGIN
  -- Try to drop NOT NULL constraints if they exist (ignore errors if already nullable)
  BEGIN ALTER TABLE public.plans ALTER COLUMN max_stores DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.plans ALTER COLUMN max_users DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.plans ALTER COLUMN max_products DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.plans ALTER COLUMN max_stores SET DEFAULT NULL; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.plans ALTER COLUMN max_users SET DEFAULT NULL; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.plans ALTER COLUMN max_products SET DEFAULT NULL; EXCEPTION WHEN others THEN NULL; END;
END $$;

-- Seed plans (upsert)
INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, max_stores, max_users, max_products, has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced, sort_order) VALUES
  ('starter', 'Starter', 'Idéal pour démarrer — caisse et stock de base', 0.00, NULL, 1, 2, 500, FALSE, FALSE, FALSE, FALSE, 1),
  ('croissance', 'Croissance', 'Pour les boutiques qui grandissent — fournisseurs, rapports, exports', 29.00, 290.00, 3, 10, 5000, TRUE, TRUE, TRUE, TRUE, 2),
  ('enterprise', 'Enterprise', 'Pour les chaînes et grossistes — analytics, API, support prioritaire', 79.00, 790.00, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, 3)
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
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Set premium features
UPDATE public.plans SET
  has_api_access = TRUE,
  has_priority_support = TRUE,
  has_custom_branding = TRUE,
  has_multi_currency = TRUE,
  has_ai_assistant = TRUE,
  has_loyalty_program = TRUE
WHERE id = 'enterprise';

UPDATE public.plans SET
  has_custom_branding = TRUE,
  has_multi_currency = TRUE
WHERE id = 'croissance';


-- ════════════════════════════════════════════════════════════════
-- 2. subscriptions — Organization plan subscriptions
-- ════════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════════
-- 3. subscription_events — Audit trail for plan changes
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'upgraded', 'downgraded', 'renewed', 'cancelled',
    'expired', 'grace_period_started', 'read_only_started',
    'trial_started', 'trial_ended', 'payment_received', 'payment_failed'
  )),
  from_plan TEXT DEFAULT NULL,
  to_plan TEXT DEFAULT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_org ON public.subscription_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON public.subscription_events(event_type);


-- ════════════════════════════════════════════════════════════════
-- 4. usage_counters — Current usage per organization
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  counter_type TEXT NOT NULL CHECK (counter_type IN (
    'stores', 'users', 'products', 'sales_this_month', 'exports_this_month'
  )),
  current_count INTEGER NOT NULL DEFAULT 0,
  limit_value INTEGER DEFAULT NULL,
  period_start TIMESTAMPTZ DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, counter_type)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_org ON public.usage_counters(organization_id);


-- ════════════════════════════════════════════════════════════════
-- 5. feature_flags — Per-plan feature access control
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  description TEXT,
  allowed_plans TEXT[] NOT NULL DEFAULT '{"starter","croissance","enterprise"}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.feature_flags (feature_key, description, allowed_plans) VALUES
  ('pos', 'Accès caisse enregistreuse', '{"starter","croissance","enterprise"}'),
  ('stock_management', 'Gestion du stock', '{"starter","croissance","enterprise"}'),
  ('customer_credit', 'Crédit clients', '{"starter","croissance","enterprise"}'),
  ('basic_reports', 'Rapports de base', '{"starter","croissance","enterprise"}'),
  ('advanced_reports', 'Rapports avancés et analytics', '{"croissance","enterprise"}'),
  ('exports', 'Exports PDF et Excel', '{"croissance","enterprise"}'),
  ('supplier_management', 'Gestion fournisseurs', '{"croissance","enterprise"}'),
  ('offline_advanced', 'Mode offline avancé', '{"croissance","enterprise"}'),
  ('custom_branding', 'Branding personnalisé', '{"croissance","enterprise"}'),
  ('multi_currency', 'Multi-devises', '{"croissance","enterprise"}'),
  ('api_access', 'Accès API externe', '{"enterprise"}'),
  ('priority_support', 'Support prioritaire', '{"enterprise"}'),
  ('ai_assistant', 'Assistant IA métier', '{"enterprise"}'),
  ('loyalty_program', 'Programme fidélité', '{"enterprise"}'),
  ('admin_analytics', 'Analytics multi-boutiques admin', '{"enterprise"}'),
  ('backup_restore', 'Sauvegarde et restauration', '{"enterprise"}')
ON CONFLICT (feature_key) DO UPDATE SET
  description = EXCLUDED.description,
  allowed_plans = EXCLUDED.allowed_plans;


-- ════════════════════════════════════════════════════════════════
-- 6. RPC: get_organization_subscription
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_organization_subscription()
RETURNS TABLE (
  subscription_id UUID,
  plan_id TEXT,
  plan_name TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  max_stores INTEGER,
  max_users INTEGER,
  max_products INTEGER,
  max_sales_per_month INTEGER,
  has_advanced_reports BOOLEAN,
  has_exports BOOLEAN,
  has_supplier_management BOOLEAN,
  has_offline_advanced BOOLEAN,
  has_api_access BOOLEAN,
  has_priority_support BOOLEAN,
  has_custom_branding BOOLEAN,
  has_multi_currency BOOLEAN,
  has_ai_assistant BOOLEAN,
  has_loyalty_program BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  RETURN QUERY
  SELECT
    s.id AS subscription_id,
    s.plan_id,
    p.name AS plan_name,
    s.status,
    s.current_period_end,
    s.trial_ends_at,
    s.grace_period_ends_at,
    p.max_stores,
    p.max_users,
    p.max_products,
    p.max_sales_per_month,
    p.has_advanced_reports,
    p.has_exports,
    p.has_supplier_management,
    p.has_offline_advanced,
    p.has_api_access,
    p.has_priority_support,
    p.has_custom_branding,
    p.has_multi_currency,
    p.has_ai_assistant,
    p.has_loyalty_program
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_subscription() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 7. RPC: check_plan_limit
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_limit_type TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  limit_value INTEGER,
  plan_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_sub record;
  v_current INTEGER;
  v_limit INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  SELECT * INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_sub FROM public.plans WHERE id = 'starter';
  END IF;

  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
      v_limit := v_sub.max_stores;
    WHEN 'users' THEN
      SELECT COUNT(*) INTO v_current FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE p.organization_id = v_org_id;
      v_limit := v_sub.max_users;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id;
      v_limit := v_sub.max_products;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_current FROM public.sales
      WHERE organization_id = v_org_id
        AND created_at >= date_trunc('month', NOW());
      v_limit := v_sub.max_sales_per_month;
    ELSE
      RAISE EXCEPTION 'Type de limite inconnu : %', p_limit_type;
  END CASE;

  RETURN QUERY SELECT
    (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
    v_current,
    v_limit,
    v_sub.plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 8. RPC: check_feature_access
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_feature_key TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  plan_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

  SELECT s.plan_id INTO v_plan_id
  FROM public.subscriptions s
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    v_plan_id := 'starter';
  END IF;

  SELECT allowed_plans INTO v_allowed_plans
  FROM public.feature_flags
  WHERE feature_key = p_feature_key AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, v_plan_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT (v_plan_id = ANY(v_allowed_plans))::BOOLEAN, v_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_feature_access(TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 9. RPC: get_plans — Public pricing page
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_plans()
RETURNS SETOF public.plans
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.plans WHERE is_active = TRUE ORDER BY sort_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_plans() TO authenticated, anon;


-- ════════════════════════════════════════════════════════════════
-- 10. Auto-create starter subscription for new organizations
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auto_create_starter_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
  VALUES (
    NEW.id,
    'starter',
    'active',
    NOW(),
    NOW() + INTERVAL '30 days'
  )
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_subscription ON public.organizations;

CREATE TRIGGER trigger_auto_create_subscription
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_starter_subscription();


-- ════════════════════════════════════════════════════════════════
-- 11. RLS Policies (idempotent)
-- ════════════════════════════════════════════════════════════════

-- plans: publicly readable
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Plans are publicly readable" ON public.plans;
CREATE POLICY "Plans are publicly readable" ON public.plans FOR SELECT USING (TRUE);

-- subscriptions: org members only
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own org subscription" ON public.subscriptions;
CREATE POLICY "Users can read own org subscription" ON public.subscriptions
  FOR SELECT USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- subscription_events: org members only
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own org events" ON public.subscription_events;
CREATE POLICY "Users can read own org events" ON public.subscription_events
  FOR SELECT USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- usage_counters: org members only
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own org usage" ON public.usage_counters;
CREATE POLICY "Users can read own org usage" ON public.usage_counters
  FOR SELECT USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- feature_flags: authenticated users
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Feature flags are readable by authenticated users" ON public.feature_flags;
CREATE POLICY "Feature flags are readable by authenticated users" ON public.feature_flags
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = TRUE);


-- ════════════════════════════════════════════════════════════════
-- 12. Backfill existing organizations with starter subscriptions
-- ════════════════════════════════════════════════════════════════
INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
SELECT id, 'starter', 'active', NOW(), NOW() + INTERVAL '30 days'
FROM public.organizations
WHERE id NOT IN (SELECT organization_id FROM public.subscriptions)
ON CONFLICT (organization_id) DO NOTHING;
