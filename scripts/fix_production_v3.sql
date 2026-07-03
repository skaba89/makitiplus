-- ═══════════════════════════════════════════════════════════════════════════
-- FIX PRODUCTION v3 — RPC manquants : create_sale_with_limit + get_categories
-- Execute dans : Supabase Dashboard -> SQL Editor -> New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- ================================================================
-- 1. CREATE create_sale_with_limit — plan-enforced sale creation
--    Signature mise à jour pour matcher create_full_sale
-- ================================================================
DROP FUNCTION IF EXISTS public.create_sale_with_limit(JSONB, TEXT, UUID, NUMERIC, UUID, TEXT);

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
  p_seller_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_limit_ok BOOLEAN;
  v_sale_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('sales_this_month') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de ventes mensuelles atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Delegate to existing create_full_sale RPC with same params
  v_sale_id := public.create_full_sale(
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
    p_seller_name
  );

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) TO authenticated;


-- ================================================================
-- 2. CREATE get_categories — sans paramètre (utilise auth.uid())
-- ================================================================
DROP FUNCTION IF EXISTS public.get_categories(UUID);

CREATE OR REPLACE FUNCTION public.get_categories()
RETURNS TABLE (
  id UUID,
  name TEXT,
  icon TEXT,
  color TEXT,
  description TEXT,
  sort_order INT,
  is_default BOOLEAN,
  product_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.icon,
    c.color,
    c.description,
    c.sort_order,
    c.is_default,
    COALESCE(pc.cnt, 0) AS product_count
  FROM public.categories c
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM public.products p
    WHERE p.category_id = c.id
      AND p.organization_id = v_org_id
  ) pc ON true
  WHERE c.organization_id = v_org_id
  ORDER BY c.sort_order ASC NULLS LAST, c.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_categories() TO authenticated;


-- ================================================================
-- 3. Vérifier que create_full_sale existe aussi
--    (dépendance de create_sale_with_limit)
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_full_sale'
  ) THEN
    RAISE NOTICE 'ATTENTION: create_full_sale n''existe pas! create_sale_with_limit va échouer.';
  END IF;
END $$;


-- Corrections appliquees
