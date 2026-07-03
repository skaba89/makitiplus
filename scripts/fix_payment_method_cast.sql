-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX : Cast payment_method TEXT → public.payment_method enum dans create_full_sale
-- Erreur : "column payment_method is of type payment_method but expression is of type text"
-- ═══════════════════════════════════════════════════════════════════════════════

-- Fix create_full_sale : caster p_payment_method en enum
CREATE OR REPLACE FUNCTION public.create_full_sale(
  p_sale_number TEXT, p_subtotal NUMERIC, p_total_amount NUMERIC,
  p_items JSONB, p_tax_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash', p_amount_paid NUMERIC DEFAULT 0,
  p_change_amount NUMERIC DEFAULT 0, p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL, p_seller_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id UUID; v_item JSONB; v_new_stock INTEGER; v_previous_stock INTEGER;
  v_user_id UUID; v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_org_id := public.get_user_organization_id();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;

  INSERT INTO sales (user_id, organization_id, sale_number, subtotal, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, customer_name, customer_phone, seller_name
  ) VALUES (v_user_id, v_org_id, p_sale_number, p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method::public.payment_method, p_amount_paid, p_change_amount, p_customer_name, p_customer_phone, p_seller_name
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price, organization_id)
    VALUES (v_sale_id, (v_item->>'product_id')::UUID, v_item->>'product_name',
      (v_item->>'quantity')::INTEGER, (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC, v_org_id);
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    UPDATE products SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER,
      updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID AND organization_id = v_org_id
    RETURNING stock_quantity INTO v_new_stock;

    v_previous_stock := v_new_stock + (v_item->>'quantity')::INTEGER;

    INSERT INTO stock_movements (product_id, type, quantity, previous_quantity, new_quantity, reason, user_id, organization_id)
    VALUES ((v_item->>'product_id')::UUID, 'sale', (v_item->>'quantity')::INTEGER,
      v_previous_stock, v_new_stock, 'Vente ' || p_sale_number, v_user_id, v_org_id);
  END LOOP;

  RETURN v_sale_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_full_sale(TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;


-- Fix create_sale_with_limit : aussi caster (elle délègue à create_full_sale, mais au cas où)
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
  IF NOT v_limit_ok THEN RAISE EXCEPTION 'Limite de ventes mensuelles atteinte'; END IF;
  v_sale_id := public.create_full_sale(p_sale_number, p_subtotal, p_total_amount, p_items,
    p_tax_amount, p_payment_method, p_amount_paid, p_change_amount, p_customer_name, p_customer_phone, p_seller_name);
  RETURN v_sale_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;


-- Vérification
SELECT 'create_full_sale fixed' AS status;
