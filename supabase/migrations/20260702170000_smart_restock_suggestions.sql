-- ============================================================
-- Smart Restock Suggestions — Intelligent purchase order suggestions
-- based on stock levels, sales velocity, and supplier data
-- ============================================================

-- ─── RPC: get_restock_suggestions ────────────────────────────
-- Suggests products to reorder based on:
-- 1. Stock below min_stock_alert
-- 2. Sales velocity (30-day average daily sales)
-- 3. Days of stock remaining
-- 4. Supplier with best supply price
-- Returns items sorted by urgency (days of stock remaining ASC)
CREATE OR REPLACE FUNCTION public.get_restock_suggestions(
  p_store_id UUID DEFAULT NULL,
  p_urgency TEXT DEFAULT 'all'
)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  barcode TEXT,
  category_name TEXT,
  current_stock INTEGER,
  min_stock_alert INTEGER,
  avg_daily_sales NUMERIC,
  days_of_stock_remaining NUMERIC,
  suggested_order_quantity INTEGER,
  best_supplier_id UUID,
  best_supplier_name TEXT,
  best_supply_price NUMERIC,
  total_supply_cost NUMERIC,
  urgency_level TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non associé à une organisation';
  END IF;

  RETURN QUERY
  WITH sales_velocity AS (
    -- Calculate average daily sales per product over last 30 days
    SELECT
      si.product_id,
      COALESCE(SUM(si.quantity), 0) / GREATEST(LEAST(EXTRACT(DAY FROM now() - MIN(s.created_at)), 30), 1) AS avg_daily
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    INNER JOIN public.products p ON p.id = si.product_id
    WHERE s.organization_id = v_org_id
      AND s.created_at >= now() - INTERVAL '30 days'
      AND (p_store_id IS NULL OR p.store_id = p_store_id)
    GROUP BY si.product_id
  ),
  best_supplier AS (
    -- Find the supplier with the lowest supply price for each product
    SELECT DISTINCT ON (sp.product_id)
      sp.product_id,
      sp.supplier_id,
      su.name AS supplier_name,
      sp.supply_price
    FROM public.supplier_products sp
    INNER JOIN public.suppliers su ON su.id = sp.supplier_id
    WHERE su.is_active = true
      AND su.organization_id = v_org_id
      AND sp.is_active = true
    ORDER BY sp.product_id, sp.supply_price ASC
  )
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.barcode,
    c.name AS category_name,
    p.stock_quantity AS current_stock,
    COALESCE(p.min_stock_alert, 5) AS min_stock_alert,
    COALESCE(sv.avg_daily, 0) AS avg_daily_sales,
    CASE
      WHEN sv.avg_daily > 0 THEN p.stock_quantity / sv.avg_daily
      ELSE 999
    END AS days_of_stock_remaining,
    CASE
      WHEN sv.avg_daily > 0 THEN
        GREATEST(
          CEIL((COALESCE(p.min_stock_alert, 5) * 2 + sv.avg_daily * 14) - p.stock_quantity),
          1
        )
      ELSE GREATEST(COALESCE(p.min_stock_alert, 5) - p.stock_quantity, 1)
    END AS suggested_order_quantity,
    bs.supplier_id AS best_supplier_id,
    bs.supplier_name AS best_supplier_name,
    bs.supply_price AS best_supply_price,
    CASE
      WHEN bs.supply_price IS NOT NULL AND sv.avg_daily > 0 THEN
        GREATEST(
          CEIL((COALESCE(p.min_stock_alert, 5) * 2 + sv.avg_daily * 14) - p.stock_quantity),
          1
        ) * bs.supply_price
      ELSE 0
    END AS total_supply_cost,
    CASE
      WHEN p.stock_quantity <= 0 THEN 'critical'
      WHEN p.stock_quantity <= COALESCE(p.min_stock_alert, 5) * 0.5 THEN 'high'
      WHEN p.stock_quantity <= COALESCE(p.min_stock_alert, 5) THEN 'medium'
      ELSE 'low'
    END AS urgency_level
  FROM public.products p
  LEFT JOIN sales_velocity sv ON sv.product_id = p.id
  LEFT JOIN best_supplier bs ON bs.product_id = p.id
  LEFT JOIN public.categories c ON c.id = p.category_id
  WHERE p.organization_id = v_org_id
    AND p.is_active = true
    AND (p_store_id IS NULL OR p.store_id = p_store_id)
    AND (
      p.stock_quantity <= COALESCE(p.min_stock_alert, 5) * 1.5
      OR p.stock_quantity <= 0
    )
    AND (
      p_urgency = 'all'
      OR (p_urgency = 'critical' AND p.stock_quantity <= 0)
      OR (p_urgency = 'high' AND p.stock_quantity <= COALESCE(p.min_stock_alert, 5) * 0.5)
      OR (p_urgency = 'medium' AND p.stock_quantity <= COALESCE(p.min_stock_alert, 5))
    )
  ORDER BY
    CASE
      WHEN p.stock_quantity <= 0 THEN 0
      WHEN p.stock_quantity <= COALESCE(p.min_stock_alert, 5) * 0.5 THEN 1
      WHEN p.stock_quantity <= COALESCE(p.min_stock_alert, 5) THEN 2
      ELSE 3
    END,
    days_of_stock_remaining ASC;
