-- ============================================================
-- Onboarding Premium — Track onboarding progress in profiles
-- ============================================================

-- 1. Add onboarding tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT DEFAULT 'welcome',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS business_type TEXT;

-- 2. Set default for existing users: mark them as onboarding completed
-- (they already have accounts so they don't need the new wizard)
UPDATE public.profiles
SET onboarding_completed = TRUE,
    onboarding_step = 'done'
WHERE onboarding_completed IS NULL OR onboarding_completed = FALSE;

-- 3. RPC: Update onboarding progress
CREATE OR REPLACE FUNCTION public.update_onboarding_progress(p_step TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  UPDATE public.profiles
  SET onboarding_step = p_step,
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

-- 4. RPC: Complete onboarding
CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET onboarding_completed = TRUE,
      onboarding_step = 'done',
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

-- 5. RPC: Get onboarding status
CREATE OR REPLACE FUNCTION public.get_onboarding_status()
RETURNS TABLE(step TEXT, completed BOOLEAN, business_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT p.onboarding_step, p.onboarding_completed, p.business_type
  FROM public.profiles p
  WHERE p.user_id = v_user_id;
END;
$$;

-- 6. RPC: Update business type during onboarding
CREATE OR REPLACE FUNCTION public.update_business_type(p_business_type TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET business_type = p_business_type,
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

-- 7. RPC: Setup store during onboarding (update store name, city, country, currency, phone)
CREATE OR REPLACE FUNCTION public.setup_onboarding_store(
  p_store_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_country TEXT DEFAULT 'GN',
  p_currency TEXT DEFAULT 'GNF',
  p_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_store_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user's org
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  -- Find the default store for the org
  SELECT id INTO v_store_id
  FROM public.stores
  WHERE organization_id = v_org_id
  LIMIT 1;

  IF v_store_id IS NOT NULL THEN
    -- Update existing store
    UPDATE public.stores
    SET name = p_store_name,
        city = p_city,
        country = p_country,
        currency = p_currency,
        phone = p_phone,
        updated_at = now()
    WHERE id = v_store_id;
  ELSE
    -- Create store (shouldn't normally happen but handle it)
    INSERT INTO public.stores (organization_id, name, city, country, currency, phone, slug, is_active, is_headquarters)
    VALUES (v_org_id, p_store_name, p_city, p_country, p_currency, p_phone,
            lower(replace(p_store_name, ' ', '-')), TRUE, TRUE)
    RETURNING id INTO v_store_id;
  END IF;

  -- Also update profile info
  UPDATE public.profiles
  SET phone = COALESCE(p_phone, phone),
      city = COALESCE(p_city, city),
      country = COALESCE(p_country, country),
      currency = COALESCE(p_currency, currency),
      updated_at = now()
  WHERE user_id = v_user_id;

  RETURN v_store_id;
END;
$$;

-- 8. RPC: Get onboarding checklist progress (auto-detect from data)
CREATE OR REPLACE FUNCTION public.get_onboarding_checklist()
RETURNS TABLE(
  has_account BOOLEAN,
  has_store_configured BOOLEAN,
  has_products BOOLEAN,
  has_categories BOOLEAN,
  has_sales BOOLEAN,
  completion_pct INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_store_id UUID;
  v_has_store BOOLEAN;
  v_has_products BOOLEAN;
  v_has_categories BOOLEAN;
  v_has_sales BOOLEAN;
  v_completed INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get org and store
  SELECT p.organization_id INTO v_org_id
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  SELECT s.id INTO v_store_id
  FROM public.stores s
  WHERE s.organization_id = v_org_id
  LIMIT 1;

  -- Check store configured (has name and city)
  SELECT EXISTS(
    SELECT 1 FROM public.stores
    WHERE organization_id = v_org_id
      AND name IS NOT NULL AND name != ''
      AND city IS NOT NULL AND city != ''
      AND currency IS NOT NULL
  ) INTO v_has_store;

  -- Check products exist
  SELECT EXISTS(
    SELECT 1 FROM public.products
    WHERE organization_id = v_org_id
    LIMIT 1
  ) INTO v_has_products;

  -- Check categories exist
  SELECT EXISTS(
    SELECT 1 FROM public.categories
    WHERE organization_id = v_org_id
    LIMIT 1
  ) INTO v_has_categories;

  -- Check sales exist
  SELECT EXISTS(
    SELECT 1 FROM public.sales
    WHERE organization_id = v_org_id
    LIMIT 1
  ) INTO v_has_sales;

  -- Calculate completion percentage
  v_completed := 0;
  IF TRUE THEN v_completed := v_completed + 1; END IF; -- always has account
  IF v_has_store THEN v_completed := v_completed + 1; END IF;
  IF v_has_products THEN v_completed := v_completed + 1; END IF;
  IF v_has_categories THEN v_completed := v_completed + 1; END IF;
  IF v_has_sales THEN v_completed := v_completed + 1; END IF;

  RETURN QUERY
  SELECT
    TRUE AS has_account,
    COALESCE(v_has_store, FALSE) AS has_store_configured,
    COALESCE(v_has_products, FALSE) AS has_products,
    COALESCE(v_has_categories, FALSE) AS has_categories,
    COALESCE(v_has_sales, FALSE) AS has_sales,
    (v_completed * 100 / 5) AS completion_pct;
END;
$$;
