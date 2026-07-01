-- ═══════════════════════════════════════════════════════════════════════
-- Phase 1: Security & Stability Migration
-- 1. Create missing RPC functions (fix 404 errors)
-- 2. Fix search_path injection in check_account_status
-- 3. Add atomic RPC functions for inventory/credits (race condition fix)
-- 4. Add missing database indexes for performance
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- 1. get_dashboard_stats — Dashboard overview statistics
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_today_sales NUMERIC := 0;
  v_today_transactions INT := 0;
  v_month_expenses NUMERIC := 0;
  v_total_products INT := 0;
  v_low_stock_count INT := 0;
  v_out_of_stock_count INT := 0;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  v_start := COALESCE(p_period_start, CURRENT_DATE);
  v_end   := COALESCE(p_period_end, CURRENT_DATE + INTERVAL '1 day');

  -- Today's sales
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_today_sales, v_today_transactions
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= v_start
    AND created_at < v_end;

  -- Month expenses
  SELECT COALESCE(SUM(amount), 0)
    INTO v_month_expenses
  FROM expenses
  WHERE organization_id = v_org_id
    AND expense_date >= date_trunc('month', CURRENT_DATE)
    AND expense_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';

  -- Products stats
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(min_stock_alert, 5) AND stock_quantity > 0),
         COUNT(*) FILTER (WHERE stock_quantity = 0)
    INTO v_total_products, v_low_stock_count, v_out_of_stock_count
  FROM products
  WHERE organization_id = v_org_id AND is_active = true;

  RETURN jsonb_build_object(
    'today_sales', v_today_sales,
    'today_transactions', v_today_transactions,
    'month_expenses', v_month_expenses,
    'total_products', v_total_products,
    'low_stock_count', v_low_stock_count,
    'out_of_stock_count', v_out_of_stock_count
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. get_top_products — Top selling products by quantity
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_top_products(
  p_limit INT DEFAULT 5,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(name TEXT, quantity BIGINT, revenue NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  RETURN QUERY
  SELECT
    si.product_name AS name,
    SUM(si.quantity)::BIGINT AS quantity,
    SUM(si.total_price) AS revenue
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE s.organization_id = v_org_id
    AND (p_period_start IS NULL OR s.created_at >= p_period_start)
    AND (p_period_end IS NULL OR s.created_at < p_period_end)
  GROUP BY si.product_name
  ORDER BY quantity DESC
  LIMIT p_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. get_low_stock_products — Products at or below alert threshold
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_low_stock_products(
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  stock_quantity INT,
  min_stock_alert INT,
  category_name TEXT,
  category_icon TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
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
    AND p.stock_quantity <= COALESCE(p.min_stock_alert, 5)
  ORDER BY p.stock_quantity ASC
  LIMIT p_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. get_product_stats — Product page statistics
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_product_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total INT;
  v_low_stock INT;
  v_out_of_stock INT;
  v_active INT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(min_stock_alert, 5) AND stock_quantity > 0),
    COUNT(*) FILTER (WHERE stock_quantity = 0),
    COUNT(*) FILTER (WHERE is_active = true)
  INTO v_total, v_low_stock, v_out_of_stock, v_active
  FROM products
  WHERE organization_id = v_org_id;

  RETURN jsonb_build_object(
    'total_products', v_total,
    'low_stock_count', v_low_stock,
    'out_of_stock_count', v_out_of_stock,
    'active_count', v_active
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. get_reports_stats — Reports page aggregated statistics
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_reports_stats(
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total_sales NUMERIC := 0;
  v_total_transactions INT := 0;
  v_total_expenses NUMERIC := 0;
  v_net_profit NUMERIC := 0;
  v_avg_basket NUMERIC := 0;
  v_payment_distribution JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  -- Sales stats
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_total_sales, v_total_transactions
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= p_period_start
    AND created_at < p_period_end;

  -- Expenses
  SELECT COALESCE(SUM(amount), 0)
    INTO v_total_expenses
  FROM expenses
  WHERE organization_id = v_org_id
    AND expense_date >= p_period_start::date
    AND expense_date < p_period_end::date;

  v_net_profit := v_total_sales - v_total_expenses;
  v_avg_basket := CASE WHEN v_total_transactions > 0
    THEN v_total_sales / v_total_transactions
    ELSE 0 END;

  -- Payment method distribution
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_payment_distribution
  FROM (
    SELECT payment_method AS method, SUM(total_amount) AS value
    FROM sales
    WHERE organization_id = v_org_id
      AND created_at >= p_period_start
      AND created_at < p_period_end
    GROUP BY payment_method
    ORDER BY value DESC
  ) t;

  RETURN jsonb_build_object(
    'total_sales', v_total_sales,
    'total_transactions', v_total_transactions,
    'total_expenses', v_total_expenses,
    'net_profit', v_net_profit,
    'avg_basket', v_avg_basket,
    'payment_distribution', v_payment_distribution
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Fix check_account_status — Add SET search_path = public
--    Dynamically drop ALL existing overloads first to avoid 42P13 errors.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'check_account_status' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE(deactivation_reason text, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT p.deactivation_reason, p.is_active
  FROM profiles p
  WHERE p.user_id = v_uid
  LIMIT 1;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Atomic decrement_stock — Race condition safe stock decrement
--    Dynamically drop existing version first (may return VOID instead of JSONB).
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'decrement_stock' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_product_id UUID,
  p_quantity INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_qty INT;
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization not found');
  END IF;

  -- Lock the row, then update atomically
  UPDATE products
  SET stock_quantity = stock_quantity - p_quantity,
      updated_at = now()
  WHERE id = p_product_id
    AND organization_id = v_org_id
  RETURNING stock_quantity INTO v_new_qty;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Product not found');
  END IF;

  IF v_new_qty < 0 THEN
    -- Rollback the over-decrement
    UPDATE products
    SET stock_quantity = stock_quantity + p_quantity,
        updated_at = now()
    WHERE id = p_product_id;

    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient stock');
  END IF;

  RETURN jsonb_build_object('ok', true, 'new_quantity', v_new_qty);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Atomic decrement_credits — Race condition safe credit decrement
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'decrement_credits' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.decrement_credits(
  p_customer_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_current_credit NUMERIC;
  v_new_credit NUMERIC;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization not found');
  END IF;

  -- Lock and read current credit
  SELECT total_credit INTO v_current_credit
  FROM customers
  WHERE id = p_customer_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Customer not found');
  END IF;

  IF v_current_credit < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient credit', 'current', v_current_credit);
  END IF;

  v_new_credit := v_current_credit - p_amount;

  UPDATE customers
  SET total_credit = v_new_credit,
      updated_at = now()
  WHERE id = p_customer_id AND organization_id = v_org_id;

  RETURN jsonb_build_object('ok', true, 'previous_credit', v_current_credit, 'new_credit', v_new_credit);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. process_pos_sale — Atomic POS sale: validate + create + decrement
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'process_pos_sale' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.process_pos_sale(
  p_account_id UUID,
  p_product_id UUID,
  p_quantity INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_product RECORD;
  v_account RECORD;
  v_sale_id UUID;
  v_sale_number TEXT;
  v_line_total NUMERIC;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization not found');
  END IF;

  -- Lock product row
  SELECT id, name, price, stock_quantity, cost_price
  INTO v_product
  FROM products
  WHERE id = p_product_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Product not found');
  END IF;

  -- Validate stock
  IF v_product.stock_quantity < p_quantity THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient stock', 'available', v_product.stock_quantity);
  END IF;

  -- Lock account row (if using credits)
  SELECT id, total_credit
  INTO v_account
  FROM customers
  WHERE id = p_account_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account not found');
  END IF;

  -- Generate sale number
  v_sale_number := public.generate_sale_number();

  -- Calculate line total
  v_line_total := v_product.price * p_quantity;

  -- Create the sale
  INSERT INTO sales (user_id, organization_id, sale_number, total_amount, subtotal, payment_method, customer_id)
  VALUES (auth.uid(), v_org_id, v_sale_number, v_line_total, v_line_total, 'cash', p_account_id)
  RETURNING id INTO v_sale_id;

  -- Create sale item
  INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price, organization_id)
  VALUES (v_sale_id, p_product_id, v_product.name, p_quantity, v_product.price, v_line_total, v_org_id);

  -- Decrement stock atomically
  UPDATE products
  SET stock_quantity = stock_quantity - p_quantity,
      updated_at = now()
  WHERE id = p_product_id AND organization_id = v_org_id;

  -- Record stock movement
  INSERT INTO stock_movements (user_id, product_id, type, quantity, previous_quantity, new_quantity, reference_id, organization_id)
  VALUES (auth.uid(), p_product_id, 'sale', -p_quantity, v_product.stock_quantity, v_product.stock_quantity - p_quantity, v_sale_id, v_org_id);

  RETURN jsonb_build_object(
    'ok', true,
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'total', v_line_total
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 10. Missing Database Indexes — Performance optimization
-- ═══════════════════════════════════════════════════════════════════════

-- Sales table indexes
CREATE INDEX IF NOT EXISTS idx_sales_account_id ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at_desc ON public.sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_currency ON public.sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_organization_id ON public.sales(organization_id);

-- Accounts / Customers indexes
CREATE INDEX IF NOT EXISTS idx_customers_organization_id ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_stock ON public.products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_organization_id ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode) WHERE barcode IS NOT NULL;

-- Expenses indexes
CREATE INDEX IF NOT EXISTS idx_expenses_organization_id ON public.expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_organization_id ON public.categories(organization_id);

-- Stock movements indexes
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id ON public.stock_movements(reference_id) WHERE reference_id IS NOT NULL;

-- Sale items indexes
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_organization_id ON public.sale_items(organization_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 11. Grant execute permissions to authenticated role
-- ═══════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_products(INT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_low_stock_products(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reports_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_credits(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_pos_sale(UUID, UUID, INT) TO authenticated;