END;
$$;

-- ─── RPC: create_purchase_order_from_suggestions ─────────────
-- Creates a purchase order from suggested restock items
CREATE OR REPLACE FUNCTION public.create_purchase_order_from_suggestions(
  p_supplier_id UUID,
  p_items JSONB,
  p_store_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_subtotal NUMERIC := 0;
  v_tax_rate NUMERIC := 0;
  v_tax_amount NUMERIC := 0;
  v_line_total NUMERIC;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non associé à une organisation';
  END IF;

  -- Verify supplier belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = v_org_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Fournisseur invalide ou inactif';
  END IF;

  -- Generate order number
  v_order_number := public.generate_order_number();

  -- Calculate subtotal first
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_total := (v_item->>'quantity')::INTEGER * COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  -- Get org tax rate
  SELECT COALESCE(default_tax_rate, 0) INTO v_tax_rate
  FROM public.organizations WHERE id = v_org_id;

  v_tax_amount := v_subtotal * (v_tax_rate / 100);

  -- Create order
  INSERT INTO public.purchase_orders (
    organization_id, store_id, supplier_id, order_number,
    status, notes, subtotal, tax_amount, total_amount,
    currency, created_by
  ) VALUES (
    v_org_id, p_store_id, p_supplier_id, v_order_number,
    'pending', p_notes, v_subtotal, v_tax_amount,
    v_subtotal + v_tax_amount, 'GNF', auth.uid()
  ) RETURNING id INTO v_order_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_total := (v_item->>'quantity')::INTEGER * COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
    INSERT INTO public.purchase_order_items (
      purchase_order_id, product_id, product_name,
      quantity_ordered, unit_cost, tax_rate, line_total, notes
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
      v_tax_rate,
      v_line_total,
      v_item->>'notes'
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

-- ─── RPC: get_supplier_order_history ─────────────────────────
-- Returns order history for a specific supplier (for analytics)
CREATE OR REPLACE FUNCTION public.get_supplier_order_history(
  p_supplier_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  order_number TEXT,
  status TEXT,
  order_date TEXT,
  total_amount NUMERIC,
  item_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
  SELECT
    po.id,
    po.order_number,
    po.status,
    to_char(po.order_date, 'YYYY-MM-DD') AS order_date,
    po.total_amount,
    COUNT(poi.id)::BIGINT AS item_count
  FROM public.purchase_orders po
  LEFT JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
  WHERE po.organization_id = v_org_id
    AND po.supplier_id = p_supplier_id
  GROUP BY po.id
  ORDER BY po.created_at DESC
  LIMIT p_limit;
END;
$$;
