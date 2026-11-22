-- P0: enforce product/store scope; requires staging inventory and CI validation.
-- P0: preserve the current signature and all sale fields; scope writes to the authenticated tenant.
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
  p_store_id UUID DEFAULT NULL,
  p_payment_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_resolved_store_id UUID;
  v_product_cost_price NUMERIC;
  v_existing_sale_id UUID;
BEGIN
  -- Authorize before the idempotency lookup or any write.
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()
     OR p_organization_id IS NULL
     OR p_organization_id IS DISTINCT FROM public.get_user_organization_id()
     OR NOT public.is_member_of_organization(p_organization_id) THEN
    RAISE EXCEPTION 'Accès refusé à cette organisation' USING ERRCODE = '42501';
  END IF;

  -- Idempotence : si une vente avec ce sale_number existe déjà pour cette
  -- organisation (replay d'une mutation offline après un succès serveur
  -- dont la réponse a été perdue), renvoyer son id sans rien recréer.
  SELECT id INTO v_existing_sale_id
  FROM public.sales
  WHERE organization_id = p_organization_id AND sale_number = p_sale_number;

  IF v_existing_sale_id IS NOT NULL THEN
    RETURN v_existing_sale_id;
  END IF;

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

  -- Garde-fou supplémentaire : si deux requêtes concurrentes passent le
  -- SELECT ci-dessus en même temps (fenêtre de course très étroite), la
  -- contrainte UNIQUE fait échouer l'une des deux insertions — on
  -- retombe alors sur la vente de l'autre plutôt que de propager l'erreur.
  BEGIN
    INSERT INTO public.sales (
      user_id, organization_id, store_id, sale_number, subtotal, tax_amount,
      total_amount, payment_method, amount_paid, change_amount, customer_name,
      customer_phone, seller_name, discount_amount, payment_reference
    ) VALUES (
      p_user_id, p_organization_id, v_resolved_store_id, p_sale_number,
      p_subtotal, p_tax_amount, p_total_amount,
      p_payment_method::public.payment_method,
      p_amount_paid, p_change_amount, p_customer_name, p_customer_phone,
      p_seller_name, p_discount_amount, NULLIF(TRIM(p_payment_reference), '')
    ) RETURNING id INTO v_sale_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_sale_id
    FROM public.sales
    WHERE organization_id = p_organization_id AND sale_number = p_sale_number;
    RETURN v_sale_id;
  END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Récupérer le cost_price du produit au moment de la vente (snapshot)
    SELECT COALESCE(cost_price, 0) INTO v_product_cost_price
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
      AND organization_id = p_organization_id AND store_id IS NOT DISTINCT FROM v_resolved_store_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produit hors organisation ou inexistant' USING ERRCODE = '42501';
    END IF;
    IF COALESCE((v_item->>'quantity')::INTEGER, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantité positive requise' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.sale_items (
      sale_id, product_id, product_name, quantity, unit_price, total_price,
      cost_price, organization_id, store_id
    ) VALUES (
      v_sale_id, (v_item->>'product_id')::UUID, v_item->>'product_name',
      (v_item->>'quantity')::INTEGER, (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC, COALESCE(v_product_cost_price, 0),
      p_organization_id, v_resolved_store_id
    );

    UPDATE public.products
      SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER, updated_at = NOW()
      WHERE id = (v_item->>'product_id')::UUID
        AND organization_id = p_organization_id AND store_id IS NOT DISTINCT FROM v_resolved_store_id AND stock_quantity >= (v_item->>'quantity')::INTEGER;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock insuffisant pour %', v_item->>'product_name';
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

-- Only the existing SECURITY DEFINER wrappers may call this internal helper.
REVOKE EXECUTE ON FUNCTION public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
