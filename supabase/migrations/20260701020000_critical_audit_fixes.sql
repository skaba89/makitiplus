-- Migration: Critical audit fixes — batch_update_stock grant, check_account_status DROP+recreate,
--            create_full_sale RPC, process_credit_payment RPC, decrement_stock RPC,
--            register_user RPC (atomic signup), increment_customer_credit RPC
-- Date: 2026-07-01
-- FULLY IDEMPOTENT — safe to re-run any number of times
-- Uses DROP FUNCTION IF EXISTS before CREATE to avoid 42P13 errors

-- ============================================
-- 1. GRANT EXECUTE on batch_update_stock to authenticated (C2)
-- ============================================
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.batch_update_stock(UUID, JSONB) TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'batch_update_stock grant: %', SQLERRM;
END $$;

-- ============================================
-- 2. Fix check_account_status (C3)
--    DROP first because return type changed (42P13 prevention)
-- ============================================
DROP FUNCTION IF EXISTS public.check_account_status();
DROP FUNCTION IF EXISTS public.check_account_status(UUID);

-- Recreate zero-arg function with enriched return type
CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID, deactivation_reason TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(p.is_active, FALSE),
    r.role::TEXT,
    p.organization_id,
    p.deactivation_reason
  FROM profiles p
  LEFT JOIN user_roles r ON r.user_id = p.user_id
  WHERE p.user_id = auth.uid()
  UNION ALL
  SELECT FALSE, NULL, NULL, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated, service_role;

-- 1-arg overload
CREATE OR REPLACE FUNCTION public.check_account_status(check_user_id UUID)
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
-- 3. create_full_sale RPC — atomic sale creation (C4 + C5)
--    DROP first to avoid 42P13 if signature changed from a previous attempt
-- ============================================
DROP FUNCTION IF EXISTS public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB
);

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
  v_current_stock INTEGER;
  v_requested_qty INTEGER;
BEGIN
  -- 0. Pre-check: verify sufficient stock for all items (C5: prevent oversell)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_requested_qty := (v_item->>'quantity')::INTEGER;
    SELECT stock_quantity INTO v_current_stock
    FROM products WHERE id = (v_item->>'product_id')::UUID;

    IF v_current_stock < v_requested_qty THEN
      RAISE EXCEPTION 'Stock insuffisant pour %: demande=%, disponible=%',
        v_item->>'product_name', v_requested_qty, v_current_stock;
    END IF;
  END LOOP;

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
--    DROP first to avoid 42P13 if signature changed
-- ============================================
DROP FUNCTION IF EXISTS public.process_credit_payment(UUID, UUID, UUID, NUMERIC, TEXT);

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
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND total_credit >= p_amount) THEN
    RAISE EXCEPTION 'Crédit insuffisant ou client introuvable';
  END IF;

  INSERT INTO customer_credits (
    user_id, organization_id, customer_id, amount, type, description
  ) VALUES (
    p_user_id, p_organization_id, p_customer_id, p_amount, 'payment', p_description
  );

  UPDATE customers
  SET total_credit = GREATEST(total_credit - p_amount, 0),
      updated_at = NOW()
  WHERE id = p_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_credit_payment TO authenticated;

-- ============================================
-- 5. decrement_stock RPC — atomic relative stock decrement (C5 fallback)
-- ============================================
CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_stock INTEGER;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'La quantité doit être supérieure à 0';
  END IF;

  UPDATE products
  SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0),
      updated_at = NOW()
  WHERE id = p_product_id
  RETURNING stock_quantity INTO v_current_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_stock TO authenticated;

-- ============================================
-- 6. register_user RPC — atomic user registration (C9)
--    DROP first to avoid 42P13 if signature changed
-- ============================================
DROP FUNCTION IF EXISTS public.register_user(UUID, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.register_user(
  p_user_id UUID,
  p_business_name TEXT,
  p_owner_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'vendeur',
  p_organization_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (user_id, business_name, owner_name, phone, organization_id)
  VALUES (p_user_id, p_business_name, p_owner_name, p_phone, p_organization_id);

  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, p_role::app_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user TO authenticated, service_role;

-- ============================================
-- 7. increment_customer_credit RPC — atomic credit increment
-- ============================================
CREATE OR REPLACE FUNCTION public.increment_customer_credit(
  p_customer_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0';
  END IF;

  UPDATE customers
  SET total_credit = total_credit + p_amount,
      updated_at = NOW()
  WHERE id = p_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_customer_credit TO authenticated;

-- ============================================
-- 8. GRANT EXECUTE on touch_last_login
-- ============================================
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'touch_last_login grant: %', SQLERRM;
END $$;
