-- ============================================================
-- Multi-Store Support — COMPLETE SETUP (idempotent)
-- Date: 2026-07-02
--
-- This script creates the multi-store system within organizations.
-- Each organization can have multiple stores (limited by plan).
-- All data tables get a store_id FK for per-store scoping.
--
-- FIXES from original:
--   1. CREATE OR REPLACE POLICY → DROP POLICY IF EXISTS + CREATE POLICY
--   2. v_plan RECORD → v_plan_id TEXT in check_plan_limit
--   3. RLS policies simplified for reliability
--
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ─── 1. Create stores table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  address     TEXT,
  city        TEXT,
  country     TEXT DEFAULT 'GN',
  currency    TEXT DEFAULT 'GNF',
  phone       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_headquarters BOOLEAN NOT NULL DEFAULT false,
  category    public.store_category DEFAULT 'autre',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One slug per organization
  UNIQUE (organization_id, slug)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_stores_organization_id ON public.stores (organization_id);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON public.stores (organization_id, slug);

-- ─── 2. Auto-create a "Main" store for each existing organization ──

INSERT INTO public.stores (organization_id, name, slug, is_headquarters, category, country, currency)
SELECT
  o.id,
  COALESCE(o.name, 'Boutique principale'),
  'principal',
  true,
  COALESCE(o.category, 'autre'),
  COALESCE(o.country, 'GN'),
  COALESCE(o.currency, 'GNF')
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.stores s WHERE s.organization_id = o.id
)
ON CONFLICT DO NOTHING;

-- ─── 3. Add store_id to all data tables ─────────────────────────

-- Products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.products ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: set store_id to the organization's main store
UPDATE public.products p
SET store_id = s.id
FROM public.stores s
WHERE p.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND p.store_id IS NULL;

-- Sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.sales ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.sales sl
SET store_id = s.id
FROM public.stores s
WHERE sl.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND sl.store_id IS NULL;

-- Sale items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.sale_items ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.sale_items si
SET store_id = s.id
FROM public.stores s
WHERE si.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND si.store_id IS NULL;

-- Expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.expenses ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.expenses e
SET store_id = s.id
FROM public.stores s
WHERE e.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND e.store_id IS NULL;

-- Categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.categories ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.categories c
SET store_id = s.id
FROM public.stores s
WHERE c.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND c.store_id IS NULL;

-- Customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.customers cu
SET store_id = s.id
FROM public.stores s
WHERE cu.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND cu.store_id IS NULL;

-- Stock movements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.stock_movements ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.stock_movements sm
SET store_id = s.id
FROM public.stores s
WHERE sm.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND sm.store_id IS NULL;

-- Suppliers (shared across stores within an org, but can be store-specific)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Suppliers stay org-level (store_id stays NULL = available to all stores)

-- ─── 4. Add current_store_id to profiles ───────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'current_store_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN current_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: set current_store_id to the org's main store
UPDATE public.profiles p
SET current_store_id = s.id
FROM public.stores s
WHERE p.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND p.current_store_id IS NULL;

-- ─── 5. Indexes for store_id on data tables ────────────────────

CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products (store_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON public.sales (store_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_store_id ON public.sale_items (store_id);
CREATE INDEX IF NOT EXISTS idx_expenses_store_id ON public.expenses (store_id);
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON public.categories (store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers (store_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id ON public.stock_movements (store_id);
CREATE INDEX IF NOT EXISTS idx_profiles_current_store_id ON public.profiles (current_store_id);

-- ─── 6. Updated trigger: auto-create store for new organizations ─

CREATE OR REPLACE FUNCTION public.handle_new_organization_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stores (organization_id, name, slug, is_headquarters, category, country, currency)
  VALUES (
    NEW.id,
    COALESCE(NEW.name, 'Boutique principale'),
    'principal',
    true,
    COALESCE(NEW.category, 'autre'),
    COALESCE(NEW.country, 'GN'),
    COALESCE(NEW.currency, 'GNF')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization_store();

-- ─── 7. RLS policies for stores ────────────────────────────────

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- FIX: DROP POLICY IF EXISTS before CREATE (CREATE OR REPLACE POLICY does NOT exist)

-- Users can see stores in their organization
DROP POLICY IF EXISTS "stores_select_org_member" ON public.stores;
CREATE POLICY "stores_select_org_member"
  ON public.stores FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
  );

-- Admins/managers can insert stores (subject to plan limits)
DROP POLICY IF EXISTS "stores_insert_admin" ON public.stores;
CREATE POLICY "stores_insert_admin"
  ON public.stores FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );

-- Admins/managers can update stores
DROP POLICY IF EXISTS "stores_update_admin" ON public.stores;
CREATE POLICY "stores_update_admin"
  ON public.stores FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );

-- Only super_admin can delete stores
DROP POLICY IF EXISTS "stores_delete_super_admin" ON public.stores;
CREATE POLICY "stores_delete_super_admin"
  ON public.stores FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid()
      AND ur.role = 'super_admin'
    )
  );

