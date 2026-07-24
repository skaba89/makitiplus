-- ════════════════════════════════════════════════════════════════
-- Fix: idempotence de la création de vente — doublon possible sur
-- reconnexion instable
-- Date: 2026-07-23 — P3 (gap-closing)
--
-- Bug : aucune contrainte UNIQUE sur sales.sale_number (vérifié via
-- pg_constraint et pg_indexes — seule la PK sur id est unique). Le
-- commentaire d'en-tête de src/lib/syncConflictResolver.ts documente
-- une hypothèse d'unicité jamais réellement implémentée ("Ventes : pas
-- de conflit possible, chaque vente a un sale_number unique côté
-- appareil → on insère simplement, et on logge si un doublon est
-- détecté" — aucune détection de doublon n'existe nulle part).
--
-- create_full_sale insère une nouvelle ligne sales + décrémente le stock
-- à CHAQUE appel, sans vérifier si une vente portant le même sale_number
-- existe déjà. getPendingMutations() (offlineQueue.ts) inclut les
-- mutations "failed" dans le lot rejoué à CHAQUE synchronisation
-- automatique (déclenchée à chaque transition offline→online, y compris
-- sur connexions instables — cas explicitement visé par ce projet,
-- 3G/4G ouest-africaine). Scénario concret : la requête RPC atteint le
-- serveur et commit, mais la réponse est perdue avant d'arriver au
-- client → mutation marquée "failed" → prochaine reconnexion la rejoue
-- automatiquement → DEUXIÈME vente créée avec le même sale_number, stock
-- décrémenté deux fois.
--
-- Vérifié : aucun doublon (organization_id, sale_number) existant en
-- base (SELECT ... GROUP BY ... HAVING COUNT(*) > 1 → 0 ligne) — l'ajout
-- de la contrainte est donc sûr, aucun backfill nécessaire.
--
-- Fix : contrainte UNIQUE sur (organization_id, sale_number) + gestion
-- explicite du cas de conflit dans create_full_sale — au lieu de laisser
-- l'INSERT échouer avec une erreur brute de contrainte violée (qui
-- laisserait le sync marquer la mutation "failed" indéfiniment), on
-- détecte le doublon AVANT d'insérer et on renvoie l'id de la vente
-- existante : un replay redevient un no-op réussi plutôt qu'un doublon
-- ou une erreur permanente. Le stock n'est décrémenté que lors du tout
-- premier appel réussi (la boucle articles est sautée si la vente
-- existe déjà).
-- ════════════════════════════════════════════════════════════════

-- 1. Contrainte UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS sales_org_sale_number_unique
  ON public.sales (organization_id, sale_number);

-- 2. create_full_sale : détecter le doublon avant insertion
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
      customer_phone, seller_name, discount_amount
    ) VALUES (
      p_user_id, p_organization_id, v_resolved_store_id, p_sale_number,
      p_subtotal, p_tax_amount, p_total_amount,
      p_payment_method::public.payment_method,
      p_amount_paid, p_change_amount, p_customer_name, p_customer_phone,
      p_seller_name, p_discount_amount
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
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID
) TO authenticated;
