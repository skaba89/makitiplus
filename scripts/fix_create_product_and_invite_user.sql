-- ============================================================
-- Fix: create_product & invite_user RPC bugs
-- Date: 2026-07-03
-- Branch: hotfix/frontend-full-audit-no-regression
--
-- Bug 1: create_product uses p_buy_price / buy_price but
--   the products table column is cost_price.
--   → DROP puis recréer avec p_cost_price
--   → Corrige l'INSERT pour utiliser cost_price
--
-- Bug 2: invite_user INSERT into user_roles (user_id, organization_id, role)
--   but user_roles table has NO organization_id column.
--   → Retire organization_id de l'INSERT
--   → Corrige le ON CONFLICT pour (user_id, role)
--
-- NOTE: PostgreSQL interdit de renommer un paramètre via
--   CREATE OR REPLACE FUNCTION. Il faut DROP d'abord.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- Fix 1: create_product — DROP + recreate with p_cost_price
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
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('products') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de produits atteinte pour votre plan. Upgradez votre abonnement.';
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
-- Fix 2: invite_user — remove organization_id from user_roles INSERT
-- The user_roles table only has (id, user_id, role, created_at)
-- ════════════════════════════════════════════════════════════════

-- DROP d'abord au cas où la signature aurait changé
DROP FUNCTION IF EXISTS public.invite_user(TEXT, public.app_role);

CREATE OR REPLACE FUNCTION public.invite_user(
  p_email TEXT,
  p_role public.app_role DEFAULT 'vendeur'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_limit_ok BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('users') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite d''utilisateurs atteinte pour votre plan. Upgradez votre abonnement.';
  END IF;

  -- Only admins can invite
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent inviter des utilisateurs';
  END IF;

  -- Find existing user by email (if they already have an account)
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

  -- If user doesn't exist, we can't create via RPC (need admin API)
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non trouvé. Utilisez l''invitation par email.';
  END IF;

  -- Add role for existing user (NO organization_id — user_roles only has user_id + role)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Create profile if missing (profile does have organization_id)
  INSERT INTO public.profiles (user_id, organization_id, owner_name)
  VALUES (v_user_id, v_org_id, p_email)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_user(TEXT, public.app_role) TO authenticated;
