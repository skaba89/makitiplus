-- ════════════════════════════════════════════════════════════════
-- Fix: create_full_sale — snapshot cost_price jamais exécuté (overload orphelin)
-- Date: 2026-07-20
--
-- Bug: 20260719140000_update_create_full_sale_cost_price.sql a redéfini
-- create_full_sale avec une signature à 11 paramètres (TEXT, NUMERIC, ...)
-- pour y ajouter le snapshot de cost_price. Mais la seule fonction
-- réellement appelée par l'app — create_sale_with_limit
-- (20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql) — appelle
-- create_full_sale positionnellement avec 15 arguments
-- (UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB, ...). PostgreSQL ne
-- remplace une fonction que si la signature est identique : avec une
-- signature différente, CREATE OR REPLACE crée une DEUXIÈME fonction
-- séparée au lieu de modifier la première. Le wrapper continue donc
-- d'appeler la version à 15 paramètres du 13/07, qui n'a jamais eu la
-- logique cost_price. La version à 11 paramètres du 19/07 n'est jamais
-- appelée par l'application (vérifié : aucun appel direct à
-- create_full_sale dans src/, tout passe par create_sale_with_limit).
--
-- Conséquence : chaque sale_items créé depuis le 19/07 a cost_price = 0
-- (valeur par défaut de la colonne), donc marge brute = 100% du CA dans
-- toutes les KPI qui dépendent de sale_items.cost_price.
--
-- Fix: fusionner le snapshot cost_price dans la version à 15 paramètres
-- réellement appelée, et supprimer l'overload orphelin à 11 paramètres.
-- ════════════════════════════════════════════════════════════════

-- 1. Supprimer l'overload orphelin (jamais appelé, source de confusion)
DROP FUNCTION IF EXISTS public.create_full_sale(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
);

-- 2. Recréer la version à 15 paramètres (réellement utilisée) avec le
--    snapshot cost_price ajouté à l'insertion de sale_items.
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
  p_discount_amount NUMERIC DEFAULT 0,
  p_store_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_resolved_store_id UUID;
  v_product_cost_price NUMERIC;
BEGIN
  -- Résoudre store_id avec fallback
  v_resolved_store_id := p_store_id;
  IF v_resolved_store_id IS NULL THEN
    SELECT current_store_id INTO v_resolved_store_id
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  END IF;
  IF v_resolved_store_id IS NULL THEN
    SELECT id INTO v_resolved_store_id
    FROM public.stores
    WHERE organization_id = p_organization_id AND is_headquarters = true AND is_active = true
    LIMIT 1;
  END IF;
  IF v_resolved_store_id IS NULL THEN
    SELECT id INTO v_resolved_store_id
    FROM public.stores
    WHERE organization_id = p_organization_id AND is_active = true
    ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Vérifier que le store appartient à l'org
  IF v_resolved_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores WHERE id = v_resolved_store_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Magasin invalide';
  END IF;

  INSERT INTO sales (
    user_id, organization_id, store_id, sale_number, subtotal, tax_amount,
    total_amount, payment_method, amount_paid, change_amount, customer_name,
    customer_phone, seller_name, discount_amount
  ) VALUES (
    p_user_id, p_organization_id, v_resolved_store_id, p_sale_number,
    p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method::public.payment_method,
    p_amount_paid, p_change_amount, p_customer_name, p_customer_phone,
    p_seller_name, p_discount_amount
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Récupérer le cost_price du produit au moment de la vente (snapshot)
    SELECT COALESCE(cost_price, 0) INTO v_product_cost_price
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND organization_id = p_organization_id;

    INSERT INTO sale_items (
      sale_id, product_id, product_name, quantity, unit_price, total_price,
      cost_price, organization_id, store_id
    ) VALUES (
      v_sale_id, (v_item->>'product_id')::UUID, v_item->>'product_name',
      (v_item->>'quantity')::INTEGER, (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC, COALESCE(v_product_cost_price, 0),
      p_organization_id, v_resolved_store_id
    );

    UPDATE products
      SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER, updated_at = NOW()
      WHERE id = (v_item->>'product_id')::UUID AND stock_quantity >= (v_item->>'quantity')::INTEGER;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock insuffisant pour %', v_item->>'product_name';
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID
) TO authenticated;

-- Note: les sale_items créés entre le 19/07 et l'application de ce
-- correctif ont cost_price = 0 à tort (voir backfill optionnel séparé :
-- 20260720151000_OPTIONAL_backfill_sale_items_cost_price.sql).
