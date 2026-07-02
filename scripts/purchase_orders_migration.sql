-- ============================================================
-- Supplier Purchase Orders — COMPLETE SETUP (idempotent)
-- Date: 2026-07-02
--
-- This script creates the purchase order system for ordering
-- from suppliers. Includes:
-- - purchase_orders table
-- - purchase_order_items table
-- - RPCs for creating and managing orders
-- - RLS policies
--
-- FIXES:
--   1. CREATE OR REPLACE POLICY → DROP POLICY IF EXISTS + CREATE POLICY
--   2. RLS policies simplified using profiles.role directly
--
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ─── 1. Purchase order status enum ─────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'po_status') THEN
    CREATE TYPE public.po_status AS ENUM (
      'draft',
      'sent',
      'confirmed',
      'partial',
      'received',
      'cancelled'
    );
  END IF;
END $$;

-- ─── 2. purchase_orders table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id          UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  supplier_id       UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  order_number      TEXT NOT NULL,
  status            public.po_status NOT NULL DEFAULT 'draft',
  order_date        DATE NOT NULL DEFAULT current_date,
  expected_delivery DATE,
  received_date     DATE,
  notes             TEXT,
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'GNF',
  created_by        UUID REFERENCES public.profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One order_number per organization
  UNIQUE (organization_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_org ON public.purchase_orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_store ON public.purchase_orders (store_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders (status);

-- ─── 3. purchase_order_items table ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name      TEXT NOT NULL,
  quantity_ordered  INTEGER NOT NULL DEFAULT 0,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  unit_cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total        NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poi_order ON public.purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_product ON public.purchase_order_items (product_id);

-- ─── 4. RLS policies ──────────────────────────────────────────

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- FIX: DROP POLICY IF EXISTS before CREATE (CREATE OR REPLACE POLICY does NOT exist)

-- Select: org members
DROP POLICY IF EXISTS "po_select_org" ON public.purchase_orders;
CREATE POLICY "po_select_org"
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- Insert: admin/manager
DROP POLICY IF EXISTS "po_insert_admin" ON public.purchase_orders;
CREATE POLICY "po_insert_admin"
  ON public.purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin', 'manager')
      AND p.organization_id IS NOT NULL
    )
  );

-- Update: admin/manager
DROP POLICY IF EXISTS "po_update_admin" ON public.purchase_orders;
CREATE POLICY "po_update_admin"
  ON public.purchase_orders FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );

-- Delete: admin only
DROP POLICY IF EXISTS "po_delete_admin" ON public.purchase_orders;
CREATE POLICY "po_delete_admin"
  ON public.purchase_orders FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
    )
  );

-- Items: same as parent order
DROP POLICY IF EXISTS "poi_select_org" ON public.purchase_order_items;
CREATE POLICY "poi_select_org"
  ON public.purchase_order_items FOR SELECT
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      INNER JOIN public.profiles p ON p.organization_id = po.organization_id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "poi_insert_admin" ON public.purchase_order_items;
CREATE POLICY "poi_insert_admin"
  ON public.purchase_order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      INNER JOIN public.profiles p ON p.organization_id = po.organization_id
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "poi_update_admin" ON public.purchase_order_items;
CREATE POLICY "poi_update_admin"
  ON public.purchase_order_items FOR UPDATE
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      INNER JOIN public.profiles p ON p.organization_id = po.organization_id
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "poi_delete_admin" ON public.purchase_order_items;
CREATE POLICY "poi_delete_admin"
  ON public.purchase_order_items FOR DELETE
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      INNER JOIN public.profiles p ON p.organization_id = po.organization_id
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
    )
  );

-- ─── 5. RPC: generate_order_number() ──────────────────────────

CREATE OR REPLACE FUNCTION public.generate_order_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_number TEXT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.purchase_orders
  WHERE organization_id = p_org_id
    AND created_at >= date_trunc('year', now());

  v_number := 'BC-' || to_char(now(), 'YY') || '-' || lpad((v_count + 1)::TEXT, 4, '0');
  RETURN v_number;
END;
$$;

-- ─── 6. RPC: receive_purchase_order() ─────────────────────────
-- When a PO is received, update stock quantities and mark items

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
  v_item RECORD;
  v_product_id UUID;
  v_qty_received INTEGER;
BEGIN
  -- Verify access
  SELECT organization_id INTO v_org_id
  FROM public.purchase_orders WHERE id = p_order_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id = auth.uid() AND p.organization_id = v_org_id
    AND ur.role IN ('admin', 'super_admin', 'manager')
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

      UPDATE public.products
      SET stock_quantity = stock_quantity + v_qty_received,
          updated_at = now()
      WHERE id = v_product_id;

      -- Log stock movement
      INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, organization_id)
      VALUES (v_product_id, 'in', v_qty_received, 'Réception commande fournisseur', v_org_id);
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

-- ─── Done ──────────────────────────────────────────────────────
