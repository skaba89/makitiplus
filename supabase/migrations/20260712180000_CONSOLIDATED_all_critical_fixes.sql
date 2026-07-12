-- ============================================================
-- Migration CONSOLIDÉE — un seul fichier pour tous les fixes critiques
-- Date: 2026-07-12
-- ============================================================
-- Ce fichier combine les 4 migrations précédentes en un seul script
-- à appliquer UNE SEULE FOIS dans Supabase SQL Editor :
--
--   1. Fix create_product signature (p_cost_price au lieu de p_buy_price)
--   2. Fix check_plan_limit JSONB pattern (->>'allowed' au lieu de SELECT allowed INTO)
--   3. Add columns description / expiry_date / is_active à la table products
--   4. Fix create_sale_with_limit (p_discount_amount + JSONB pattern)
--   5. Fix create_first_organization (JSONB pattern pour path adding store)
--   6. Stubs pour RPCs manquants (generate_sale_number, WhatsApp, Stripe)
--
-- ⚠️  IMPORTANT : si vous avez déjà appliqué certaines des migrations
--     individuelles (20260712120000 à 20260712170000), PAS DE SOUCI :
--     ce script utilise DROP FUNCTION IF EXISTS + CREATE OR REPLACE +
--     ADD COLUMN IF NOT EXISTS — il est idempotent.
-- ============================================================

BEGIN; -- transaction unique — si une erreur survient, tout est annulé

-- ════════════════════════════════════════════════════════════════
-- ÉTAPE 1 : Ajouter les colonnes manquantes à products
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Tous les produits existants sont actifs par défaut
UPDATE public.products SET is_active = true WHERE is_active IS NULL;

-- ════════════════════════════════════════════════════════════════
-- ÉTAPE 2 : Recréer create_product avec la BONNE signature + JSONB
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

  -- ✅ check_plan_limit retourne JSONB, on utilise ->>'allowed'
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

  -- Insert product (la colonne description existe maintenant grâce à l'étape 1)
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
-- ÉTAPE 3 : Recréer create_sale_with_limit avec p_discount_amount + JSONB
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
);
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
-- ÉTAPE 4 : Recréer create_full_sale avec p_discount_amount
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
  INSERT INTO sales (
    user_id, organization_id, sale_number, subtotal, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, customer_name, customer_phone,
    seller_name, discount_amount
  ) VALUES (
    p_user_id, p_organization_id, p_sale_number, p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method, p_amount_paid, p_change_amount, p_customer_name, p_customer_phone,
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
-- ÉTAPE 5 : Recréer create_first_organization avec JSONB pattern
-- ════════════════════════════════════════════════════════════════
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

  SELECT organization_id INTO v_existing_org_id
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_existing_org_id IS NOT NULL THEN
    -- Existing org path = adding a store
    v_plan_check := public.check_plan_limit('stores');
    v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);
    IF NOT v_limit_ok THEN
      RAISE EXCEPTION 'Limite de boutiques atteinte pour votre plan. Upgradéz votre abonnement.';
    END IF;

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

  INSERT INTO public.subscriptions (organization_id, plan_id, status)
  VALUES (v_org_id, 'starter', 'active')
  ON CONFLICT (organization_id) DO NOTHING;

  PERFORM public.insert_default_categories(v_org_id, v_user_id);

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
-- ÉTAPE 6 : Stubs pour RPCs manquants
-- ════════════════════════════════════════════════════════════════

