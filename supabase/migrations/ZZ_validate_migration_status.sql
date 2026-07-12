-- ============================================================
-- Script de VALIDATION — à exécuter dans Supabase SQL Editor
-- pour vérifier que toutes les migrations ont bien été appliquées.
--
-- Ce script NE MODIFIE RIEN — il affiche juste l'état actuel.
-- ============================================================

-- 1. Colonnes de la table products
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
ORDER BY ordinal_position;

-- 2. Fonctions critiques — vérifier qu'elles existent
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
       THEN '✅ authenticated'
       ELSE '❌ pas de grant' END AS grant_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_product',
    'create_sale_with_limit',
    'create_full_sale',
    'create_first_organization',
    'check_plan_limit',
    'get_reports_stats',
    'generate_sale_number',
    'get_user_organization_id'
  )
ORDER BY p.proname;

-- 3. Vérifier que check_plan_limit retourne bien JSONB (et pas TABLE)
SELECT
  p.proname,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'check_plan_limit';

-- 4. Tester create_product avec des données factices (à commenter si pas besoin)
-- ⚠️ Décommentez les lignes ci-dessous pour tester, mais attention ça crée
-- un vrai produit. À faire seulement si les sections 1-3 sont ✅.
--
-- SELECT public.create_product(
--   p_name => 'TEST PRODUIT',
--   p_price => 1000,
--   p_stock_quantity => 1,
--   p_cost_price => 500,
--   p_description => 'Test de la colonne description',
--   p_is_active => true
-- );

-- 5. Résumé final
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Compter les colonnes critiques
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='products'
    AND column_name IN ('description', 'expiry_date', 'is_active');

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'RÉSUMÉ : colonnes critiques présentes : %/3', v_count;
  IF v_count = 3 THEN
    RAISE NOTICE '✅ Tout est OK — vous pouvez créer un produit';
  ELSE
    RAISE NOTICE '❌ Il manque % colonne(s) — appliquez la migration consolidée', 3 - v_count;
  END IF;
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
