-- ════════════════════════════════════════════════════════════════════════════
-- Step 5: Make supplier-related RPCs store-aware
-- ════════════════════════════════════════════════════════════════════════════
-- This script updates get_supplier_stats and get_supplier_with_products
-- to accept an optional p_store_id parameter, filtering results by store.
--
-- IMPORTANT: Run this AFTER step1-4 have been executed successfully.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Update get_supplier_stats to accept p_store_id ───────────────────
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_supplier_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_supplier_stats(p_store_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'totalSuppliers', 0, 'activeSuppliers', 0, 'totalProducts', 0, 'totalSupplyValue', 0
    );
  END IF;

  SELECT jsonb_build_object(
    'totalSuppliers', COUNT(*)::int,
    'activeSuppliers', COUNT(*) FILTER (WHERE is_active)::int,
    'totalProducts', (SELECT COUNT(*)::int FROM supplier_products sp
      WHERE sp.organization_id = v_org_id AND sp.is_active
      AND (p_store_id IS NULL OR sp.store_id = p_store_id)),
    'totalSupplyValue', COALESCE(
      (SELECT SUM(sp.supply_price * sp.min_quantity)
       FROM supplier_products sp
       WHERE sp.organization_id = v_org_id AND sp.is_active
       AND (p_store_id IS NULL OR sp.store_id = p_store_id)),
      0
    )
  ) INTO result
  FROM suppliers
  WHERE organization_id = v_org_id
    AND (p_store_id IS NULL OR store_id = p_store_id);

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_stats(UUID) TO authenticated;


-- ─── 2. Update get_supplier_with_products to accept p_store_id ───────────
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_supplier_with_products' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_supplier_with_products(p_supplier_id UUID, p_store_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  supplier_data JSONB;
  products_data JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get supplier info (scoped to caller's org, optionally to a specific store)
  SELECT to_jsonb(s.*) INTO supplier_data
  FROM suppliers s
  WHERE s.id = p_supplier_id AND s.organization_id = v_org_id
    AND (p_store_id IS NULL OR s.store_id = p_store_id);

  IF supplier_data IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get products for this supplier (optionally filtered by store)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sp.id,
      'product_id', sp.product_id,
      'product_name', p.name,
      'product_barcode', p.barcode,
      'product_unit', p.unit,
      'supply_price', sp.supply_price,
      'min_quantity', sp.min_quantity,
      'current_stock', p.stock_quantity,
      'notes', sp.notes,
      'is_active', sp.is_active
    ) ORDER BY p.name
  ), '[]'::jsonb) INTO products_data
  FROM supplier_products sp
  JOIN products p ON p.id = sp.product_id
  WHERE sp.supplier_id = p_supplier_id
    AND sp.organization_id = v_org_id
    AND (p_store_id IS NULL OR sp.store_id = p_store_id);

  RETURN supplier_data || jsonb_build_object('products', products_data);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_with_products(UUID, UUID) TO authenticated;
