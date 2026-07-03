-- ============================================================
-- P0 HOTFIX — Fix all critical SQL migration issues
-- Date: 2026-07-03
--
-- This migration fixes:
-- 1. CREATE OR REPLACE POLICY → DROP + CREATE POLICY
-- 2. profile_roles → user_roles in all policies & RPCs
-- 3. check_plan_limit: proper column mapping (stores→max_stores, etc.)
-- 4. get_store_stats: low_stock_threshold → min_stock_alert
-- 5. receive_purchase_order: stock_movements fields (movement_type→type, add missing NOT NULL cols)
-- 6. Missing GRANT EXECUTE on get_store_stats, receive_purchase_order
--
-- All changes are idempotent and safe to run on an existing DB.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. FIX: stores RLS policies — DROP + CREATE, use user_roles
-- ════════════════════════════════════════════════════════════════

-- Drop old policies
DROP POLICY IF EXISTS "stores_select_org_member" ON public.stores;
DROP POLICY IF EXISTS "stores_insert_admin" ON public.stores;
DROP POLICY IF EXISTS "stores_update_admin" ON public.stores;
DROP POLICY IF EXISTS "stores_delete_super_admin" ON public.stores;

-- Recreate with user_roles instead of profile_roles
CREATE POLICY "stores_select_org_member"
  ON public.stores FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

CREATE POLICY "stores_insert_admin"
  ON public.stores FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

CREATE POLICY "stores_update_admin"
  ON public.stores FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

CREATE POLICY "stores_delete_super_admin"
  ON public.stores FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role = 'super_admin'
      )
    )
  );


-- ════════════════════════════════════════════════════════════════
-- 2. FIX: purchase_orders RLS policies — DROP + CREATE, use user_roles
-- ════════════════════════════════════════════════════════════════

-- Drop old policies
DROP POLICY IF EXISTS "po_select_org" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_insert_admin" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_update_admin" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_delete_admin" ON public.purchase_orders;
DROP POLICY IF EXISTS "poi_select_org" ON public.purchase_order_items;
DROP POLICY IF EXISTS "poi_insert_admin" ON public.purchase_order_items;
DROP POLICY IF EXISTS "poi_update_admin" ON public.purchase_order_items;
DROP POLICY IF EXISTS "poi_delete_admin" ON public.purchase_order_items;

-- Recreate with user_roles
CREATE POLICY "po_select_org"
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

CREATE POLICY "po_insert_admin"
  ON public.purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

CREATE POLICY "po_update_admin"
  ON public.purchase_orders FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

CREATE POLICY "po_delete_admin"
  ON public.purchase_orders FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin')
      )
    )
  );

-- Items: same role check via parent order's organization
CREATE POLICY "poi_select_org"
  ON public.purchase_order_items FOR SELECT
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
      )
    )
  );

CREATE POLICY "poi_insert_admin"
  ON public.purchase_order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin', 'super_admin', 'manager')
        )
      )
    )
  );

CREATE POLICY "poi_update_admin"
  ON public.purchase_order_items FOR UPDATE
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin', 'super_admin', 'manager')
        )
      )
    )
  );

CREATE POLICY "poi_delete_admin"
  ON public.purchase_order_items FOR DELETE
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin', 'super_admin')
        )
      )
    )
  );


-- ════════════════════════════════════════════════════════════════
-- 3. FIX: check_plan_limit — proper column mapping
-- ════════════════════════════════════════════════════════════════
-- The multi-store migration overwrote this function with a broken
-- version that used dynamic SQL with raw limit_type as column name.
-- We must DROP first because the return type changed from INTEGER to BIGINT.

DROP FUNCTION IF EXISTS public.check_plan_limit(TEXT);