-- ─── 8. RPC: get_organization_stores() ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_organization_stores()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  currency TEXT,
  phone TEXT,
  is_active BOOLEAN,
  is_headquarters BOOLEAN,
  category public.store_category,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  product_count BIGINT,
  sales_this_month NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Get the caller's organization
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.slug,
    s.address,
    s.city,
    s.country,
    s.currency,
    s.phone,
    s.is_active,
    s.is_headquarters,
    s.category,
    s.metadata,
    s.created_at,
    s.updated_at,
    COALESCE(pcnt.cnt, 0) AS product_count,
    COALESCE(sales.total, 0) AS sales_this_month
  FROM public.stores s
  LEFT JOIN (SELECT store_id, COUNT(*) AS cnt FROM public.products WHERE store_id IS NOT NULL GROUP BY store_id) pcnt ON pcnt.store_id = s.id
  LEFT JOIN (
    SELECT store_id, SUM(total_amount) AS total
    FROM public.sales
    WHERE store_id IS NOT NULL
      AND created_at >= date_trunc('month', now())
    GROUP BY store_id
  ) sales ON sales.store_id = s.id
  WHERE s.organization_id = v_org_id
  ORDER BY s.is_headquarters DESC, s.name;
END;
$$;

-- ─── 9. RPC: set_current_store(p_store_id) ─────────────────────

CREATE OR REPLACE FUNCTION public.set_current_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Verify the store belongs to the user's organization
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  -- Verify store belongs to same org
  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Store does not belong to your organization';
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET current_store_id = p_store_id,
      updated_at = now()
  WHERE user_id = auth.uid();

  RETURN true;
END;
$$;

-- ─── 10. Update check_plan_limit to count stores ───────────────

-- FIX: Use v_plan_id TEXT instead of v_plan RECORD (avoids syntax error)
CREATE OR REPLACE FUNCTION public.check_plan_limit(p_limit_type TEXT)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count BIGINT,
  limit_value BIGINT,
  plan_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_plan_id TEXT;
  v_count BIGINT;
  v_limit BIGINT;
  v_allowed BOOLEAN;
BEGIN
  -- Get org
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN QUERY SELECT false, 0::BIGINT, 0::BIGINT, ''::TEXT;
    RETURN;
  END IF;

  -- Get plan
  SELECT plan_id INTO v_plan_id
  FROM public.subscriptions
  WHERE organization_id = v_org_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_plan_id IS NULL THEN
    -- Default to starter
    v_plan_id := 'starter';
  END IF;

  -- Get limit from plans table
  EXECUTE format('SELECT %I FROM public.plans WHERE id = $1', p_limit_type)
  INTO v_limit
  USING v_plan_id;

  -- Get current count
  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_count FROM public.stores WHERE organization_id = v_org_id AND is_active = true;
    WHEN 'users' THEN
      SELECT COUNT(*) INTO v_count FROM public.profiles WHERE organization_id = v_org_id AND is_active = true;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_count FROM public.products WHERE organization_id = v_org_id AND is_active = true;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_count FROM public.sales
      WHERE organization_id = v_org_id
        AND created_at >= date_trunc('month', now());
    ELSE
      v_count := 0;
  END CASE;

  -- NULL limit = unlimited
  v_allowed := (v_limit IS NULL) OR (v_count < v_limit);

  RETURN QUERY SELECT v_allowed, v_count, v_limit, v_plan_id;
END;
$$;

-- ─── 11. RPC: get_store_stats(p_store_id) ──────────────────────

CREATE OR REPLACE FUNCTION public.get_store_stats(p_store_id UUID)
RETURNS TABLE (
  product_count BIGINT,
  active_product_count BIGINT,
  low_stock_count BIGINT,
  sales_today NUMERIC,
  sales_this_month NUMERIC,
  expenses_this_month NUMERIC,
  customer_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  -- Verify store belongs to user's org
  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Store not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(pcnt.total, 0),
    COALESCE(pcnt.active, 0),
    COALESCE(pcnt.low, 0),
    COALESCE(sales_today.total, 0),
    COALESCE(sales_month.total, 0),
    COALESCE(expenses_month.total, 0),
    COALESCE(cust.cnt, 0)
  FROM (SELECT 1) AS dummy
  LEFT JOIN (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_active = true) AS active,
      COUNT(*) FILTER (WHERE stock_quantity <= low_stock_threshold AND is_active = true) AS low
    FROM public.products WHERE store_id = p_store_id
  ) pcnt ON true
  LEFT JOIN (
    SELECT COALESCE(SUM(total_amount), 0) AS total
    FROM public.sales
    WHERE store_id = p_store_id AND created_at >= date_trunc('day', now())
  ) sales_today ON true
  LEFT JOIN (
    SELECT COALESCE(SUM(total_amount), 0) AS total
    FROM public.sales
    WHERE store_id = p_store_id AND created_at >= date_trunc('month', now())
  ) sales_month ON true
  LEFT JOIN (
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM public.expenses
    WHERE store_id = p_store_id AND expense_date >= date_trunc('month', now())
  ) expenses_month ON true
  LEFT JOIN (
    SELECT COUNT(*) AS cnt FROM public.customers WHERE store_id = p_store_id
  ) cust ON true;
END;
$$;

-- ─── Done ──────────────────────────────────────────────────────
