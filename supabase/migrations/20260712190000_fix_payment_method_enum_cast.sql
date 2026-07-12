-- ============================================================
-- Migration : FIX cast payment_method enum + autres enums
-- Date: 2026-07-12
-- ============================================================
-- BUG : "column 'payment_method' is of type payment_method but
-- expression is of type text"
--
-- Cause : la colonne sales.payment_method est de type enum
-- payment_method, mais create_full_sale déclare p_payment_method TEXT
-- et l'insère sans cast explicite. PostgreSQL ne peut pas caster
-- implicitement TEXT → enum.
--
-- Fix : ajouter ::payment_method dans l'INSERT.
-- Idem pour sync_status si présent.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- Recréer create_full_sale avec cast ::payment_method
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC
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
  p_seller_name TEXT DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_new_stock INTEGER;
BEGIN
  -- ✅ FIX : caster p_payment_method::payment_method (enum)
  INSERT INTO sales (
    user_id, organization_id, sale_number, subtotal, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, customer_name, customer_phone,
    seller_name, discount_amount
  ) VALUES (
    p_user_id, p_organization_id, p_sale_number, p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method::public.payment_method,  -- ✅ cast explicite
    p_amount_paid, p_change_amount, p_customer_name, p_customer_phone,
    p_seller_name, p_discount_amount
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (
      sale_id, product_id, product_name, quantity, unit_price, total_price
    ) VALUES (
      v_sale_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC
    );

    UPDATE products
      SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER,
          updated_at = NOW()
      WHERE id = (v_item->>'product_id')::UUID
        AND stock_quantity >= (v_item->>'quantity')::INTEGER;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock insuffisant pour %', v_item->>'product_name';
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- create_sale_with_limit : idem (au cas où) — garde la signature
-- mais délègue à create_full_sale qui a maintenant le cast
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC
);

CREATE OR REPLACE FUNCTION public.create_sale_with_limit(
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
  p_seller_name TEXT DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_limit_ok BOOLEAN;
  v_plan_check JSONB;
  v_sale_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  v_plan_check := public.check_plan_limit('sales_this_month');
  v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);

  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de ventes mensuelles atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Délègue à create_full_sale qui fait le cast ::payment_method
  v_sale_id := public.create_full_sale(
    v_user_id, v_org_id, p_sale_number, p_subtotal, p_total_amount, p_items,
    p_tax_amount, p_payment_method, p_amount_paid, p_change_amount,
    p_customer_name, p_customer_phone, p_seller_name, p_discount_amount
  );

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- Vérification finale
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ create_full_sale recréée avec cast ::payment_method';
  RAISE NOTICE '✅ create_sale_with_limit recréée (délègue à create_full_sale)';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

COMMIT;
