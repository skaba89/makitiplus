-- Migration: Critical audit fixes — batch_update_stock grant, check_account_status overload,
--            create_full_sale RPC, process_credit_payment RPC, security definer fixes
-- Date: 2026-07-01
-- FULLY IDEMPOTENT — safe to re-run any number of times

-- ============================================
-- 1. GRANT EXECUTE on batch_update_stock to authenticated (C2)
-- ============================================
GRANT EXECUTE ON FUNCTION public.batch_update_stock(UUID, JSONB) TO authenticated;

-- ============================================
-- 2. Add zero-arg overload for check_account_status (C3)
--    The 1-arg version exists; we add a 0-arg wrapper that uses auth.uid()
--    This way both client calls (with and without arg) work.
-- ============================================
CREATE OR REPLACE FUNCTION check_account_status()
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM check_account_status(auth.uid());
$$;

-- Also fix the 1-arg version to include SET search_path (M5)
CREATE OR REPLACE FUNCTION check_account_status(check_user_id UUID)
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(p.is_active, FALSE),
    r.role::TEXT,
    p.organization_id
  FROM profiles p
  LEFT JOIN user_roles r ON r.user_id = p.user_id
  WHERE p.user_id = check_user_id
  UNION ALL
  SELECT FALSE, NULL, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = check_user_id
  );
$$;

-- ============================================
-- 3. create_full_sale RPC — atomic sale creation (C4)
--    Inserts sale + sale_items + updates stock in a single transaction
-- ============================================
CREATE OR REPLACE FUNCTION public.create_full_sale(
  p_user_id UUID,
  p_organization_id UUID,
  p_sale_number TEXT,
  p_subtotal NUMERIC,
  p_tax_amount NUMERIC DEFAULT 0,
  p_total_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'cash',
  p_amount_paid NUMERIC DEFAULT 0,
  p_change_amount NUMERIC DEFAULT 0,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'  -- [{product_id, product_name, quantity, unit_price, total_price}]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_current_stock INTEGER;
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

  -- 3. Atomically decrement stock (relative update, no race condition)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE products
    SET stock_quantity = GREATEST(stock_quantity - (v_item->>'quantity')::INTEGER, 0),
        updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID;
  END LOOP;

  -- 4. Record stock movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT stock_quantity INTO v_current_stock
    FROM products WHERE id = (v_item->>'product_id')::UUID;

    INSERT INTO stock_movements (
      product_id, type, quantity, previous_quantity, new_quantity, reason, user_id, organization_id
    ) VALUES (
      (v_item->>'product_id')::UUID,
      'sale',
      -(v_item->>'quantity')::INTEGER,
      v_current_stock + (v_item->>'quantity')::INTEGER,
      v_current_stock,
      'Vente ' || p_sale_number,
      p_user_id,
      p_organization_id
    );
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_full_sale TO authenticated;

-- ============================================
-- 4. process_credit_payment RPC — atomic credit payment (C6)
--    Inserts payment record + updates customer balance in one transaction
-- ============================================
CREATE OR REPLACE FUNCTION public.process_credit_payment(
  p_user_id UUID,
  p_organization_id UUID,
  p_customer_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Paiement de crédit'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0';
  END IF;

  -- 1. Insert credit payment record
  INSERT INTO customer_credits (
    user_id, organization_id, customer_id, amount, type, description
  ) VALUES (
    p_user_id, p_organization_id, p_customer_id, p_amount, 'payment', p_description
  );

  -- 2. Atomically decrement customer credit (relative update)
  UPDATE customers
  SET total_credit = GREATEST(total_credit - p_amount, 0),
      updated_at = NOW()
  WHERE id = p_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_credit_payment TO authenticated;

-- ============================================
-- 5. GRANT EXECUTE on touch_last_login (was missing)
-- ============================================
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'touch_last_login grant: %', SQLERRM;
END $$;
