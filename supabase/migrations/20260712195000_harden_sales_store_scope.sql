-- ============================================================
-- Migration : harden_sales_store_scope — rattachement vente → magasin
-- Date: 2026-07-12
-- ============================================================
-- Objectif :
--   Pour un déploiement national, chaque vente doit être rattachée
--   proprement à un magasin. Aujourd'hui create_sale_with_limit
--   n'envoie pas p_store_id → sales.store_id reste NULL.
--
-- Approche NON-BREAKING :
--   - p_store_id est OPTIONNEL (DEFAULT NULL)
--   - Si fourni : vérifier qu'il appartient à l'org de l'utilisateur
--   - Si NULL : fallback intelligent :
--     1. profiles.current_store_id
--     2. stores.is_headquarters = true pour cette org
--     3. premier store actif de l'org
--     4. NULL (mais on log via RAISE NOTICE)
--   - Insertion de store_id dans sales ET sale_items
--   - Insertion de organization_id dans sale_items
--   - Conservation du cast p_payment_method::public.payment_method
--   - Conservation de check_plan_limit('sales_this_month')
--   - Atomicité stock préservée
--
-- Sécurité :
--   - SECURITY DEFINER + search_path = public
--   - GRANT EXECUTE TO authenticated
--   - Aucune donnée supprimée
--   - Aucune colonne supprimée
--   - Rétrocompatible (anciens appels sans p_store_id marchent)
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. create_full_sale — ajout p_store_id optionnel + fallback
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC
);
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
  p_store_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_new_stock INTEGER;
  v_resolved_store_id UUID;
BEGIN
  -- ─── Résoudre store_id avec fallback intelligent ───────────────
  v_resolved_store_id := p_store_id;

  IF v_resolved_store_id IS NULL THEN
    -- 1. profiles.current_store_id
    SELECT current_store_id INTO v_resolved_store_id
    FROM public.profiles
    WHERE user_id = p_user_id
    LIMIT 1;
  END IF;

  IF v_resolved_store_id IS NULL THEN
    -- 2. magasin is_headquarters = true pour cette org
    SELECT id INTO v_resolved_store_id
    FROM public.stores
    WHERE organization_id = p_organization_id
      AND is_headquarters = true
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_resolved_store_id IS NULL THEN
    -- 3. premier store actif de l'org
    SELECT id INTO v_resolved_store_id
    FROM public.stores
    WHERE organization_id = p_organization_id
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- 4. Si toujours NULL, on log mais on n'échoue pas (rétrocompatible)
  IF v_resolved_store_id IS NULL THEN
    RAISE NOTICE '⚠️  create_full_sale: aucun store trouvé pour org % — vente rattachée à NULL', p_organization_id;
  END IF;

  -- ─── Vérifier que le store appartient à l'org (sécurité) ───────
  IF v_resolved_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = v_resolved_store_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Magasin invalide : le store_id % n''appartient pas à l''organisation %',
      v_resolved_store_id, p_organization_id;
  END IF;

  -- ─── Insertion vente (avec store_id résolu) ────────────────────
  -- ✅ cast p_payment_method::public.payment_method (fix 20260712190000)
  INSERT INTO sales (
    user_id, organization_id, store_id, sale_number, subtotal, tax_amount,
    total_amount, payment_method, amount_paid, change_amount,
    customer_name, customer_phone, seller_name, discount_amount
  ) VALUES (
    p_user_id, p_organization_id, v_resolved_store_id, p_sale_number,
    p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method::public.payment_method,
    p_amount_paid, p_change_amount,
    p_customer_name, p_customer_phone, p_seller_name, p_discount_amount
  ) RETURNING id INTO v_sale_id;

  -- ─── Insertion sale_items avec store_id + organization_id ──────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (
      sale_id, product_id, product_name, quantity, unit_price, total_price,
      organization_id, store_id
    ) VALUES (
      v_sale_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC,
      p_organization_id,
      v_resolved_store_id
    );

    -- ─── Décrémenter le stock atomiquement ───────────────────────
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
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 2. create_sale_with_limit — ajout p_store_id optionnel
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC
);
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
  p_store_id UUID DEFAULT NULL
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

  -- ✅ check_plan_limit JSONB (fix 20260712160000)
  v_plan_check := public.check_plan_limit('sales_this_month');
  v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);

  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de ventes mensuelles atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Délègue à create_full_sale avec p_store_id (résolution fallback)
  v_sale_id := public.create_full_sale(
    v_user_id, v_org_id, p_sale_number, p_subtotal, p_total_amount, p_items,
    p_tax_amount, p_payment_method, p_amount_paid, p_change_amount,
    p_customer_name, p_customer_phone, p_seller_name, p_discount_amount,
    p_store_id
  );

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. Commentaires + vérification
-- ════════════════════════════════════════════════════════════════
COMMENT ON FUNCTION public.create_full_sale(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB,
  NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID
) IS 'v4 (2026-07-12): harden_sales_store_scope — p_store_id optionnel + fallback intelligent (profiles.current_store_id → headquarters → 1er store actif → NULL). Insertion store_id + organization_id dans sale_items.';

COMMENT ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID
) IS 'v4 (2026-07-12): harden_sales_store_scope — p_store_id optionnel transmis à create_full_sale.';

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ create_full_sale v4 — p_store_id optionnel + fallback';
  RAISE NOTICE '✅ create_sale_with_limit v4 — p_store_id optionnel transmis';
  RAISE NOTICE '✅ sale_items récupère organization_id + store_id';
  RAISE NOTICE '✅ Cast p_payment_method::public.payment_method conservé';
  RAISE NOTICE '✅ check_plan_limit(''sales_this_month'') conservé';
  RAISE NOTICE '✅ Atomicité stock conservée';
  RAISE NOTICE '✅ Rétrocompatible (anciens appels sans p_store_id marchent)';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

COMMIT;
