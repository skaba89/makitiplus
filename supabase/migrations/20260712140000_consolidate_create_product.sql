-- ============================================================
-- Migration : consolider create_product avec la bonne signature
-- Date: 2026-07-12
-- ============================================================
-- Objectif:
--   Le frontend appelait create_product avec p_buy_price mais la DB
--   attendait p_cost_price → erreur "function not found in schema cache".
--   Cette migration recrée la fonction avec p_cost_price (signature correcte)
--   pour s'assurer qu'elle existe en DB après application.
--
-- Sécurité:
--   - DROP FUNCTION IF EXISTS avant CREATE (idempotent)
--   - SECURITY DEFINER + search_path = public
--   - GRANT EXECUTE TO authenticated
--   - check_plan_limit pour empêcher le bypass de quota
-- ============================================================

-- Drop existing signature(s) to avoid conflicts
DROP FUNCTION IF EXISTS public.create_product(
  TEXT, NUMERIC, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, BOOLEAN
);
-- Drop the (incorrect) signature with p_buy_price if it ever existed
DROP FUNCTION IF EXISTS public.create_product(
  TEXT, NUMERIC, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.create_product(
  p_name TEXT,
  p_price NUMERIC,
  p_category_id UUID DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL,
  p_unit TEXT DEFAULT 'unité',
  p_stock_quantity INTEGER DEFAULT 0,
  p_min_stock_alert INTEGER DEFAULT 5,
  p_cost_price NUMERIC DEFAULT NULL,
  p_supplier_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_product_id UUID;
  v_limit_ok BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  -- Enforce plan limit (server-side source of truth)
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('products') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de produits atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Determine store_id: use provided, or user's current store, or org headquarters
  IF p_store_id IS NULL THEN
    SELECT current_store_id INTO p_store_id FROM public.profiles WHERE user_id = v_user_id;
    IF p_store_id IS NULL THEN
      SELECT id INTO p_store_id FROM public.stores
      WHERE organization_id = v_org_id AND is_headquarters = true
      LIMIT 1;
    END IF;
  END IF;

  -- Verify store belongs to org
  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Magasin invalide';
  END IF;

  -- Validate required fields
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Le nom du produit est obligatoire';
  END IF;

  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Le prix doit être un nombre positif';
  END IF;

  IF p_stock_quantity IS NULL OR p_stock_quantity < 0 THEN
    RAISE EXCEPTION 'La quantité en stock doit être positive';
  END IF;

  -- Insert product
  INSERT INTO public.products (
    organization_id, name, price, category_id, barcode, unit,
    stock_quantity, min_stock_alert, cost_price, supplier_id,
    store_id, description, image_url, is_active, user_id
  ) VALUES (
    v_org_id, p_name, p_price, p_category_id, p_barcode, p_unit,
    p_stock_quantity, p_min_stock_alert, p_cost_price, p_supplier_id,
    p_store_id, p_description, p_image_url, p_is_active, v_user_id
  ) RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_product(
  TEXT, NUMERIC, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, BOOLEAN
) TO authenticated;

COMMENT ON FUNCTION public.create_product(
  TEXT, NUMERIC, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, BOOLEAN
) IS 'v2 (2026-07-12): signature canonique avec p_cost_price. Le frontend Products.tsx appelle maintenant avec p_cost_price (et non p_buy_price).';

-- ════════════════════════════════════════════════════════════════
-- Vérification : s'assurer que get_user_organization_id existe
-- (dépendance de create_product)
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_user_organization_id'
  ) THEN
    RAISE WARNING '⚠️  get_user_organization_id() n''existe pas — create_product échouera';
  END IF;
END $$;
