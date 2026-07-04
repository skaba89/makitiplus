-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 1 : create_product — buy_price → cost_price
-- FIX 2 : invite_user — retirer organization_id de user_roles INSERT
-- Execute dans : Supabase Dashboard -> SQL Editor -> New Query
-- ═══════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════════
-- FIX 1 : create_product — p_buy_price → p_cost_price, colonne buy_price → cost_price
-- ══════════════════════════════════════════════════════════════════════════════

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
  v_org_id UUID; v_product_id UUID; v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id AND organization_id = v_org_id) THEN RAISE EXCEPTION 'Catégorie invalide'; END IF;
  IF p_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND organization_id = v_org_id) THEN RAISE EXCEPTION 'Magasin invalide'; END IF;
  INSERT INTO public.products (organization_id, name, price, category_id, barcode, unit,
    stock_quantity, min_stock_alert, cost_price, supplier_id, store_id, description, image_url, is_active, user_id
  ) VALUES (v_org_id, p_name, p_price, p_category_id, p_barcode, p_unit,
    p_stock_quantity, p_min_stock_alert, p_cost_price, p_supplier_id, p_store_id, p_description, p_image_url, p_is_active, v_user_id
  ) RETURNING id INTO v_product_id;
  RETURN v_product_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_product(TEXT, NUMERIC, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, BOOLEAN) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- FIX 2 : invite_user — retirer organization_id du INSERT INTO user_roles
-- user_roles n'a PAS de colonne organization_id, l'org est dans profiles
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.invite_user(
  p_email TEXT, p_role public.app_role
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID; v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent inviter';
  END IF;

  -- Create profile for the invited user (placeholder user_id will be set after signup)
  -- We create a temporary UUID and the profile; the actual user_id will be set
  -- when the user signs up via the invite link
  v_user_id := gen_random_uuid();

  INSERT INTO public.profiles (user_id, business_name, owner_name, organization_id, is_active)
  VALUES (v_user_id, p_email, p_email, v_org_id, false)
  ON CONFLICT (user_id) DO NOTHING;

  -- Insert role WITHOUT organization_id (user_roles table only has user_id + role)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT DO NOTHING;

  RETURN v_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.invite_user(TEXT, public.app_role) TO authenticated;


-- Vérification
SELECT 'Fix 1 (create_product) & Fix 2 (invite_user) appliqués' AS status;