-- generate_sale_number — accessible à authenticated (était service_role only)
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_year TEXT;
  v_count INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.sales
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  RETURN 'VTE-' || v_year || '-' || LPAD(v_count::TEXT, 6, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_sale_number() TO authenticated;

-- WhatsApp stubs (feature non déployée)
CREATE OR REPLACE FUNCTION public.get_whatsapp_config()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$ BEGIN RETURN NULL; END; $$;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_config() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_whatsapp_stats()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'total_sent', 0, 'total_delivered', 0, 'total_failed', 0,
    'today_sent', 0, 'receipts', 0, 'custom', 0, 'is_configured', false
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_whatsapp_config(
  p_phone_number_id TEXT DEFAULT NULL,
  p_business_account_id TEXT DEFAULT NULL,
  p_access_token TEXT DEFAULT NULL,
  p_whatsapp_phone TEXT DEFAULT NULL,
  p_auto_send_receipt BOOLEAN DEFAULT false,
  p_auto_send_message TEXT DEFAULT NULL,
  p_template_language TEXT DEFAULT 'fr',
  p_template_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN RETURN false; END; $$;
GRANT EXECUTE ON FUNCTION public.save_whatsapp_config(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT
) TO authenticated;

-- Stripe stubs (feature non déployée en Afrique)
CREATE OR REPLACE FUNCTION public.get_stripe_customer()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$ BEGIN RETURN NULL; END; $$;
GRANT EXECUTE ON FUNCTION public.get_stripe_customer() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_history(p_limit INTEGER DEFAULT 10)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$ BEGIN RETURN '[]'::JSONB; END; $$;
GRANT EXECUTE ON FUNCTION public.get_payment_history(INTEGER) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- ÉTAPE 7 : Enrichir get_reports_stats avec marge brute + remises
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_reports_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_reports_stats(
  p_organization_id UUID,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_sales NUMERIC := 0;
  v_total_transactions BIGINT := 0;
  v_total_expenses NUMERIC := 0;
  v_expense_count BIGINT := 0;
  v_total_discount NUMERIC := 0;
  v_total_cost NUMERIC := 0;
  v_gross_margin NUMERIC := 0;
  v_gross_margin_pct NUMERIC := 0;
  v_payment_breakdown JSONB;
  v_daily_sales JSONB;
  v_top_products JSONB;
BEGIN
  SELECT
    COALESCE(SUM(total_amount), 0),
    COUNT(*),
    COALESCE(SUM(COALESCE(discount_amount, 0)), 0)
  INTO v_total_sales, v_total_transactions, v_total_discount
  FROM sales
  WHERE organization_id = p_organization_id
    AND created_at >= p_start AND created_at <= p_end;

  SELECT COALESCE(SUM(COALESCE(p.cost_price, 0) * si.quantity), 0)
  INTO v_total_cost
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  LEFT JOIN products p ON p.id = si.product_id
  WHERE s.organization_id = p_organization_id
    AND s.created_at >= p_start AND s.created_at <= p_end;

  v_gross_margin := v_total_sales - v_total_cost;
  IF v_total_sales > 0 THEN
    v_gross_margin_pct := ROUND((v_gross_margin / v_total_sales) * 100, 2);
  END IF;

  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_expenses, v_expense_count
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= p_start::date AND expense_date <= p_end::date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('method', payment_method, 'value', method_total)), '[]'::jsonb)
  INTO v_payment_breakdown
  FROM (
    SELECT payment_method, SUM(total_amount) AS method_total
    FROM sales WHERE organization_id = p_organization_id
      AND created_at >= p_start AND created_at <= p_end
    GROUP BY payment_method
  ) sub;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day::text, 'sales', day_total, 'transactions', day_count)), '[]'::jsonb)
  INTO v_daily_sales
  FROM (
    SELECT d.day::text, COALESCE(SUM(s.total_amount), 0) AS day_total, COUNT(s.id) AS day_count
    FROM generate_series(p_start::date, p_end::date, '1 day'::interval) AS d(day)
    LEFT JOIN sales s ON s.organization_id = p_organization_id
      AND s.created_at >= d.day AND s.created_at < d.day + interval '1 day'
    GROUP BY d.day ORDER BY d.day
  ) daily;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', product_name, 'quantity', total_qty, 'revenue', total_rev)), '[]'::jsonb)
  INTO v_top_products
  FROM (
    SELECT si.product_name, SUM(si.quantity) AS total_qty, SUM(si.total_price) AS total_rev
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_organization_id
      AND s.created_at >= p_start AND s.created_at <= p_end
    GROUP BY si.product_name ORDER BY total_qty DESC LIMIT 5
  ) top;

  RETURN jsonb_build_object(
    'totalSales', v_total_sales,
    'totalTransactions', v_total_transactions,
    'totalExpenses', v_total_expenses,
    'expenseCount', v_expense_count,
    'totalDiscount', v_total_discount,
    'totalCost', v_total_cost,
    'grossMargin', v_gross_margin,
    'grossMarginPct', v_gross_margin_pct,
    'paymentBreakdown', v_payment_breakdown,
    'dailySales', v_daily_sales,
    'topProducts', v_top_products
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_reports_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- ÉTAPE 8 : VÉRIFICATION FINALE — affiche un message clair
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_desc_exists BOOLEAN;
  v_expiry_exists BOOLEAN;
  v_active_exists BOOLEAN;
  v_create_product_exists BOOLEAN;
  v_create_sale_exists BOOLEAN;
  v_check_plan_exists BOOLEAN;
BEGIN
  -- Vérifier les colonnes
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='description'
  ) INTO v_desc_exists;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='expiry_date'
  ) INTO v_expiry_exists;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='is_active'
  ) INTO v_active_exists;

  -- Vérifier les fonctions
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND p.proname='create_product'
  ) INTO v_create_product_exists;

  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND p.proname='create_sale_with_limit'
  ) INTO v_create_sale_exists;

  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND p.proname='check_plan_limit'
  ) INTO v_check_plan_exists;

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'VÉRIFICATION POST-MIGRATION';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Colonne products.description : %', CASE WHEN v_desc_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE 'Colonne products.expiry_date  : %', CASE WHEN v_expiry_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE 'Colonne products.is_active    : %', CASE WHEN v_active_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE 'Fonction create_product       : %', CASE WHEN v_create_product_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE 'Fonction create_sale_with_limit : %', CASE WHEN v_create_sale_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE 'Fonction check_plan_limit     : %', CASE WHEN v_check_plan_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '═══════════════════════════════════════════════════════';

  IF NOT v_desc_exists OR NOT v_create_product_exists OR NOT v_check_plan_exists THEN
    RAISE EXCEPTION '❌ Migration incomplète — voir les ❌ ci-dessus';
  END IF;
END $$;

COMMIT;

-- Done ✅ — la création de produit doit marcher maintenant.
