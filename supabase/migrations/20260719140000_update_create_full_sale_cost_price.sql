-- ════════════════════════════════════════════════════════════════
-- Migration: Update create_full_sale to record cost_price snapshot
-- Date: 2026-07-19
-- Objectif: Enregistrer cost_price au moment de la vente (snapshot)
--           pour calculer la marge historique même si le prix d'achat change
-- ════════════════════════════════════════════════════════════════

-- Recréer create_full_sale avec cost_price
-- Le cost_price est récupéré depuis products.cost_price au moment de la vente
CREATE OR REPLACE FUNCTION public.create_full_sale(
  p_sale_number TEXT,
  p_subtotal NUMERIC,
  p_total_amount NUMERIC,
  p_items JSONB,
  p_tax_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash',
  p_amount_paid NUMERIC DEFAULT 0,
  p_change_amount NUMERIC DEFAULT 0,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_new_stock INTEGER;
  v_previous_stock INTEGER;
  v_user_id UUID;
  v_org_id UUID;
  v_product_cost_price NUMERIC;
BEGIN
  v_user_id := auth.uid();
  v_org_id := public.get_user_organization_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable pour l''utilisateur';
  END IF;

  -- 1. Insert sale
  INSERT INTO sales (
    user_id, organization_id, sale_number, subtotal, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, customer_name, customer_phone, seller_name
  ) VALUES (
    v_user_id, v_org_id, p_sale_number, p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method::public.payment_method, p_amount_paid, p_change_amount, p_customer_name, p_customer_phone, p_seller_name
  ) RETURNING id INTO v_sale_id;

  -- 2. Insert sale_items avec cost_price (snapshot depuis products)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Récupérer le cost_price du produit au moment de la vente
    SELECT COALESCE(cost_price, 0) INTO v_product_cost_price
    FROM products
    WHERE id = (v_item->>'product_id')::UUID
      AND organization_id = v_org_id;

    INSERT INTO sale_items (
      sale_id, product_id, product_name, quantity, unit_price, total_price, 
      cost_price, organization_id
    ) VALUES (
      v_sale_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC,
      v_product_cost_price,
      v_org_id
    );
  END LOOP;

  -- 3. Atomically decrement stock with race-condition protection
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE products
    SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID
      AND organization_id = v_org_id
    RETURNING stock_quantity INTO v_new_stock;

    IF v_new_stock < 0 THEN
      RAISE EXCEPTION 'Stock insuffisant pour le produit %', v_item->>'product_name';
    END IF;

    INSERT INTO stock_movements (product_id, organization_id, movement_type, quantity, previous_quantity, new_quantity, reason, user_id)
    VALUES (
      (v_item->>'product_id')::UUID,
      v_org_id,
      'sale',
      -(v_item->>'quantity')::INTEGER,
      v_new_stock + (v_item->>'quantity')::INTEGER,
      v_new_stock,
      'Vente: ' || p_sale_number,
      v_user_id
    );
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_full_sale(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) TO authenticated;

-- Vérification
DO $$
BEGIN
  RAISE NOTICE '✅ create_full_sale mis à jour avec cost_price snapshot';
END $$;
