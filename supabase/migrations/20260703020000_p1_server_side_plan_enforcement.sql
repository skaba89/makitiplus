-- ============================================================
-- Server-Side Plan Enforcement — P1
-- Date: 2026-07-03
--
-- Prevents quota bypass via direct Supabase calls.
-- Each create RPC calls check_plan_limit before inserting.
-- Frontend can continue to use PlanLimitGuard for UX,
-- but server now enforces limits as the source of truth.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. create_product — plan-enforced product creation
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_product(
  p_name TEXT,
  p_price NUMERIC,
  p_category_id UUID DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL,
  p_unit TEXT DEFAULT 'unité',
  p_stock_quantity INTEGER DEFAULT 0,
  p_min_stock_alert INTEGER DEFAULT 5,
  p_buy_price NUMERIC DEFAULT NULL,
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

  INSERT INTO public.products (
    organization_id, name, price, category_id, barcode, unit,
    stock_quantity, min_stock_alert, buy_price, supplier_id,
    store_id, description, image_url, is_active, user_id
  ) VALUES (
    v_org_id, p_name, p_price, p_category_id, p_barcode, p_unit,
    p_stock_quantity, p_min_stock_alert, p_buy_price, p_supplier_id,
    p_store_id, p_description, p_image_url, p_is_active, v_user_id
  ) RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_product(
  TEXT, NUMERIC, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, BOOLEAN
) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 2. create_store — plan-enforced store creation
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_store(
  p_name TEXT,
  p_slug TEXT,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_country TEXT DEFAULT 'GN',
  p_currency TEXT DEFAULT 'GNF',
  p_phone TEXT DEFAULT NULL,
  p_category public.store_category DEFAULT 'autre',
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_store_id UUID;
  v_limit_ok BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('stores') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de boutiques atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Verify admin role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent créer des boutiques';
  END IF;

  INSERT INTO public.stores (
    organization_id, name, slug, address, city, country,
    currency, phone, category, metadata
  ) VALUES (
    v_org_id, p_name, p_slug, p_address, p_city, p_country,
    p_currency, p_phone, p_category, p_metadata
  ) RETURNING id INTO v_store_id;

  RETURN v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_store(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.store_category, JSONB
) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 3. invite_user — plan-enforced user invitation
-- ════════════════════════════════════════════════════════════════

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
    RAISE EXCEPTION 'Limite d''utilisateurs atteinte pour votre plan. Upgradéz votre abonnement.';
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
  -- Return a sentinel to indicate user needs account creation
  IF v_user_id IS NULL THEN
    -- Create a placeholder profile + role, actual account created via admin API
    -- This is handled by the register flow + invite flow
    RAISE EXCEPTION 'Utilisateur non trouvé. Utilisez l''invitation par email.';
  END IF;

  -- Add role for existing user
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (v_user_id, v_org_id, p_role)
  ON CONFLICT (user_id, organization_id, role) DO NOTHING;

  -- Create profile if missing
  INSERT INTO public.profiles (user_id, organization_id, owner_name)
  VALUES (v_user_id, v_org_id, p_email)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_user(TEXT, public.app_role) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 4. create_sale_with_limit — plan-enforced sale creation
-- ════════════════════════════════════════════════════════════════
-- This is a wrapper that checks plan limit before delegating
-- to the existing create_full_sale RPC.
-- Note: create_full_sale already exists. We add a pre-check hook.

CREATE OR REPLACE FUNCTION public.create_sale_with_limit(
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_customer_id UUID DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0,
  p_store_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
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

  -- Delegate to existing create_full_sale RPC
  v_sale_id := public.create_full_sale(
    p_items, p_payment_method, p_customer_id,
    p_discount_amount, p_store_id, p_notes
  );

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  JSONB, TEXT, UUID, NUMERIC, UUID, TEXT
) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- Done — Server-side plan enforcement active
-- ════════════════════════════════════════════════════════════════