CREATE FUNCTION public.check_plan_limit(
  p_limit_type TEXT -- 'stores', 'users', 'products', 'sales_this_month'
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

  -- Get active subscription with plan details
  SELECT s.plan_id, p.max_stores, p.max_users, p.max_products, p.max_sales_per_month
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no subscription, default to starter limits
  IF NOT FOUND THEN
    SELECT 'starter'::text AS plan_id, max_stores, max_users, max_products, max_sales_per_month
    INTO v_sub
    FROM public.plans WHERE id = 'starter';
  END IF;

  -- Calculate current count + get limit based on limit type
  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
      v_limit := v_sub.max_stores;
    WHEN 'users' THEN
      SELECT COUNT(DISTINCT ur.user_id) INTO v_current
      FROM public.user_roles ur
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

  -- NULL limit means unlimited
  RETURN QUERY SELECT
    (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
    v_current,
    v_limit,
    v_sub.plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 4. FIX: get_store_stats — low_stock_threshold → min_stock_alert
-- ════════════════════════════════════════════════════════════════

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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

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
      COUNT(*) FILTER (
        WHERE stock_quantity <= COALESCE(min_stock_alert, 5)
        AND is_active = true
      ) AS low
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

GRANT EXECUTE ON FUNCTION public.get_store_stats(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 5. FIX: receive_purchase_order — stock_movements fields
-- ════════════════════════════════════════════════════════════════
-- Fixes:
-- - movement_type → type (correct column name)
-- - Added missing NOT NULL columns: user_id, previous_quantity, new_quantity
-- - profile_roles → user_roles for access check
-- - Added store_id to stock_movements

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id UUID,
  p_items JSONB -- [{"id": "item_uuid", "quantity_received": 5}, ...]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_store_id UUID;
  v_item RECORD;
  v_product_id UUID;
  v_qty_received INTEGER;
  v_previous_qty INTEGER;
  v_new_qty INTEGER;
BEGIN
  -- Verify access
  SELECT organization_id, store_id INTO v_org_id, v_store_id
  FROM public.purchase_orders WHERE id = p_order_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Verify org membership
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Update each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) AS item
  LOOP
    UPDATE public.purchase_order_items
    SET quantity_received = (v_item->>'quantity_received')::INTEGER
    WHERE id = (v_item->>'id')::UUID;

    -- Update product stock if product is linked
    SELECT product_id INTO v_product_id
    FROM public.purchase_order_items
    WHERE id = (v_item->>'id')::UUID;

    IF v_product_id IS NOT NULL THEN
      v_qty_received := (v_item->>'quantity_received')::INTEGER;

      -- Get previous quantity for stock_movements
      SELECT stock_quantity INTO v_previous_qty
      FROM public.products
      WHERE id = v_product_id
      FOR UPDATE;

      -- Update product stock
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_qty_received,
          updated_at = now()
      WHERE id = v_product_id
      RETURNING stock_quantity INTO v_new_qty;

      -- Log stock movement with correct column names and all required fields
      INSERT INTO public.stock_movements (
        product_id,
        type,
        quantity,
        previous_quantity,
        new_quantity,
        reason,
        user_id,
        organization_id,
        store_id
      ) VALUES (
        v_product_id,
        'restock',
        v_qty_received,
        v_previous_qty,
        v_new_qty,
        'Réception commande fournisseur',
        auth.uid(),
        v_org_id,
        v_store_id
      );
    END IF;
  END LOOP;

  -- Update order status
  UPDATE public.purchase_orders
  SET status = 'received',
      received_date = current_date,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order(UUID, JSONB) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 6. FIX: get_organization_stores — use user_roles instead of profile_roles
-- ════════════════════════════════════════════════════════════════

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
  v_org_id := public.get_user_organization_id();

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


-- ════════════════════════════════════════════════════════════════
-- 7. FIX: set_current_store — use get_user_organization_id()
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_current_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

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


-- ════════════════════════════════════════════════════════════════
-- 8. FIX: batch_update_stock — add missing organization_id
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.batch_update_stock(
  p_updates JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_update RECORD;
  v_org_id UUID;
  v_previous_qty INTEGER;
  v_new_qty INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates) AS u
  LOOP
    SELECT stock_quantity INTO v_previous_qty
    FROM public.products
    WHERE id = (v_update->>'product_id')::UUID
    FOR UPDATE;

    UPDATE public.products
    SET stock_quantity = (v_update->>'new_quantity')::INTEGER,
        updated_at = now()
    WHERE id = (v_update->>'product_id')::UUID
    RETURNING stock_quantity INTO v_new_qty;

    INSERT INTO public.stock_movements (
      user_id, product_id, type, quantity,
      previous_quantity, new_quantity,
      reason, reference_id, organization_id
    ) VALUES (
      auth.uid(),
      (v_update->>'product_id')::UUID,
      'adjustment',
      (v_update->>'new_quantity')::INTEGER - v_previous_qty,
      v_previous_qty,
      v_new_qty,
      COALESCE(v_update->>'reason', 'Ajustement manuel'),
      NULL,
      v_org_id
    );
  END LOOP;

  RETURN true;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- Done — All P0 issues fixed
-- ════════════════════════════════════════════════════════════════
