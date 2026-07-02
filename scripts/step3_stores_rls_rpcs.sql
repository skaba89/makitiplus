-- ============================================================
-- Multi-Store — ÉTAPE 3: RLS policies + RPCs
-- Exécuter en TROISIÈME (après les étapes 1 et 2)
--
-- IMPORTANT: Les rôles sont dans user_roles(user_id, role)
-- PAS dans profiles.role (cette colonne n'existe pas)
-- ============================================================

-- RLS policies pour stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Select: tous les membres de l'organisation
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

-- Insert: admin/manager (via user_roles)
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

-- Update: admin/manager (via user_roles)
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

-- Delete: super_admin uniquement (via user_roles)
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

-- RPC: get_organization_stores()
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

-- RPC: set_current_store()
CREATE OR REPLACE FUNCTION public.set_current_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Store does not belong to your organization';
  END IF;

  UPDATE public.profiles
  SET current_store_id = p_store_id,
      updated_at = now()
  WHERE user_id = auth.uid();

  RETURN true;
END;
$$;

-- RPC: check_plan_limit() — mise à jour pour compter les stores
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
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN QUERY SELECT false, 0::BIGINT, 0::BIGINT, ''::TEXT;
    RETURN;
  END IF;

  SELECT plan_id INTO v_plan_id
  FROM public.subscriptions
  WHERE organization_id = v_org_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_plan_id IS NULL THEN
    v_plan_id := 'starter';
  END IF;

  EXECUTE format('SELECT %I FROM public.plans WHERE id = $1', p_limit_type)
  INTO v_limit
  USING v_plan_id;

  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_count FROM public.stores WHERE organization_id = v_org_id AND is_active = true;
    WHEN 'users' THEN
      SELECT COUNT(*) INTO v_count FROM public.profiles WHERE organization_id = v_org_id;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_count FROM public.products WHERE organization_id = v_org_id AND is_active = true;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_count FROM public.sales
      WHERE organization_id = v_org_id
        AND created_at >= date_trunc('month', now());
    ELSE
      v_count := 0;
  END CASE;

  v_allowed := (v_limit IS NULL) OR (v_count < v_limit);

  RETURN QUERY SELECT v_allowed, v_count, v_limit, v_plan_id;
END;
$$;

-- RPC: get_store_stats()
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
