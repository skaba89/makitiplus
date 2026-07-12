-- ============================================================
-- SCRIPT DE VÉRIFICATION POST-MIGRATION
-- À exécuter après 20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql
-- ============================================================
-- Ce script vérifie que toutes les migrations critiques ont été
-- correctement appliquées. Il affiche un rapport clair ✅/❌.
-- ============================================================

DO $$
DECLARE
  v_desc_exists BOOLEAN;
  v_expiry_exists BOOLEAN;
  v_active_exists BOOLEAN;
  v_create_product_exists BOOLEAN;
  v_create_sale_exists BOOLEAN;
  v_create_full_sale_exists BOOLEAN;
  v_create_first_org_exists BOOLEAN;
  v_check_plan_exists BOOLEAN;
  v_get_user_org_exists BOOLEAN;
  v_payment_method_cast BOOLEAN;
  v_store_id_in_sales BOOLEAN;
  v_org_id_in_sale_items BOOLEAN;
  v_store_id_in_sale_items BOOLEAN;
  v_p_store_id_param BOOLEAN;
BEGIN
  -- ─── Colonnes products ───────────────────────────────────────
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='description')
  INTO v_desc_exists;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='expiry_date')
  INTO v_expiry_exists;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='is_active')
  INTO v_active_exists;

  -- ─── Fonctions critiques ─────────────────────────────────────
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND p.proname='create_product')
  INTO v_create_product_exists;

  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND p.proname='create_sale_with_limit')
  INTO v_create_sale_exists;

  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND p.proname='create_full_sale')
  INTO v_create_full_sale_exists;

  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND p.proname='create_first_organization')
  INTO v_create_first_org_exists;

  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND p.proname='check_plan_limit')
  INTO v_check_plan_exists;

  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND p.proname='get_user_organization_id')
  INTO v_get_user_org_exists;

  -- ─── Cast payment_method dans create_full_sale ───────────────
  -- Vérifier que le corps de create_full_sale contient ::payment_method
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    JOIN pg_source s ON s.oid = p.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_full_sale'
      AND s.source_text LIKE '%::public.payment_method%'
  ) INTO v_payment_method_cast;

  -- ─── Colonnes store_id dans sales ────────────────────────────
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sales' AND column_name='store_id')
  INTO v_store_id_in_sales;

  -- ─── Colonnes organization_id + store_id dans sale_items ─────
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sale_items' AND column_name='organization_id')
  INTO v_org_id_in_sale_items;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sale_items' AND column_name='store_id')
  INTO v_store_id_in_sale_items;

  -- ─── Paramètre p_store_id dans create_sale_with_limit ────────
  -- Vérifier que la fonction accepte p_store_id
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    JOIN pg_attribute a ON a.attrelid = p.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_sale_with_limit'
      AND a.attname = 'p_store_id'
  ) INTO v_p_store_id_param;

  -- ─── Affichage du rapport ────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'VÉRIFICATION POST-MIGRATION';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '── Colonnes products ──';
  RAISE NOTICE '  products.description    : %', CASE WHEN v_desc_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '  products.expiry_date    : %', CASE WHEN v_expiry_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '  products.is_active      : %', CASE WHEN v_active_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '';
  RAISE NOTICE '── Fonctions critiques ──';
  RAISE NOTICE '  create_product            : %', CASE WHEN v_create_product_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '  create_sale_with_limit    : %', CASE WHEN v_create_sale_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '  create_full_sale          : %', CASE WHEN v_create_full_sale_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '  create_first_organization : %', CASE WHEN v_create_first_org_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '  check_plan_limit          : %', CASE WHEN v_check_plan_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '  get_user_organization_id  : %', CASE WHEN v_get_user_org_exists THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '';
  RAISE NOTICE '── Cast payment_method ──';
  RAISE NOTICE '  ::public.payment_method   : %', CASE WHEN v_payment_method_cast THEN '✅ OK' ELSE '❌ MANQUANT (cast non trouvé)' END;
  RAISE NOTICE '';
  RAISE NOTICE '── Store scope (multi-magasins) ──';
  RAISE NOTICE '  sales.store_id            : %', CASE WHEN v_store_id_in_sales THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '  sale_items.organization_id : %', CASE WHEN v_org_id_in_sale_items THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '  sale_items.store_id       : %', CASE WHEN v_store_id_in_sale_items THEN '✅ OK' ELSE '❌ MANQUANTE' END;
  RAISE NOTICE '  p_store_id param accepté   : %', CASE WHEN v_p_store_id_param THEN '✅ OK' ELSE '❌ MANQUANT' END;
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';

  -- ─── Vérification finale ─────────────────────────────────────
  IF NOT v_desc_exists OR NOT v_expiry_exists OR NOT v_active_exists THEN
    RAISE EXCEPTION '❌ Colonnes products manquantes — appliquer la migration consolidée';
  END IF;

  IF NOT v_create_product_exists OR NOT v_create_sale_exists OR NOT v_create_full_sale_exists THEN
    RAISE EXCEPTION '❌ Fonctions critiques manquantes — appliquer la migration consolidée';
  END IF;

  IF NOT v_payment_method_cast THEN
    RAISE EXCEPTION '❌ Cast payment_method manquant — appliquer la migration consolidée';
  END IF;

  IF NOT v_store_id_in_sales OR NOT v_org_id_in_sale_items OR NOT v_store_id_in_sale_items THEN
    RAISE EXCEPTION '❌ Colonnes store scope manquantes — appliquer la migration consolidée';
  END IF;

  RAISE NOTICE '✅ TOUTES LES VÉRIFICATIONS SONT PASSÉES';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

-- ─── Résumé rapide (count) ────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name IN ('description','expiry_date','is_active')) AS products_columns,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname IN ('create_product','create_sale_with_limit','create_full_sale','create_first_organization','check_plan_limit')) AS critical_functions,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='store_id') AS sales_store_id,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sale_items' AND column_name IN ('organization_id','store_id')) AS sale_items_scope;
