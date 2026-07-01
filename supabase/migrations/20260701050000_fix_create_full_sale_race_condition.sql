-- Migration: Fix create_full_sale TOCTOU race condition (oversell with concurrent vendeurs)
-- Date: 2026-07-01
-- PROBLEM: Pre-check SELECT + GREATEST(stock_quantity - X, 0) allows oversell when
--          multiple vendeurs sell simultaneously. The pre-check reads stock, then
--          another transaction modifies it, then the UPDATE uses GREATEST which
--          silently clamps to 0 instead of raising an error.
-- FIX: Replace pre-check + GREATEST with atomic UPDATE...RETURNING + exception check.
--       This eliminates the TOCTOU race condition entirely.
-- IDEMPOTENT: Uses dynamic DROP via pg_proc to avoid signature mismatch errors.

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'create_full_sale'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_full_sale(
  p_user_id UUID,
  p_organization_id UUID,
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
BEGIN
  -- 1. Insert sale
  INSERT INTO sales (
    user_id, organization_id, sale_number, subtotal, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, customer_name, customer_phone, seller_name
  ) VALUES (
    p_user_id, p_organization_id, p_sale_number, p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method, p_amount_paid, p_change_amount, p_customer_name, p_customer_phone, p_seller_name
  ) RETURNING id INTO v_sale_id;

  -- 2. Insert sale items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (
      sale_id, product_id, product_name, quantity, unit_price, total_price, organization_id
    ) VALUES (
      v_sale_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC,
      p_organization_id
    );
  END LOOP;

  -- 3. Atomically decrement stock with race-condition protection
  --    UPDATE ... RETURNING is atomic: PostgreSQL acquires a row lock,
  --    so concurrent transactions are serialized at the row level.
  --    If stock goes negative, we raise an exception which rolls back
  --    the entire transaction (sale + sale_items are also rolled back).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE products
    SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID
    RETURNING stock_quantity INTO v_new_stock;

    -- Check for oversell AFTER the atomic update
    IF v_new_stock < 0 THEN
      RAISE EXCEPTION 'Stock insuffisant pour %: stock négatif après décrément',
        v_item->>'product_name';
    END IF;
  END LOOP;

  -- 4. Record stock movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT stock_quantity INTO v_new_stock
    FROM products WHERE id = (v_item->>'product_id')::UUID;

    v_previous_stock := v_new_stock + (v_item->>'quantity')::INTEGER;

    INSERT INTO stock_movements (
      product_id, type, quantity, previous_quantity, new_quantity, reason, user_id, organization_id
    ) VALUES (
      (v_item->>'product_id')::UUID,
      'sale',
      -(v_item->>'quantity')::INTEGER,
      v_previous_stock,
      v_new_stock,
      'Vente ' || p_sale_number,
      p_user_id,
      p_organization_id
    );
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_full_sale TO authenticated;
