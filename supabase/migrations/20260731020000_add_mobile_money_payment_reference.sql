-- ════════════════════════════════════════════════════════════════
-- Ajout d'une référence de transaction Mobile Money optionnelle sur
-- les ventes (audit stratégique, docs/production/
-- STRATEGIC_AUDIT_AFRICA_WORLD_LEADER.md §3.3 — "mobile money manuel").
--
-- Constat : payment_method (wave/orange_money/mtn_money/moov_money/
-- mpesa) n'est qu'une étiquette — aucune trace du numéro de
-- transaction/référence envoyé par l'opérateur n'est conservée.
-- Aucune intégration API réelle avec les opérateurs n'existe (et n'est
-- prévue ici) : ce champ est une preuve de paiement déclarative, saisie
-- manuellement par le vendeur, pas une vérification automatique.
--
-- Additif et rétrocompatible :
--   - Colonne NULLABLE sans DEFAULT contraignant -- aucune vente
--     existante (y compris Diallo & Frères) n'est affectée.
--   - Nouveau paramètre p_payment_reference ajouté EN DERNIÈRE
--     position avec DEFAULT NULL sur create_full_sale et
--     create_sale_with_limit -- toute mutation offline déjà en file
--     d'attente IndexedDB (ancien format de payload, sans ce
--     paramètre) continue de fonctionner sans modification à la
--     synchronisation.
-- ════════════════════════════════════════════════════════════════

-- 1. Colonne additive
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

COMMENT ON COLUMN public.sales.payment_reference IS
  'Référence/numéro de transaction Mobile Money saisi manuellement par le vendeur (preuve de paiement déclarative, aucune vérification API opérateur).';

-- 2. create_full_sale : accepter et stocker la référence
--
-- DROP requis avant CREATE OR REPLACE : Postgres identifie une fonction
-- par son nom + la liste de TYPES de ses paramètres. Ajouter un 16e
-- paramètre en fin de liste ne "remplace" pas la version à 15
-- paramètres -- ça crée une DEUXIÈME fonction surchargée, ce qui rend
-- tout appel avec exactement 15 arguments nommés ambigu pour PostgREST
-- ("function is not unique"). Pattern déjà établi dans ce dépôt --
-- voir 20260712120000_add_discount_amount_to_sale_rpc.sql et
-- 20260712195000_harden_sales_store_scope.sql.
DROP FUNCTION IF EXISTS public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID
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
    INSERT INTO sales (
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
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID, TEXT
) TO authenticated;

-- 3. create_sale_with_limit : accepter et relayer la référence
DROP FUNCTION IF EXISTS public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID
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
  p_discount_amount NUMERIC DEFAULT 0,
  p_store_id UUID DEFAULT NULL,
  p_payment_reference TEXT DEFAULT NULL
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
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Utilisateur non authentifié'; END IF;

  v_plan_check := public.check_plan_limit('sales_this_month');
  v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de ventes mensuelles atteinte';
  END IF;

  v_sale_id := public.create_full_sale(
    v_user_id, v_org_id, p_sale_number, p_subtotal, p_total_amount, p_items,
    p_tax_amount, p_payment_method, p_amount_paid, p_change_amount,
    p_customer_name, p_customer_phone, p_seller_name, p_discount_amount, p_store_id,
    p_payment_reference
  );
  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID, TEXT
) TO authenticated;
