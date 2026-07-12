-- ============================================================
-- Migration : add discount_amount to create_sale_with_limit + create_full_sale
-- Date: 2026-07-12
-- ============================================================
-- Objectif:
--   Persister le montant de la remise (discount_amount) en DB
--   lors de la création d'une vente, pour :
--   - Permettre le suivi des remises dans les rapports
--   - Justifier l'écart entre subtotal et total_amount
--   - Éviter les incohérences (subtotal - total ≠ 0 sans trace)
--
-- Sécurité:
--   - DROP FUNCTION IF EXISTS avant CREATE (signature change)
--   - SECURITY DEFINER + search_path = public (anti-search-path injection)
--   - GRANT EXECUTE TO authenticated
--   - p_discount_amount est DEFAULT 0 (rétro-compatible)
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. create_full_sale — ajouter p_discount_amount + persister en DB
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
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
  v_previous_stock INTEGER;
BEGIN
  -- 1. Insert sale — inclure discount_amount
  INSERT INTO sales (
    user_id, organization_id, sale_number, subtotal, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, customer_name, customer_phone,
    seller_name, discount_amount
  ) VALUES (
    p_user_id, p_organization_id, p_sale_number, p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method, p_amount_paid, p_change_amount, p_customer_name, p_customer_phone,
    p_seller_name, p_discount_amount
  ) RETURNING id INTO v_sale_id;

  -- 2. Insert sale items + décrémenter le stock atomiquement
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

    -- Décrémenter le stock (race-condition-safe via UPDATE ... WHERE stock_quantity >= qty)
    UPDATE products
      SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER,
          updated_at = NOW()
      WHERE id = (v_item->>'product_id')::UUID
        AND stock_quantity >= (v_item->>'quantity')::INTEGER
      RETURNING stock_quantity INTO v_new_stock;

    -- Si aucune ligne mise à jour, c'est que le stock était insuffisant
    IF NOT FOUND THEN
      SELECT stock_quantity INTO v_previous_stock
        FROM products WHERE id = (v_item->>'product_id')::UUID;
      RAISE EXCEPTION 'Stock insuffisant pour %: demande=%, disponible=%',
        v_item->>'product_name',
        (v_item->>'quantity')::INTEGER,
        COALESCE(v_previous_stock, 0);
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
-- 2. create_sale_with_limit — wrapper avec p_discount_amount
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
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

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('sales_this_month') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de ventes mensuelles atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Déléguer à create_full_sale en passant p_discount_amount
  v_sale_id := public.create_full_sale(
    v_user_id,
    v_org_id,
    p_sale_number,
    p_subtotal,
    p_total_amount,
    p_items,
    p_tax_amount,
    p_payment_method,
    p_amount_paid,
    p_change_amount,
    p_customer_name,
    p_customer_phone,
    p_seller_name,
    p_discount_amount
  );

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. Commentaire de migration
-- ════════════════════════════════════════════════════════════════
COMMENT ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC
) IS 'v2 (2026-07-12): ajoute p_discount_amount (DEFAULT 0) pour persister la remise en DB.';

COMMENT ON FUNCTION public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC
) IS 'v2 (2026-07-12): ajoute p_discount_amount (DEFAULT 0) pour persister la remise en DB.';

-- ════════════════════════════════════════════════════════════════
-- Done — discount_amount est maintenant persisté sur chaque vente
-- ════════════════════════════════════════════════════════════════
