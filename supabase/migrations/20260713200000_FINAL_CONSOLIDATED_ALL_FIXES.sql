-- ============================================================
-- MIGRATION CONSOLIDÉE FINALE — Tous les fixes critiques en 1 script
-- Date: 2026-07-13
-- ============================================================
-- Ce script combine les 3 migrations critiques à appliquer en production :
--
--   1. 20260712170000 — colonnes description, expiry_date, is_active sur products
--   2. 20260712190000 — cast p_payment_method::public.payment_method
--   3. 20260712195000 — p_store_id optionnel + fallback + sale_items store_id
--
-- + le fix du conflit de signature create_first_organization (20260713120000)
--
-- ⚠️  SAUVEGARDEZ LA DB AVANT D'EXÉCUTER (Supabase Dashboard → Backups → Create backup)
--
-- À exécuter UNE SEULE FOIS dans Supabase SQL Editor.
-- Idempotent (DROP IF EXISTS + CREATE OR REPLACE + ADD COLUMN IF NOT EXISTS).
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. Ajouter colonnes products (description, expiry_date, is_active)
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
UPDATE public.products SET is_active = true WHERE is_active IS NULL;

-- ════════════════════════════════════════════════════════════════
-- 2. Recréer create_full_sale avec cast payment_method + p_store_id
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
  v_resolved_store_id UUID;
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

  -- ✅ cast p_payment_method::public.payment_method
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
    INSERT INTO sale_items (
      sale_id, product_id, product_name, quantity, unit_price, total_price,
      organization_id, store_id
    ) VALUES (
      v_sale_id, (v_item->>'product_id')::UUID, v_item->>'product_name',
      (v_item->>'quantity')::INTEGER, (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC, p_organization_id, v_resolved_store_id
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

-- ════════════════════════════════════════════════════════════════
-- 3. Recréer create_sale_with_limit avec p_store_id
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
);
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
    p_customer_name, p_customer_phone, p_seller_name, p_discount_amount, p_store_id
  );
  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, UUID
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. Recréer create_product (p_cost_price + pattern JSONB)
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_product(
  TEXT, NUMERIC, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.create_product(
  p_name TEXT, p_price NUMERIC, p_category_id UUID DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL, p_unit TEXT DEFAULT 'unité',
  p_stock_quantity INTEGER DEFAULT 0, p_min_stock_alert INTEGER DEFAULT 5,
  p_cost_price NUMERIC DEFAULT NULL, p_supplier_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL, p_description TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL, p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID; v_user_id UUID; v_product_id UUID;
  v_limit_ok BOOLEAN; v_plan_check JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Utilisateur non authentifié'; END IF;

  v_plan_check := public.check_plan_limit('products');
  v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);
  IF NOT v_limit_ok THEN RAISE EXCEPTION 'Limite de produits atteinte'; END IF;

  IF p_store_id IS NULL THEN
    SELECT current_store_id INTO p_store_id FROM public.profiles WHERE user_id = v_user_id;
    IF p_store_id IS NULL THEN
      SELECT id INTO p_store_id FROM public.stores
      WHERE organization_id = v_org_id AND is_headquarters = true LIMIT 1;
    END IF;
  END IF;

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
-- 5. Fix conflit signature create_first_organization
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_first_organization(
  TEXT, TEXT, TEXT, public.store_category, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.create_first_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.create_first_organization(
  p_org_name TEXT, p_store_name TEXT, p_store_slug TEXT,
  p_store_category TEXT, p_country TEXT, p_currency TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID; v_org_id UUID; v_store_id UUID;
  v_existing_org_id UUID; v_limit_ok BOOLEAN; v_plan_check JSONB;
  v_store_cat public.store_category;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Utilisateur non authentifié'; END IF;

  SELECT organization_id INTO v_existing_org_id FROM public.profiles WHERE user_id = v_user_id;

  IF v_existing_org_id IS NOT NULL THEN
    v_plan_check := public.check_plan_limit('stores');
    v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);
    IF NOT v_limit_ok THEN RAISE EXCEPTION 'Limite de boutiques atteinte'; END IF;

    v_store_cat := p_store_category::public.store_category;
    INSERT INTO public.stores (organization_id, name, slug, category, country, currency, is_headquarters)
    VALUES (v_existing_org_id, p_store_name, p_store_slug, v_store_cat, p_country, p_currency, false)
    RETURNING id INTO v_store_id;
    RETURN v_store_id;
  END IF;

  ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_store_settings;
  INSERT INTO public.organizations (name, owner_user_id)
  VALUES (p_org_name, v_user_id) RETURNING id INTO v_org_id;
  ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;

  UPDATE public.profiles SET organization_id = v_org_id WHERE user_id = v_user_id;

  v_store_cat := p_store_category::public.store_category;
  INSERT INTO public.stores (organization_id, name, slug, category, country, currency, is_headquarters)
  VALUES (v_org_id, p_store_name, p_store_slug, v_store_cat, p_country, p_currency, true)
  RETURNING id INTO v_store_id;

  INSERT INTO public.subscriptions (organization_id, plan_id, status)
  VALUES (v_org_id, 'starter', 'active') ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.store_settings (organization_id, store_name)
  VALUES (v_org_id, p_store_name) ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.categories (organization_id, name, icon, color, description, sort_order, is_default, user_id)
  SELECT v_org_id, cat.name, cat.icon, cat.color, cat.description, cat.sort_order, cat.is_default, v_user_id
  FROM (VALUES
    ('Alimentation'::text, 'Package'::text, '#F59E0B'::text, 'Produits alimentaires'::text, 1::int, true::boolean),
    ('Boissons', 'Coffee', '#3B82F6', 'Boissons et jus', 2, true),
    ('Quincaillerie', 'Wrench', '#6B7280', 'Outils et quincaillerie', 3, true),
    ('Ménager', 'Home', '#10B981', 'Produits d''entretien ménager', 4, true),
    ('Textile', 'Shirt', '#8B5CF6', 'Vêtements et tissus', 5, true),
    ('Électroménager', 'Zap', '#EF4444', 'Appareils électroménagers', 6, true),
    ('Papeterie', 'FileText', '#06B6D4', 'Fournitures de bureau', 7, true),
    ('Hygiène', 'Heart', '#EC4899', 'Produits d''hygiène', 8, true),
    ('Cosmétique', 'Sparkles', '#F97316', 'Produits cosmétiques', 9, true),
    ('Divers', 'Package', '#6366F1', 'Autres produits', 10, true)
  ) AS cat(name, icon, color, description, sort_order, is_default)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories WHERE organization_id = v_org_id AND name = cat.name
  );

  RETURN v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_first_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 6. Vérification finale
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_desc_exists BOOLEAN; v_expiry_exists BOOLEAN; v_active_exists BOOLEAN;
  v_create_product_exists BOOLEAN; v_create_sale_exists BOOLEAN;
  v_check_plan_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='description') INTO v_desc_exists;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='expiry_date') INTO v_expiry_exists;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='is_active') INTO v_active_exists;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname='create_product') INTO v_create_product_exists;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname='create_sale_with_limit') INTO v_create_sale_exists;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname='check_plan_limit') INTO v_check_plan_exists;

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ VÉRIFICATION POST-MIGRATION';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Colonne products.description : %', CASE WHEN v_desc_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE 'Colonne products.expiry_date  : %', CASE WHEN v_expiry_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE 'Colonne products.is_active    : %', CASE WHEN v_active_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE 'Fonction create_product       : %', CASE WHEN v_create_product_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE 'Fonction create_sale_with_limit : %', CASE WHEN v_create_sale_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE 'Fonction check_plan_limit     : %', CASE WHEN v_check_plan_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '═══════════════════════════════════════════════════════';

  IF NOT v_desc_exists OR NOT v_create_product_exists OR NOT v_create_sale_exists THEN
    RAISE EXCEPTION '❌ Migration incomplète';
  END IF;
END $$;

COMMIT;
