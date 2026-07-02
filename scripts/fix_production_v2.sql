-- ═══════════════════════════════════════════════════════════════════════════
-- FIX PRODUCTION v2 — Corrige les erreurs 400 restantes
-- Execute dans : Supabase Dashboard -> SQL Editor -> New Query
--
-- Erreurs corriges :
--   400 check_plan_limit "plan_id is ambiguous"
--   400 get_organization_stores "created_at is ambiguous" (re-fix)
--   400 products?select=...suppliers(name) — colonne supplier_id manquante
-- ═══════════════════════════════════════════════════════════════════════════

-- ================================================================
-- 1. FIX check_plan_limit — "plan_id is ambiguous"
--    Le SELECT plan_id est ambigu car subscriptions ET plans
--    ont toutes les deux une colonne plan_id.
-- ================================================================
CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_limit_type TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  limit_value INTEGER,
  plan_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_sub record;
  v_current INTEGER;
  v_limit INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Get active subscription with plan details
  -- FIX: prefix s.plan_id to avoid ambiguity with p.id
  SELECT s.plan_id AS sub_plan_id, p.max_stores, p.max_users, p.max_products, p.max_sales_per_month
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no subscription, default to starter limits
  IF NOT FOUND THEN
    SELECT 'starter'::text AS sub_plan_id, max_stores, max_users, max_products, max_sales_per_month
    INTO v_sub
    FROM public.plans WHERE id = 'starter';
  END IF;

  -- Calculate current count + get limit based on limit type
  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
      v_limit := v_sub.max_stores;
    WHEN 'users' THEN
      SELECT COUNT(DISTINCT ur.user_id) INTO v_current
      FROM public.user_roles ur
      JOIN public.profiles pf ON pf.user_id = ur.user_id
      WHERE pf.organization_id = v_org_id;
      v_limit := v_sub.max_users;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id;
      v_limit := v_sub.max_products;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_current FROM public.sales sal
      WHERE sal.organization_id = v_org_id
        AND sal.created_at >= date_trunc('month', NOW());
      v_limit := v_sub.max_sales_per_month;
    ELSE
      RAISE EXCEPTION 'Type de limite inconnu : %', p_limit_type;
  END CASE;

  -- NULL limit means unlimited
  RETURN QUERY SELECT
    (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
    v_current,
    v_limit,
    v_sub.sub_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;

-- ================================================================
-- 2. FIX get_organization_stores — "created_at is ambiguous" (re-fix)
--    La sous-requête sales.created_at entre en conflit avec
--    le RETURNS TABLE qui a aussi created_at.
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_organization_stores()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, address TEXT, city TEXT, country TEXT,
  currency TEXT, phone TEXT, is_active BOOLEAN, is_headquarters BOOLEAN,
  category public.store_category, metadata JSONB,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  product_count BIGINT, sales_this_month NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.name, s.slug, s.address, s.city, s.country, s.currency, s.phone,
    s.is_active, s.is_headquarters, s.category, s.metadata, s.created_at, s.updated_at,
    COALESCE(pcnt.cnt, 0) AS product_count,
    COALESCE(sales.total, 0) AS sales_this_month
  FROM public.stores s
  LEFT JOIN (
    SELECT pr.store_id, COUNT(*) AS cnt FROM public.products pr
    WHERE pr.store_id IS NOT NULL GROUP BY pr.store_id
  ) pcnt ON pcnt.store_id = s.id
  LEFT JOIN (
    SELECT sal.store_id, SUM(sal.total_amount) AS total FROM public.sales sal
    WHERE sal.store_id IS NOT NULL AND sal.created_at >= date_trunc('month', now())
    GROUP BY sal.store_id
  ) sales ON sales.store_id = s.id
  WHERE s.organization_id = v_org_id
  ORDER BY s.is_headquarters DESC, s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_stores() TO authenticated;

-- ================================================================
-- 3. AJOUTER supplier_id A PRODUCTS si manquant
--    (necessaire pour le select products?select=...suppliers(name))
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'supplier_id'
  ) THEN
    -- Verifier que la table suppliers existe d'abord
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'suppliers') THEN
      ALTER TABLE public.products ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON public.products(supplier_id);
      RAISE NOTICE 'Colonne supplier_id ajoutee a products';
    ELSE
      RAISE NOTICE 'Table suppliers non trouvée, supplier_id non ajoutee';
    END IF;
  END IF;
END $$;

-- ================================================================
-- 4. VERIFIER/AJOUTER D'AUTRES COLONNES MANQUANTES COMMUNES
-- ================================================================

-- min_stock_alert sur products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'min_stock_alert'
  ) THEN
    ALTER TABLE public.products ADD COLUMN min_stock_alert INTEGER DEFAULT 5;
  END IF;
END $$;

-- cost_price sur products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE public.products ADD COLUMN cost_price NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;

-- barcode sur products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'barcode'
  ) THEN
    ALTER TABLE public.products ADD COLUMN barcode TEXT;
  END IF;
END $$;

-- is_active sur products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.products ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- category sur organizations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'category'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN category TEXT DEFAULT 'alimentation_generale';
  END IF;
END $$;

-- Les corrections sont appliquees
