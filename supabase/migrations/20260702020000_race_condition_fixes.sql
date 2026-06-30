-- Migration: Race condition fixes — Phase 1
-- Date: 2026-07-02
-- 1. Unique constraint on customers(phone, organization_id) to prevent duplicate customers
-- 2. adjust_product_stock RPC for atomic stock adjustments (replaces non-atomic SET in Products.tsx)
-- 3. Add STABLE to check_account_status(UUID) overload
-- FULLY IDEMPOTENT

-- ============================================
-- 1. Unique constraint on customers(phone, organization_id)
--    Prevents duplicate customer records when concurrent sellers use the same phone.
--    Partial index: only when phone IS NOT NULL (null phones shouldn't block each other)
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_org_unique
  ON public.customers(phone, organization_id)
  WHERE phone IS NOT NULL;

-- ============================================
-- 2. adjust_product_stock RPC — atomic stock adjustment
--    Replaces the non-atomic pattern in Products.tsx where:
--    - previousQuantity is read from stale client cache
--    - newQuantity is computed client-side then SET absolutely
--    This RPC uses UPDATE...RETURNING with row-level locking to prevent lost updates.
-- ============================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'adjust_product_stock'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id UUID,
  p_type TEXT,              -- 'restock' | 'loss' | 'adjustment'
  p_quantity INTEGER,        -- quantity to add/subtract (restock/loss) or set (adjustment)
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE(new_quantity INTEGER, previous_quantity INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_previous_stock INTEGER;
  v_new_stock INTEGER;
  v_delta INTEGER;
BEGIN
  IF p_type NOT IN ('restock', 'loss', 'adjustment') THEN
    RAISE EXCEPTION 'Type d''ajustement invalide : %. Utilisez restock, loss ou adjustment.', p_type;
  END IF;

  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'La quantité doit être positive.';
  END IF;

  -- Atomically update stock with row lock
  IF p_type = 'restock' THEN
    UPDATE products
    SET stock_quantity = stock_quantity + p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id
    RETURNING stock_quantity - p_quantity, stock_quantity
    INTO v_previous_stock, v_new_stock;

  ELSIF p_type = 'loss' THEN
    UPDATE products
    SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0),
        updated_at = NOW()
    WHERE id = p_product_id
    RETURNING stock_quantity + p_quantity, stock_quantity
    INTO v_previous_stock, v_new_stock;

  ELSIF p_type = 'adjustment' THEN
    -- For adjustment, p_quantity is the new absolute value
    UPDATE products
    SET stock_quantity = p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id
    RETURNING stock_quantity, p_quantity
    INTO v_previous_stock, v_new_stock;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable : %', p_product_id;
  END IF;

  -- Record stock movement
  IF p_type = 'restock' THEN
    v_delta := p_quantity;
  ELSIF p_type = 'loss' THEN
    v_delta := -p_quantity;
  ELSE
    v_delta := v_new_stock - v_previous_stock;
  END IF;

  INSERT INTO stock_movements (
    product_id, type, quantity, previous_quantity, new_quantity,
    reason, user_id, organization_id
  ) VALUES (
    p_product_id, p_type, v_delta, v_previous_stock, v_new_stock,
    p_reason, p_user_id, p_organization_id
  );

  RETURN QUERY SELECT v_new_stock, v_previous_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(UUID, TEXT, INTEGER, TEXT, UUID, UUID) TO authenticated;

-- ============================================
-- 3. Add STABLE to check_account_status(UUID) overload
--    The zero-arg version already has STABLE, but the UUID overload is missing it.
-- ============================================
DO $$
DECLARE
  f record;
  fn_sig_count INTEGER;
BEGIN
  -- Count how many overloads exist
  SELECT COUNT(*) INTO fn_sig_count
  FROM pg_proc
  WHERE proname = 'check_account_status'
    AND pronamespace = 'public'::regnamespace;

  IF fn_sig_count > 0 THEN
    -- Drop and recreate with STABLE
    FOR f IN
      SELECT oid::regprocedure AS func_sig
      FROM pg_proc
      WHERE proname = 'check_account_status'
        AND pronamespace = 'public'::regnamespace
    LOOP
      EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
      RAISE NOTICE 'Dropped %', f.func_sig;
    END LOOP;
  END IF;
END $$;

-- Zero-arg: enriched return type
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

-- 1-arg overload — now with STABLE
CREATE OR REPLACE FUNCTION public.check_account_status(check_user_id UUID)
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.check_account_status(UUID) TO authenticated, service_role;
