-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX PRODUCTION v4 — Déploiement complet de toutes les RPCs sécurisées
-- Execute dans : Supabase Dashboard -> SQL Editor -> New Query
--
-- Ce script installe TOUTES les RPCs nécessaires au fonctionnement de MakitiPlus :
--   - Fonctions de base (get_user_organization_id, generate_sale_number)
--   - RPCs sécurisées P0 (sans p_user_id/p_organization_id côté client)
--   - RPCs P1 (plan enforcement : create_product, create_store, invite_user, create_sale_with_limit)
--   - Mise à jour tarifs (EUR, pas de starter, croissance + enterprise)
--   - Plans & subscriptions (select_plan, get_plans, check_plan_limit, check_feature_access)
--   - Stats RPCs (dashboard, products, customers, expenses, suppliers, reports, top_products)
--   - Admin analytics RPCs
--   - Autres utilitaires (set_current_store, get_organization_stores, etc.)
--
-- Idempotent : DROP FUNCTION IF EXISTS avant chaque CREATE
-- ═══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 0 : Fonctions de base (dépendances de toutes les autres)
-- ══════════════════════════════════════════════════════════════════════════════

-- 0.1 get_user_organization_id
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated, service_role;


-- 0.2 is_member_of_organization
CREATE OR REPLACE FUNCTION public.is_member_of_organization(_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND organization_id = _org_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_member_of_organization(uuid) TO authenticated, service_role;


-- 0.3 generate_sale_number (version fixée avec bigint + fallback)
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  next_num bigint;
  org_id uuid;
  prefix text;
BEGIN
  BEGIN
    org_id := public.get_user_organization_id();
  EXCEPTION WHEN OTHERS THEN
    org_id := NULL;
  END;

  prefix := 'VTE-';

  IF org_id IS NOT NULL THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '[0-9]+$') AS bigint)), 0) + 1
      INTO next_num
      FROM public.sales
      WHERE organization_id = org_id;
  ELSE
    SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '[0-9]+$') AS bigint)), 0) + 1
      INTO next_num
      FROM public.sales;
  END IF;

  RETURN prefix || LPAD(next_num::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_sale_number() TO authenticated, service_role;


-- 0.4 generate_order_number
CREATE OR REPLACE FUNCTION public.generate_order_number(p_prefix TEXT DEFAULT 'CMD')
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  next_num bigint;
  org_id uuid;
BEGIN
  org_id := public.get_user_organization_id();
  IF org_id IS NOT NULL THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+$') AS bigint)), 0) + 1
      INTO next_num
      FROM public.purchase_orders
      WHERE organization_id = org_id;
  ELSE
    next_num := 1;
  END IF;
  RETURN p_prefix || '-' || LPAD(next_num::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_order_number(TEXT) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 1 : RPCs Write sécurisées P0
-- ══════════════════════════════════════════════════════════════════════════════

-- 1.1 create_full_sale (sans p_user_id/p_organization_id)
DROP FUNCTION IF EXISTS public.create_full_sale(TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT);
-- Also drop old signature with p_user_id/p_organization_id if it exists
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

  -- 3. Atomically decrement stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE products
    SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID
      AND organization_id = v_org_id
    RETURNING stock_quantity INTO v_new_stock;

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


-- 1.2 process_credit_payment (sans p_user_id/p_organization_id)
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


-- 1.3 adjust_product_stock (sans p_user_id/p_organization_id)
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
  p_type TEXT,
  p_quantity INTEGER,
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


-- 1.4 increment_customer_credit (sans p_user_id/p_organization_id)
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


-- 1.5 register_user (P0 secure version)
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

  INSERT INTO profiles (user_id, business_name, owner_name, phone, organization_id)
  VALUES (v_user_id, p_business_name, p_owner_name, p_phone, p_organization_id);

  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, p_role::app_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 2 : RPCs Stats & Read sécurisées P0
-- ══════════════════════════════════════════════════════════════════════════════

-- 2.1 get_customer_stats (sans p_organization_id)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_customer_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
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
    RETURN jsonb_build_object('totalCustomers', 0, 'totalCredit', 0, 'customersWithCredit', 0);
  END IF;

  SELECT COUNT(*), COALESCE(SUM(total_credit), 0), COUNT(*) FILTER (WHERE total_credit > 0)
  INTO v_total, v_total_credit, v_customers_with_credit
  FROM customers WHERE organization_id = v_org_id;

  RETURN jsonb_build_object(
    'totalCustomers', v_total, 'totalCredit', v_total_credit, 'customersWithCredit', v_customers_with_credit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_stats() TO authenticated;


-- 2.2 get_expense_stats (sans p_organization_id)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_expense_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
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

  RETURN jsonb_build_object('monthTotal', v_month_total, 'monthCount', v_month_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_expense_stats() TO authenticated;


-- 2.3 get_categories (sans p_organization_id)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_categories' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_categories()
RETURNS TABLE (
  id UUID, name TEXT, icon TEXT, color TEXT, description TEXT,
  sort_order INT, is_default BOOLEAN, product_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.icon, c.color, c.description,
    c.sort_order, c.is_default, COALESCE(pc.cnt, 0) AS product_count
  FROM categories c
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt FROM products p
    WHERE p.category_id = c.id AND p.organization_id = v_org_id
  ) pc ON true
  WHERE c.organization_id = v_org_id
  ORDER BY c.sort_order ASC NULLS LAST, c.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_categories() TO authenticated;


-- 2.4 get_product_stats (sans p_organization_id)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_product_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
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
    RETURN jsonb_build_object('totalProducts', 0, 'lowStockCount', 0, 'outOfStockCount', 0, 'categoryCounts', '{}');
  END IF;

  SELECT COUNT(*),
    COUNT(*) FILTER (WHERE (min_stock_alert IS NOT NULL AND stock_quantity <= min_stock_alert) OR (min_stock_alert IS NULL AND stock_quantity <= 5)),
    COUNT(*) FILTER (WHERE stock_quantity = 0)
  INTO v_total, v_low_stock, v_out_of_stock
  FROM products WHERE organization_id = v_org_id;

  SELECT COALESCE(jsonb_object_agg(category_id::text, cnt), '{}'::jsonb)
  INTO v_category_counts
  FROM (SELECT category_id, COUNT(*) AS cnt FROM products WHERE organization_id = v_org_id AND category_id IS NOT NULL GROUP BY category_id) sub;

  RETURN jsonb_build_object(
    'totalProducts', v_total, 'lowStockCount', v_low_stock,
    'outOfStockCount', v_out_of_stock, 'categoryCounts', v_category_counts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_stats() TO authenticated;


-- 2.5 get_supplier_stats (sans p_organization_id)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_supplier_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
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
    RETURN jsonb_build_object('totalSuppliers', 0, 'activeSuppliers', 0, 'totalProducts', 0, 'totalSupplyValue', 0);
  END IF;

  SELECT jsonb_build_object(
    'totalSuppliers', COUNT(*)::int,
    'activeSuppliers', COUNT(*) FILTER (WHERE is_active)::int,
    'totalProducts', (SELECT COUNT(*)::int FROM supplier_products WHERE organization_id = v_org_id AND is_active),
    'totalSupplyValue', COALESCE((SELECT SUM(sp.supply_price * sp.min_quantity) FROM supplier_products sp WHERE sp.organization_id = v_org_id AND sp.is_active), 0)
  ) INTO result FROM suppliers WHERE organization_id = v_org_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_stats() TO authenticated;


-- 2.6 get_dashboard_stats (sans p_organization_id)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_dashboard_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
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
  v_today_sales NUMERIC := 0; v_today_transactions BIGINT := 0;
  v_month_sales NUMERIC := 0; v_month_credit_count BIGINT := 0;
  v_month_expenses NUMERIC := 0;
  v_total_products BIGINT := 0; v_low_stock_products BIGINT := 0;
  v_total_credits NUMERIC := 0; v_credits_count BIGINT := 0;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'todaySales', 0, 'todayTransactions', 0, 'monthSales', 0, 'monthCreditCount', 0,
      'monthExpenses', 0, 'totalProducts', 0, 'lowStockProducts', 0, 'totalCredits', 0, 'creditsCount', 0
    );
  END IF;

  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
  INTO v_today_sales, v_today_transactions
  FROM sales WHERE organization_id = v_org_id
    AND created_at >= COALESCE(p_day_start, CURRENT_DATE)
    AND created_at <= COALESCE(p_day_end, CURRENT_DATE + INTERVAL '1 day');

  SELECT COALESCE(SUM(total_amount), 0), COUNT(*) FILTER (WHERE payment_method = 'credit')
  INTO v_month_sales, v_month_credit_count
  FROM sales WHERE organization_id = v_org_id
    AND created_at >= COALESCE(p_month_start, date_trunc('month', CURRENT_DATE))
    AND created_at <= COALESCE(p_month_end, date_trunc('month', CURRENT_DATE) + INTERVAL '1 month');

  SELECT COALESCE(SUM(amount), 0) INTO v_month_expenses
  FROM expenses WHERE organization_id = v_org_id
    AND expense_date >= COALESCE(p_month_start::date, date_trunc('month', CURRENT_DATE)::date)
    AND expense_date <= COALESCE(p_month_end::date, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(min_stock_alert, 5))
  INTO v_total_products, v_low_stock_products
  FROM products WHERE organization_id = v_org_id AND is_active = true;

  SELECT COALESCE(SUM(total_credit), 0), COUNT(*)
  INTO v_total_credits, v_credits_count
  FROM customers WHERE organization_id = v_org_id AND total_credit > 0;

  RETURN jsonb_build_object(
    'todaySales', v_today_sales, 'todayTransactions', v_today_transactions,
    'monthSales', v_month_sales, 'monthCreditCount', v_month_credit_count,
    'monthExpenses', v_month_expenses, 'totalProducts', v_total_products,
    'lowStockProducts', v_low_stock_products, 'totalCredits', v_total_credits, 'creditsCount', v_credits_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- 2.7 get_top_products (sans p_organization_id)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_top_products' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_top_products(
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(product_name TEXT, total_quantity BIGINT, total_revenue NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT si.product_name, SUM(si.quantity)::BIGINT, SUM(si.total_price)
  FROM sale_items si JOIN sales s ON s.id = si.sale_id
  WHERE s.organization_id = v_org_id AND (p_since IS NULL OR s.created_at >= p_since)
  GROUP BY si.product_name ORDER BY SUM(si.quantity) DESC LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_products(TIMESTAMPTZ, INTEGER) TO authenticated;


-- 2.8 get_reports_stats (sans p_organization_id)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_reports_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
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
  v_total_sales NUMERIC := 0; v_total_transactions BIGINT := 0;
  v_total_expenses NUMERIC := 0; v_expense_count BIGINT := 0;
  v_payment_breakdown JSONB; v_daily_sales JSONB; v_top_products JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;

  SELECT COALESCE(SUM(total_amount), 0), COUNT(*) INTO v_total_sales, v_total_transactions
  FROM sales WHERE organization_id = v_org_id AND created_at >= p_start AND created_at <= p_end;

  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_total_expenses, v_expense_count
  FROM expenses WHERE organization_id = v_org_id AND expense_date >= p_start::date AND expense_date <= p_end::date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('method', payment_method, 'value', method_total)), '[]'::jsonb)
  INTO v_payment_breakdown
  FROM (SELECT payment_method, SUM(total_amount) AS method_total FROM sales WHERE organization_id = v_org_id AND created_at >= p_start AND created_at <= p_end GROUP BY payment_method) sub;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day::text, 'sales', day_total, 'transactions', day_count)), '[]'::jsonb)
  INTO v_daily_sales
  FROM (
    SELECT d.day::text, COALESCE(SUM(s.total_amount), 0) AS day_total, COUNT(s.id) AS day_count
    FROM generate_series(p_start::date, p_end::date, '1 day'::interval) AS d(day)
    LEFT JOIN sales s ON s.organization_id = v_org_id AND s.created_at >= d.day AND s.created_at < d.day + interval '1 day'
    GROUP BY d.day ORDER BY d.day
  ) daily;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', product_name, 'quantity', total_qty, 'revenue', total_rev)), '[]'::jsonb)
  INTO v_top_products
  FROM (
    SELECT si.product_name, SUM(si.quantity) AS total_qty, SUM(si.total_price) AS total_rev
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = v_org_id AND s.created_at >= p_start AND s.created_at <= p_end
    GROUP BY si.product_name ORDER BY total_qty DESC LIMIT 5
  ) top;

  RETURN jsonb_build_object(
    'totalSales', v_total_sales, 'totalTransactions', v_total_transactions,
    'totalExpenses', v_total_expenses, 'expenseCount', v_expense_count,
    'paymentBreakdown', v_payment_breakdown, 'dailySales', v_daily_sales, 'topProducts', v_top_products
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reports_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- 2.9 get_low_stock_products
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_low_stock_products' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_low_stock_products(p_limit INT DEFAULT 6)
RETURNS TABLE(id UUID, name TEXT, stock_quantity INT, min_stock_alert INT, category_name TEXT, category_icon TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.stock_quantity, COALESCE(p.min_stock_alert, 5), c.name, c.icon
  FROM products p LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.organization_id = v_org_id AND p.is_active = true
    AND ((p.min_stock_alert IS NOT NULL AND p.stock_quantity <= p.min_stock_alert) OR (p.min_stock_alert IS NULL AND p.stock_quantity <= 5))
  ORDER BY p.stock_quantity ASC LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_low_stock_products(INT) TO authenticated;


-- 2.10 get_next_category_sort_order
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_next_category_sort_order' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_next_category_sort_order()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_next INT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN 1; END IF;
  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next FROM categories WHERE organization_id = v_org_id;
  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_category_sort_order() TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 3 : RPCs P1 — Plan Enforcement
-- ══════════════════════════════════════════════════════════════════════════════

-- 3.1 create_product (plan-enforced)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'create_product' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_product(
  p_name TEXT, p_price NUMERIC, p_category_id UUID DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL, p_unit TEXT DEFAULT 'unité',
  p_stock_quantity INTEGER DEFAULT 0, p_min_stock_alert INTEGER DEFAULT 5,
  p_buy_price NUMERIC DEFAULT NULL, p_supplier_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL, p_description TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL, p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID; v_user_id UUID; v_product_id UUID; v_limit_ok BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;

  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('products') LIMIT 1;
  IF NOT v_limit_ok THEN RAISE EXCEPTION 'Limite de produits atteinte pour votre plan. Upgradéz votre abonnement.'; END IF;

  IF p_store_id IS NULL THEN
    SELECT current_store_id INTO p_store_id FROM public.profiles WHERE user_id = v_user_id;
    IF p_store_id IS NULL THEN
      SELECT id INTO p_store_id FROM public.stores WHERE organization_id = v_org_id AND is_headquarters = true LIMIT 1;
    END IF;
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND organization_id = v_org_id) THEN
    RAISE EXCEPTION 'Magasin invalide';
  END IF;

  INSERT INTO public.products (organization_id, name, price, category_id, barcode, unit,
    stock_quantity, min_stock_alert, buy_price, supplier_id, store_id, description, image_url, is_active, user_id
  ) VALUES (v_org_id, p_name, p_price, p_category_id, p_barcode, p_unit,
    p_stock_quantity, p_min_stock_alert, p_buy_price, p_supplier_id, p_store_id, p_description, p_image_url, p_is_active, v_user_id
  ) RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_product(TEXT, NUMERIC, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, BOOLEAN) TO authenticated;


-- 3.2 create_store (plan-enforced)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'create_store' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_store(
  p_name TEXT, p_slug TEXT, p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL, p_country TEXT DEFAULT 'GN',
  p_currency TEXT DEFAULT 'GNF', p_phone TEXT DEFAULT NULL,
  p_category public.store_category DEFAULT 'autre', p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_store_id UUID; v_limit_ok BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;

  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('stores') LIMIT 1;
  IF NOT v_limit_ok THEN RAISE EXCEPTION 'Limite de boutiques atteinte pour votre plan.'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent créer des boutiques';
  END IF;

  INSERT INTO public.stores (organization_id, name, slug, address, city, country, currency, phone, category, metadata)
  VALUES (v_org_id, p_name, p_slug, p_address, p_city, p_country, p_currency, p_phone, p_category, p_metadata)
  RETURNING id INTO v_store_id;

  RETURN v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_store(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.store_category, JSONB) TO authenticated;


-- 3.3 invite_user (plan-enforced)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'invite_user' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.invite_user(
  p_email TEXT, p_role public.app_role DEFAULT 'vendeur'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_user_id UUID; v_limit_ok BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;

  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('users') LIMIT 1;
  IF NOT v_limit_ok THEN RAISE EXCEPTION 'Limite d''utilisateurs atteinte pour votre plan.'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent inviter des utilisateurs';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Utilisateur non trouvé. Utilisez l''invitation par email.'; END IF;

  INSERT INTO public.user_roles (user_id, organization_id, role) VALUES (v_user_id, v_org_id, p_role)
    ON CONFLICT (user_id, organization_id, role) DO NOTHING;
  INSERT INTO public.profiles (user_id, organization_id, owner_name) VALUES (v_user_id, v_org_id, p_email)
    ON CONFLICT (user_id) DO NOTHING;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_user(TEXT, public.app_role) TO authenticated;


-- 3.4 create_sale_with_limit (plan-enforced, délègue à create_full_sale)
DROP FUNCTION IF EXISTS public.create_sale_with_limit(JSONB, TEXT, UUID, NUMERIC, UUID, TEXT);
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'create_sale_with_limit' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_sale_with_limit(
  p_sale_number TEXT, p_subtotal NUMERIC, p_total_amount NUMERIC,
  p_items JSONB, p_tax_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash', p_amount_paid NUMERIC DEFAULT 0,
  p_change_amount NUMERIC DEFAULT 0, p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL, p_seller_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_limit_ok BOOLEAN; v_sale_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;

  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('sales_this_month') LIMIT 1;
  IF NOT v_limit_ok THEN RAISE EXCEPTION 'Limite de ventes mensuelles atteinte pour votre plan. Upgradéz votre abonnement.'; END IF;

  v_sale_id := public.create_full_sale(
    p_sale_number, p_subtotal, p_total_amount, p_items,
    p_tax_amount, p_payment_method, p_amount_paid, p_change_amount,
    p_customer_name, p_customer_phone, p_seller_name
  );
  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 4 : Tarifs & Plans
-- ══════════════════════════════════════════════════════════════════════════════

-- 4.1 Désactiver le plan starter
UPDATE public.plans
SET is_active = false, name = 'Starter (obsolète)',
    description = 'Ce plan n''est plus disponible. Les utilisateurs existants sont invités à migrer.'
WHERE id = 'starter';

-- 4.2 Mettre à jour Croissance
UPDATE public.plans
SET name = 'MakitiPlus Croissance',
    description = 'Pour les boutiques qui grandissent — fournisseurs, rapports avancés, exports et multi-devises.',
    price_monthly = 39.90, price_yearly = 399.00, currency = 'EUR',
    max_stores = 1, max_users = 5, max_products = NULL, max_sales_per_month = NULL,
    has_advanced_reports = true, has_exports = true, has_supplier_management = true,
    has_offline_advanced = false, has_custom_branding = false, has_multi_currency = true,
    has_api_access = false, has_priority_support = false, has_ai_assistant = false,
    has_loyalty_program = false, sort_order = 1, is_active = true
WHERE id = 'croissance';

-- 4.3 Mettre à jour Enterprise
UPDATE public.plans
SET name = 'MakitiPlus Enterprise',
    description = 'Pour les chaînes et grossistes — boutiques illimitées, API, support prioritaire et assistant IA.',
    price_monthly = 99.90, price_yearly = 999.00, currency = 'EUR',
    max_stores = NULL, max_users = NULL, max_products = NULL, max_sales_per_month = NULL,
    has_advanced_reports = true, has_exports = true, has_supplier_management = true,
    has_offline_advanced = true, has_custom_branding = true, has_multi_currency = true,
    has_api_access = true, has_priority_support = true, has_ai_assistant = true,
    has_loyalty_program = true, sort_order = 2, is_active = true
WHERE id = 'enterprise';


-- 4.4 select_plan (n'accepte que croissance ou enterprise)
DROP FUNCTION IF EXISTS public.select_plan(TEXT);
CREATE OR REPLACE FUNCTION public.select_plan(p_plan_id TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID; v_sub_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Non authentifie'; END IF;
  IF p_plan_id IS NULL OR p_plan_id NOT IN ('croissance', 'enterprise') THEN
    RAISE EXCEPTION 'Plan invalide : %. Plans disponibles : croissance, enterprise', p_plan_id;
  END IF;

  SELECT organization_id INTO v_org_id FROM public.profiles WHERE user_id = v_user_id AND is_active = true LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Aucune organisation trouvee'; END IF;

  INSERT INTO public.subscriptions (organization_id, plan_id, status, billing_period, current_period_start, current_period_end)
  VALUES (v_org_id, p_plan_id, 'active', 'monthly', NOW(), NOW() + INTERVAL '30 days')
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id, status = 'active', current_period_start = NOW(),
    current_period_end = EXCLUDED.current_period_end, updated_at = NOW()
  RETURNING id INTO v_sub_id;

  INSERT INTO public.subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
  VALUES (v_org_id, 'upgraded', 'starter', p_plan_id, v_user_id, jsonb_build_object('source', 'onboarding', 'plan_id', p_plan_id));

  RETURN v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.select_plan(TEXT) TO authenticated;


-- 4.5 get_plans (seulement les actifs)
DROP FUNCTION IF EXISTS public.get_plans();
CREATE OR REPLACE FUNCTION public.get_plans()
RETURNS SETOF public.plans
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT * FROM public.plans WHERE is_active = true ORDER BY sort_order; $$;

GRANT EXECUTE ON FUNCTION public.get_plans() TO authenticated;


-- 4.6 check_plan_limit (fallback vers croissance)
DROP FUNCTION IF EXISTS public.check_plan_limit(TEXT);
CREATE OR REPLACE FUNCTION public.check_plan_limit(p_limit_type TEXT)
RETURNS TABLE (allowed BOOLEAN, current_count INTEGER, limit_value INTEGER, plan_id TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID; v_sub record; v_current INTEGER; v_limit INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;

  SELECT s.plan_id AS sub_plan_id, p.max_stores, p.max_users, p.max_products, p.max_sales_per_month
  INTO v_sub
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    SELECT 'croissance'::text AS sub_plan_id, max_stores, max_users, max_products, max_sales_per_month
    INTO v_sub FROM public.plans WHERE id = 'croissance';
  END IF;

  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
      v_limit := v_sub.max_stores;
    WHEN 'users' THEN
      SELECT COUNT(DISTINCT ur.user_id) INTO v_current
      FROM public.user_roles ur JOIN public.profiles pf ON pf.user_id = ur.user_id
      WHERE pf.organization_id = v_org_id;
      v_limit := v_sub.max_users;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id;
      v_limit := v_sub.max_products;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_current FROM public.sales sal
      WHERE sal.organization_id = v_org_id AND sal.created_at >= date_trunc('month', NOW());
      v_limit := v_sub.max_sales_per_month;
    ELSE RAISE EXCEPTION 'Type de limite inconnu : %', p_limit_type;
  END CASE;

  RETURN QUERY SELECT (v_limit IS NULL OR v_current < v_limit)::BOOLEAN, v_current, v_limit, v_sub.sub_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;


-- 4.7 check_feature_access
DROP FUNCTION IF EXISTS public.check_feature_access(TEXT);
CREATE OR REPLACE FUNCTION public.check_feature_access(p_feature TEXT)
RETURNS TABLE (allowed BOOLEAN, plan_id TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID; v_plan_id TEXT; v_allowed BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;

  SELECT plan_id INTO v_plan_id FROM public.subscriptions
  WHERE organization_id = v_org_id AND status IN ('active', 'past_due', 'grace_period')
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN v_plan_id := 'croissance'; END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.plans WHERE id = $1 AND %I = true)', p_feature)
  INTO v_allowed USING v_plan_id;

  RETURN QUERY SELECT v_allowed, v_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_feature_access(TEXT) TO authenticated;


-- 4.8 get_organization_subscription
DROP FUNCTION IF EXISTS public.get_organization_subscription();
CREATE OR REPLACE FUNCTION public.get_organization_subscription()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID; result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'subscription', row_to_json(s.*),
    'plan', row_to_json(p.*)
  ) INTO result
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC LIMIT 1;

  IF result IS NULL THEN
    SELECT jsonb_build_object('plan', row_to_json(p.*)) INTO result
    FROM public.plans p WHERE p.id = 'croissance';
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_subscription() TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 5 : Utilitaires compte & stores
-- ══════════════════════════════════════════════════════════════════════════════

-- 5.1 check_account_status
CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.is_active, r.role::text, p.organization_id
  FROM public.profiles p
  LEFT JOIN public.user_roles r ON r.user_id = p.user_id
  WHERE p.user_id = v_user_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated;


-- 5.2 touch_last_login
CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET last_login = NOW() WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;


-- 5.3 admin_exists
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role IN ('admin', 'super_admin'));
$$;

GRANT EXECUTE ON FUNCTION public.admin_exists() TO authenticated, anon;


-- 5.4 get_organization_stores
DROP FUNCTION IF EXISTS public.get_organization_stores();
CREATE OR REPLACE FUNCTION public.get_organization_stores()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, address TEXT, city TEXT, country TEXT,
  currency TEXT, phone TEXT, category TEXT, is_headquarters BOOLEAN,
  is_active BOOLEAN, metadata JSONB, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT s.id, s.name, s.slug, s.address, s.city, s.country,
    s.currency, s.phone, s.category::text, s.is_headquarters,
    s.is_active, s.metadata, s.created_at
  FROM public.stores s
  WHERE s.organization_id = v_org_id
  ORDER BY s.is_headquarters DESC, s.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_stores() TO authenticated;


-- 5.5 set_current_store
CREATE OR REPLACE FUNCTION public.set_current_store(p_store_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND organization_id = v_org_id) THEN
    RAISE EXCEPTION 'Magasin invalide ou hors de votre organisation';
  END IF;

  UPDATE public.profiles SET current_store_id = p_store_id WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_current_store(UUID) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 6 : Admin Analytics RPCs
-- ══════════════════════════════════════════════════════════════════════════════

-- 6.1 get_admin_stores_summary
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_admin_stores_summary' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_stores_summary(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_store_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'store_id', s.id,
    'store_name', s.name,
    'total_sales', COALESCE(sales_data.total, 0),
    'total_revenue', COALESCE(sales_data.revenue, 0),
    'total_transactions', COALESCE(sales_data.transactions, 0)
  )), '[]'::jsonb) INTO v_result
  FROM stores s
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total, COALESCE(SUM(sal.total_amount), 0) AS revenue, COUNT(sal.id) AS transactions
    FROM sales sal
    WHERE sal.organization_id = v_org_id
      AND (p_start_date IS NULL OR sal.created_at >= p_start_date)
      AND (p_end_date IS NULL OR sal.created_at <= p_end_date)
  ) sales_data ON true
  WHERE s.organization_id = v_org_id
    AND (p_store_id IS NULL OR s.id = p_store_id)
  ORDER BY s.name;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stores_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;


-- 6.2 get_admin_article_ranking
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_admin_article_ranking' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_article_ranking(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_name', si.product_name,
    'total_quantity', SUM(si.quantity),
    'total_revenue', SUM(si.total_price)
  )), '[]'::jsonb) INTO v_result
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE s.organization_id = v_org_id
    AND (p_start_date IS NULL OR s.created_at >= p_start_date)
    AND (p_end_date IS NULL OR s.created_at <= p_end_date)
  GROUP BY si.product_name
  ORDER BY SUM(si.quantity) DESC
  LIMIT p_limit;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_article_ranking(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;


-- 6.3 get_admin_stock_movements
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_admin_stock_movements' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_stock_movements(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', sm.id,
    'product_name', p.name,
    'type', sm.type,
    'quantity', sm.quantity,
    'previous_quantity', sm.previous_quantity,
    'new_quantity', sm.new_quantity,
    'reason', sm.reason,
    'created_at', sm.created_at
  )), '[]'::jsonb) INTO v_result
  FROM stock_movements sm
  JOIN products p ON p.id = sm.product_id
  WHERE sm.organization_id = v_org_id
    AND (p_start_date IS NULL OR sm.created_at >= p_start_date)
    AND (p_end_date IS NULL OR sm.created_at <= p_end_date)
  ORDER BY sm.created_at DESC
  LIMIT p_limit;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stock_movements(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;


-- 6.4 get_admin_sales_trend
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_admin_sales_trend' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_sales_trend(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  v_start := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end := COALESCE(p_end_date, CURRENT_DATE + INTERVAL '1 day');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', d.day::text,
    'sales', COALESCE(SUM(s.total_amount), 0),
    'transactions', COUNT(s.id)
  )), '[]'::jsonb) INTO v_result
  FROM generate_series(v_start::date, v_end::date, '1 day'::interval) AS d(day)
  LEFT JOIN sales s ON s.organization_id = v_org_id
    AND s.created_at >= d.day AND s.created_at < d.day + INTERVAL '1 day'
  GROUP BY d.day ORDER BY d.day;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_sales_trend(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- 6.5 get_admin_payment_distribution
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_admin_payment_distribution' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_payment_distribution(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', payment_method,
    'count', COUNT(*),
    'total', COALESCE(SUM(total_amount), 0)
  )), '[]'::jsonb) INTO v_result
  FROM sales
  WHERE organization_id = v_org_id
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
  GROUP BY payment_method;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_payment_distribution(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 7 : Purchase Orders
-- ══════════════════════════════════════════════════════════════════════════════

-- 7.1 receive_purchase_order
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'receive_purchase_order' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id UUID,
  p_received_items JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_item JSONB;
  v_new_stock INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;

  -- Verify order belongs to org
  IF NOT EXISTS (SELECT 1 FROM purchase_orders WHERE id = p_order_id AND organization_id = v_org_id) THEN
    RAISE EXCEPTION 'Commande introuvable ou hors de votre organisation';
  END IF;

  -- Update order status
  UPDATE purchase_orders SET status = 'received', notes = COALESCE(p_notes, notes), updated_at = NOW()
  WHERE id = p_order_id AND organization_id = v_org_id;

  -- Process received items: update stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_received_items)
  LOOP
    UPDATE products
    SET stock_quantity = stock_quantity + (v_item->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID AND organization_id = v_org_id
    RETURNING stock_quantity INTO v_new_stock;

    INSERT INTO stock_movements (product_id, type, quantity, previous_quantity, new_quantity, reason, user_id, organization_id)
    VALUES (
      (v_item->>'product_id')::UUID, 'restock',
      (v_item->>'quantity')::INTEGER,
      v_new_stock - (v_item->>'quantity')::INTEGER,
      v_new_stock,
      'Réception commande ' || (SELECT order_number FROM purchase_orders WHERE id = p_order_id),
      auth.uid(), v_org_id
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order(UUID, JSONB, TEXT) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 8 : Vérification finale
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  missing TEXT[] := '{}';
  f record;
BEGIN
  FOR f IN SELECT unnest(ARRAY[
    'get_user_organization_id', 'is_member_of_organization', 'generate_sale_number',
    'create_full_sale', 'process_credit_payment', 'adjust_product_stock',
    'increment_customer_credit', 'register_user', 'get_customer_stats',
    'get_expense_stats', 'get_categories', 'get_product_stats',
    'get_supplier_stats', 'get_dashboard_stats', 'get_top_products',
    'get_reports_stats', 'get_low_stock_products', 'get_next_category_sort_order',
    'create_product', 'create_store', 'invite_user', 'create_sale_with_limit',
    'select_plan', 'get_plans', 'check_plan_limit', 'check_feature_access',
    'get_organization_subscription', 'check_account_status', 'touch_last_login',
    'admin_exists', 'get_organization_stores', 'set_current_store',
    'generate_order_number', 'receive_purchase_order',
    'get_admin_stores_summary', 'get_admin_article_ranking',
    'get_admin_stock_movements', 'get_admin_sales_trend', 'get_admin_payment_distribution'
  ]) AS fname LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = f.unnest) THEN
      missing := array_append(missing, f.unnest);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE WARNING 'RPCs encore manquantes : %', array_to_string(missing, ', ');
  ELSE
    RAISE NOTICE 'Toutes les RPCs sont installées avec succès !';
  END IF;
END $$;
