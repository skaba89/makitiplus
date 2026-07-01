-- ============================================================
-- P0 Security Fix: Remove client-provided identity params from SECURITY DEFINER RPCs
-- Date: 2026-07-02
--
-- CRITICAL FIX: All SECURITY DEFINER functions that accepted p_user_id or
-- p_organization_id from the client are vulnerable to privilege escalation.
-- A malicious client can impersonate another user or access another org's data.
--
-- FIX STRATEGY:
--   - Write RPCs (create_full_sale, process_credit_payment, adjust_product_stock):
--     Remove p_user_id/p_organization_id, use auth.uid() + get_user_organization_id()
--   - Read RPCs (stats, categories, etc.):
--     Remove p_organization_id, use get_user_organization_id() internally
--   - register_user: Replace p_user_id with auth.uid(), keep p_organization_id
--     with admin verification
--   - increment_customer_credit: Add org verification
--
-- FULLY IDEMPOTENT — uses dynamic DROP via pg_proc
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. create_full_sale — Remove p_user_id, p_organization_id
--    Use auth.uid() and get_user_organization_id() internally
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'create_full_sale' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

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
BEGIN
  -- Resolve identity from session — NEVER trust client params
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
      AND organization_id = v_org_id  -- Ensure product belongs to caller's org
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
      v_user_id,
      v_org_id
    );
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_full_sale(TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 2. process_credit_payment — Remove p_user_id, p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'process_credit_payment' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.process_credit_payment(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Paiement de crédit'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_org_id := public.get_user_organization_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0';
  END IF;

  -- Verify customer belongs to caller's org
  IF NOT EXISTS (
    SELECT 1 FROM customers
    WHERE id = p_customer_id AND organization_id = v_org_id AND total_credit >= p_amount
  ) THEN
    RAISE EXCEPTION 'Crédit insuffisant ou client introuvable';
  END IF;

  INSERT INTO customer_credits (
    user_id, organization_id, customer_id, amount, type, description
  ) VALUES (
    v_user_id, v_org_id, p_customer_id, p_amount, 'payment', p_description
  );

  UPDATE customers
  SET total_credit = GREATEST(total_credit - p_amount, 0),
      updated_at = NOW()
  WHERE id = p_customer_id AND organization_id = v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_credit_payment(UUID, NUMERIC, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 3. adjust_product_stock — Remove p_user_id, p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'adjust_product_stock' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id UUID,
  p_type TEXT,              -- 'restock' | 'loss' | 'adjustment'
  p_quantity INTEGER,        -- quantity to add/subtract (restock/loss) or set (adjustment)
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(new_quantity INTEGER, previous_quantity INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_previous_stock INTEGER;
  v_new_stock INTEGER;
  v_delta INTEGER;
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_org_id := public.get_user_organization_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  IF p_type NOT IN ('restock', 'loss', 'adjustment') THEN
    RAISE EXCEPTION 'Type d''ajustement invalide : %. Utilisez restock, loss ou adjustment.', p_type;
  END IF;

  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'La quantité doit être positive.';
  END IF;

  -- Atomically update stock with row lock — ensure product belongs to caller's org
  IF p_type = 'restock' THEN
    UPDATE products
    SET stock_quantity = stock_quantity + p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id AND organization_id = v_org_id
    RETURNING stock_quantity - p_quantity, stock_quantity
    INTO v_previous_stock, v_new_stock;

  ELSIF p_type = 'loss' THEN
    UPDATE products
    SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0),
        updated_at = NOW()
    WHERE id = p_product_id AND organization_id = v_org_id
    RETURNING stock_quantity + p_quantity, stock_quantity
    INTO v_previous_stock, v_new_stock;

  ELSIF p_type = 'adjustment' THEN
    UPDATE products
    SET stock_quantity = p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id AND organization_id = v_org_id
    RETURNING stock_quantity, p_quantity
    INTO v_previous_stock, v_new_stock;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable ou hors de votre organisation : %', p_product_id;
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
    p_reason, v_user_id, v_org_id
  );

  RETURN QUERY SELECT v_new_stock, v_previous_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(UUID, TEXT, INTEGER, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 4. register_user — Replace p_user_id with auth.uid(), verify p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'register_user' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.register_user(
  p_business_name TEXT,
  p_owner_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'vendeur',
  p_organization_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- If p_organization_id is provided, verify caller is admin of that org
  -- (admin inviting a new user to their org)
  IF p_organization_id IS NOT NULL THEN
    IF NOT public.is_member_of_organization(p_organization_id) THEN
      RAISE EXCEPTION 'Accès refusé : vous n''êtes pas membre de cette organisation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'Accès refusé : seul un admin peut inscrire un utilisateur dans une organisation';
    END IF;
  END IF;
  -- If p_organization_id is NULL, this is a self-registration (first admin creating org)

  INSERT INTO profiles (user_id, business_name, owner_name, phone, organization_id)
  VALUES (v_user_id, p_business_name, p_owner_name, p_phone, p_organization_id);

  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, p_role::app_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;


-- ════════════════════════════════════════════════════════════════
-- 5. increment_customer_credit — Add org verification
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'increment_customer_credit' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.increment_customer_credit(
  p_customer_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0';
  END IF;

  -- Verify customer belongs to caller's org
  UPDATE customers
  SET total_credit = total_credit + p_amount,
      updated_at = NOW()
  WHERE id = p_customer_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client introuvable ou hors de votre organisation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_customer_credit(UUID, NUMERIC) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 6. get_customer_stats — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_customer_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_customer_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total BIGINT;
  v_total_credit NUMERIC;
  v_customers_with_credit BIGINT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'totalCustomers', 0, 'totalCredit', 0, 'customersWithCredit', 0
    );
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM(total_credit), 0),
    COUNT(*) FILTER (WHERE total_credit > 0)
  INTO v_total, v_total_credit, v_customers_with_credit
  FROM customers
  WHERE organization_id = v_org_id;

  RETURN jsonb_build_object(
    'totalCustomers', v_total,
    'totalCredit', v_total_credit,
    'customersWithCredit', v_customers_with_credit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_stats() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 7. get_expense_stats — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_expense_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_expense_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_month_total NUMERIC;
  v_month_count BIGINT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('monthTotal', 0, 'monthCount', 0);
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_month_count, v_month_total
  FROM expenses
  WHERE organization_id = v_org_id
    AND expense_date >= date_trunc('month', CURRENT_DATE)
    AND expense_date < date_trunc('month', CURRENT_DATE) + interval '1 month';

  RETURN jsonb_build_object(
    'monthTotal', v_month_total,
    'monthCount', v_month_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_expense_stats() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 8. get_categories — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_categories' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_categories()
RETURNS TABLE (
  id UUID,
  name TEXT,
  icon TEXT,
  color TEXT,
  description TEXT,
  sort_order INT,
  is_default BOOLEAN,
  product_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.icon,
    c.color,
    c.description,
    c.sort_order,
    c.is_default,
    COALESCE(pc.cnt, 0) AS product_count
  FROM categories c
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM products p
    WHERE p.category_id = c.id
      AND p.organization_id = v_org_id
  ) pc ON true
  WHERE c.organization_id = v_org_id
  ORDER BY c.sort_order ASC NULLS LAST, c.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_categories() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 9. get_product_stats — Remove p_organization_id, keep category_counts
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_product_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_product_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total BIGINT;
  v_low_stock BIGINT;
  v_out_of_stock BIGINT;
  v_category_counts JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'totalProducts', 0, 'lowStockCount', 0, 'outOfStockCount', 0, 'categoryCounts', '{}'
    );
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE
      (min_stock_alert IS NOT NULL AND stock_quantity <= min_stock_alert)
      OR
      (min_stock_alert IS NULL AND stock_quantity <= 5)
    ),
    COUNT(*) FILTER (WHERE stock_quantity = 0)
  INTO v_total, v_low_stock, v_out_of_stock
  FROM products
  WHERE organization_id = v_org_id;

  -- Category counts for filter buttons
  SELECT COALESCE(jsonb_object_agg(category_id::text, cnt), '{}'::jsonb)
  INTO v_category_counts
  FROM (
    SELECT category_id, COUNT(*) AS cnt
    FROM products
    WHERE organization_id = v_org_id
      AND category_id IS NOT NULL
    GROUP BY category_id
  ) sub;

  RETURN jsonb_build_object(
    'totalProducts', v_total,
    'lowStockCount', v_low_stock,
    'outOfStockCount', v_out_of_stock,
    'categoryCounts', v_category_counts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_stats() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 10. get_reports_stats — Remove p_organization_id, keep full features
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_reports_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_reports_stats(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total_sales NUMERIC := 0;
  v_total_transactions BIGINT := 0;
  v_total_expenses NUMERIC := 0;
  v_expense_count BIGINT := 0;
  v_payment_breakdown JSONB;
  v_daily_sales JSONB;
  v_top_products JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Sales aggregation
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
  INTO v_total_sales, v_total_transactions
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= p_start
    AND created_at <= p_end;

  -- Expenses aggregation
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_expenses, v_expense_count
  FROM expenses
  WHERE organization_id = v_org_id
    AND expense_date >= p_start::date
    AND expense_date <= p_end::date;

  -- Payment method breakdown
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', payment_method, 'value', method_total
  )), '[]'::jsonb)
  INTO v_payment_breakdown
  FROM (
    SELECT payment_method, SUM(total_amount) AS method_total
    FROM sales
    WHERE organization_id = v_org_id
      AND created_at >= p_start
      AND created_at <= p_end
    GROUP BY payment_method
  ) sub;

  -- Daily sales for chart
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day::text, 'sales', day_total, 'transactions', day_count
  )), '[]'::jsonb)
  INTO v_daily_sales
  FROM (
    SELECT
      d.day::text,
      COALESCE(SUM(s.total_amount), 0) AS day_total,
      COUNT(s.id) AS day_count
    FROM generate_series(p_start::date, p_end::date, '1 day'::interval) AS d(day)
    LEFT JOIN sales s ON s.organization_id = v_org_id
      AND s.created_at >= d.day
      AND s.created_at < d.day + interval '1 day'
    GROUP BY d.day
    ORDER BY d.day
  ) daily;

  -- Top 5 products by quantity sold
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', product_name, 'quantity', total_qty, 'revenue', total_rev
  )), '[]'::jsonb)
  INTO v_top_products
  FROM (
    SELECT
      si.product_name,
      SUM(si.quantity) AS total_qty,
      SUM(si.total_price) AS total_rev
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = v_org_id
      AND s.created_at >= p_start
      AND s.created_at <= p_end
    GROUP BY si.product_name
    ORDER BY total_qty DESC
    LIMIT 5
  ) top;

  RETURN jsonb_build_object(
    'totalSales', v_total_sales,
    'totalTransactions', v_total_transactions,
    'totalExpenses', v_total_expenses,
    'expenseCount', v_expense_count,
    'paymentBreakdown', v_payment_breakdown,
    'dailySales', v_daily_sales,
    'topProducts', v_top_products
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reports_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 11. get_low_stock_products — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_low_stock_products' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_low_stock_products(
  p_limit INT DEFAULT 6
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  stock_quantity INT,
  min_stock_alert INT,
  category_name TEXT,
  category_icon TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.stock_quantity,
    COALESCE(p.min_stock_alert, 5),
    c.name AS category_name,
    c.icon AS category_icon
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.organization_id = v_org_id
    AND p.is_active = true
    AND (
      (p.min_stock_alert IS NOT NULL AND p.stock_quantity <= p.min_stock_alert)
      OR
      (p.min_stock_alert IS NULL AND p.stock_quantity <= 5)
    )
  ORDER BY p.stock_quantity ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_low_stock_products(INT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 12. get_next_category_sort_order — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_next_category_sort_order' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_next_category_sort_order()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_next INT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN 1;
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next
  FROM categories
  WHERE organization_id = v_org_id;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_category_sort_order() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 13. get_supplier_stats — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
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

CREATE OR REPLACE FUNCTION public.get_supplier_stats()
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
    'totalProducts', (SELECT COUNT(*)::int FROM supplier_products WHERE organization_id = v_org_id AND is_active),
    'totalSupplyValue', COALESCE(
      (SELECT SUM(sp.supply_price * sp.min_quantity)
       FROM supplier_products sp
       WHERE sp.organization_id = v_org_id AND sp.is_active),
      0
    )
  ) INTO result
  FROM suppliers
  WHERE organization_id = v_org_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_stats() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 14. get_supplier_with_products — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
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

CREATE OR REPLACE FUNCTION public.get_supplier_with_products(p_supplier_id UUID)
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

  -- Get supplier info (scoped to caller's org)
  SELECT to_jsonb(s.*) INTO supplier_data
  FROM suppliers s
  WHERE s.id = p_supplier_id AND s.organization_id = v_org_id;

  IF supplier_data IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get products for this supplier
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
    AND sp.organization_id = v_org_id;

  RETURN supplier_data || jsonb_build_object('products', products_data);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_with_products(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 15. get_dashboard_stats — Remove p_organization_id, eliminate SQL injection risk
--     Previous version used format() with %L for dynamic SQL — unnecessary and risky
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_dashboard_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_day_start TIMESTAMPTZ DEFAULT NULL,
  p_day_end TIMESTAMPTZ DEFAULT NULL,
  p_month_start TIMESTAMPTZ DEFAULT NULL,
  p_month_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_today_sales NUMERIC := 0;
  v_today_transactions BIGINT := 0;
  v_month_sales NUMERIC := 0;
  v_month_credit_count BIGINT := 0;
  v_month_expenses NUMERIC := 0;
  v_total_products BIGINT := 0;
  v_low_stock_products BIGINT := 0;
  v_total_credits NUMERIC := 0;
  v_credits_count BIGINT := 0;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'todaySales', 0, 'todayTransactions', 0,
      'monthSales', 0, 'monthCreditCount', 0,
      'monthExpenses', 0, 'totalProducts', 0,
      'lowStockProducts', 0, 'totalCredits', 0, 'creditsCount', 0
    );
  END IF;

  -- Today's sales
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
  INTO v_today_sales, v_today_transactions
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= COALESCE(p_day_start, CURRENT_DATE)
    AND created_at <= COALESCE(p_day_end, CURRENT_DATE + INTERVAL '1 day');

  -- Month's sales
  SELECT COALESCE(SUM(total_amount), 0),
         COUNT(*) FILTER (WHERE payment_method = 'credit')
  INTO v_month_sales, v_month_credit_count
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= COALESCE(p_month_start, date_trunc('month', CURRENT_DATE))
    AND created_at <= COALESCE(p_month_end, date_trunc('month', CURRENT_DATE) + INTERVAL '1 month');

  -- Month's expenses
  SELECT COALESCE(SUM(amount), 0)
  INTO v_month_expenses
  FROM expenses
  WHERE organization_id = v_org_id
    AND expense_date >= COALESCE(p_month_start::date, date_trunc('month', CURRENT_DATE)::date)
    AND expense_date <= COALESCE(p_month_end::date, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date);

  -- Products count + low stock
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(min_stock_alert, 5))
  INTO v_total_products, v_low_stock_products
  FROM products
  WHERE organization_id = v_org_id AND is_active = true;

  -- Customer credits
  SELECT COALESCE(SUM(total_credit), 0), COUNT(*)
  INTO v_total_credits, v_credits_count
  FROM customers
  WHERE organization_id = v_org_id AND total_credit > 0;

  RETURN jsonb_build_object(
    'todaySales', v_today_sales,
    'todayTransactions', v_today_transactions,
    'monthSales', v_month_sales,
    'monthCreditCount', v_month_credit_count,
    'monthExpenses', v_month_expenses,
    'totalProducts', v_total_products,
    'lowStockProducts', v_low_stock_products,
    'totalCredits', v_total_credits,
    'creditsCount', v_credits_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 16. get_top_products — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_top_products' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_top_products(
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(product_name TEXT, total_quantity BIGINT, total_revenue NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    si.product_name,
    SUM(si.quantity)::BIGINT AS total_quantity,
    SUM(si.total_price) AS total_revenue
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE s.organization_id = v_org_id
    AND (p_since IS NULL OR s.created_at >= p_since)
  GROUP BY si.product_name
  ORDER BY total_quantity DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_products(TIMESTAMPTZ, INTEGER) TO authenticated;
