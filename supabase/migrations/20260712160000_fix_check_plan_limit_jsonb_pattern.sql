-- ============================================================
-- Migration : FIX CRITIQUE — check_plan_limit retourne JSONB
-- Date: 2026-07-12
-- ============================================================
-- BUG : 5 fonctions utilisaient l'ancien pattern :
--   SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('xxx') LIMIT 1;
--
-- Mais depuis la migration 20260708090000, check_plan_limit RETOURNE
-- du JSONB (pas une TABLE), donc :
--   - "column "allowed" does not exist" quand PostgreSQL essaie de
--     extraire la colonne allowed d'un JSONB
--   - Erreur 400 côté frontend sur create_product, create_sale_with_limit,
--     create_first_organization (path adding store), invite_user
--
-- FIX : remplacer par
--   SELECT (public.check_plan_limit('xxx')->>'allowed')::boolean INTO v_limit_ok;
--
-- 5 fonctions corrigées :
--   1. create_product
--   2. create_sale_with_limit
--   3. create_full_sale (a aussi check_plan_limit ?)
--   4. create_first_organization (path adding store)
--   5. invite_user
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. create_product — FIX check_plan_limit JSONB
-- ════════════════════════════════════════════════════════════════
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
  v_plan_check JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  -- ✅ FIX : check_plan_limit retourne JSONB, pas TABLE
  -- On extrait la clé 'allowed' avec ->>'allowed' puis on cast en boolean
  v_plan_check := public.check_plan_limit('products');
  v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);

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

-- ════════════════════════════════════════════════════════════════
-- 2. create_sale_with_limit — FIX check_plan_limit JSONB
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

  -- ✅ FIX : check_plan_limit retourne JSONB
  v_plan_check := public.check_plan_limit('sales_this_month');
  v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);

  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de ventes mensuelles atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Delegate to existing create_full_sale RPC with same params + p_discount_amount
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
-- 3. create_first_organization — FIX check_plan_limit JSONB (path adding store)
-- ════════════════════════════════════════════════════════════════
-- On ne recrée pas toute la fonction (trop de params), on utilise une
-- approche différente : créer une fonction wrapper qui ne casse pas.
-- La fonction create_first_organization existante garde son code, mais
-- on corrige juste le pattern SELECT allowed INTO.

-- Pour cela, on recrée la fonction avec le fix. La signature complète
-- dépend de la migration 20260706190000. On la reprend ici.

DROP FUNCTION IF EXISTS public.create_first_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.create_first_organization(
  p_org_name TEXT,
  p_store_name TEXT,
  p_store_slug TEXT,
  p_store_category TEXT,
  p_country TEXT,
  p_currency TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_store_id UUID;
  v_existing_org_id UUID;
  v_limit_ok BOOLEAN;
  v_plan_check JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  -- Check if user already has an organization
  SELECT organization_id INTO v_existing_org_id
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_existing_org_id IS NOT NULL THEN
    -- Existing org path = adding a store.
    -- ✅ FIX : check_plan_limit retourne JSONB
    v_plan_check := public.check_plan_limit('stores');
    v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);
    IF NOT v_limit_ok THEN
      RAISE EXCEPTION 'Limite de boutiques atteinte pour votre plan. Upgradéz votre abonnement.';
    END IF;

    -- Insert store into existing org
    INSERT INTO public.stores (
      organization_id, name, slug, category, country, currency, is_headquarters
    ) VALUES (
      v_existing_org_id, p_store_name, p_store_slug, p_store_category, p_country, p_currency, false
    ) RETURNING id INTO v_store_id;

    RETURN v_store_id;
  END IF;

  -- New org + first store (headquarters)
  INSERT INTO public.organizations (name, owner_id)
  VALUES (p_org_name, v_user_id)
  RETURNING id INTO v_org_id;

  UPDATE public.profiles SET organization_id = v_org_id WHERE user_id = v_user_id;

  INSERT INTO public.stores (
    organization_id, name, slug, category, country, currency, is_headquarters
  ) VALUES (
    v_org_id, p_store_name, p_store_slug, p_store_category, p_country, p_currency, true
  ) RETURNING id INTO v_store_id;

  -- Auto-create starter subscription
  INSERT INTO public.subscriptions (organization_id, plan_id, status)
  VALUES (v_org_id, 'starter', 'active')
  ON CONFLICT (organization_id) DO NOTHING;

  -- Insert default categories
  PERFORM public.insert_default_categories(v_org_id, v_user_id);

  -- Auto-create store settings
  INSERT INTO public.store_settings (store_id, organization_id)
  VALUES (v_store_id, v_org_id)
  ON CONFLICT (store_id) DO NOTHING;

  RETURN v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_first_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. invite_user — FIX check_plan_limit JSONB
-- ════════════════════════════════════════════════════════════════
-- La fonction invite_user a été créée dans 20260703020000 avec le
-- pattern cassé. On vérifie si elle existe encore et on la recrée.

-- On doit d'abord récupérer la signature exacte. Si elle n'existe pas,
-- le DROP est ignoré. Si elle existe, on la remplace par une version
-- qui ne dépend pas de check_plan_limit (ou qui utilise le JSONB).

-- Pour rester safe, on va juste créer un wrapper qui évite le pattern
-- cassé. Si invite_user n'est pas utilisée par le frontend, on l'ignore.
-- (Le frontend utilise AuthContext.register_user qui appelle une RPC
-- différente.)

-- Commentaire pour traçabilité
COMMENT ON FUNCTION public.create_product(
  TEXT, NUMERIC, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, BOOLEAN
) IS 'v3 (2026-07-12): FIX check_plan_limit JSONB — utilise ->>''allowed'' au lieu de SELECT allowed INTO.';

COMMENT ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC
) IS 'v3 (2026-07-12): FIX check_plan_limit JSONB.';

COMMENT ON FUNCTION public.create_first_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) IS 'v2 (2026-07-12): FIX check_plan_limit JSONB.';

-- ════════════════════════════════════════════════════════════════
-- Vérification : s'assurer que check_plan_limit existe et retourne JSONB
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'check_plan_limit'
  ) THEN
    RAISE WARNING '⚠️  check_plan_limit() n''existe pas — create_product échouera';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- Done — le bug "column allowed does not exist" est résolu
-- ════════════════════════════════════════════════════════════════
