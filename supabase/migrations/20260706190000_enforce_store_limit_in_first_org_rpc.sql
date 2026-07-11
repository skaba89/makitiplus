-- ============================================================
-- Enforce store plan limit in create_first_organization
-- Date: 2026-07-06
--
-- Purpose:
--   The frontend currently uses create_first_organization for both:
--   1. true first organization onboarding;
--   2. adding another store when the user already has an organization.
--
-- The existing store-only branch inserted directly into public.stores.
-- This hotfix adds the same server-side store quota check used by create_store.
-- No destructive operation. No data deletion.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_first_organization(
  p_org_name TEXT,
  p_store_name TEXT,
  p_store_slug TEXT,
  p_store_category public.store_category DEFAULT 'epicerie',
  p_country TEXT DEFAULT 'GN',
  p_currency TEXT DEFAULT 'GNF'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_store_id UUID;
  v_existing_org UUID;
  v_limit_ok BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Check if user already has an organization
  SELECT organization_id INTO v_existing_org
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_existing_org IS NOT NULL THEN
    -- Existing org path = adding a store.
    -- Enforce server-side store quota to prevent bypassing plan limits.
    SELECT allowed INTO v_limit_ok
    FROM public.check_plan_limit('stores')
    LIMIT 1;

    IF NOT COALESCE(v_limit_ok, FALSE) THEN
      RAISE EXCEPTION 'Limite de boutiques atteinte pour votre plan. Upgradez votre abonnement.';
    END IF;

    -- Verify admin role for store creation.
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = v_user_id
        AND ur.role IN ('admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'Seuls les administrateurs peuvent créer des boutiques';
    END IF;

    INSERT INTO public.stores (
      organization_id, name, slug, country, currency, category
    ) VALUES (
      v_existing_org, p_store_name, p_store_slug, p_country, p_currency, p_store_category
    ) RETURNING id INTO v_store_id;

    RETURN jsonb_build_object(
      'success', true,
      'organization_id', v_existing_org,
      'store_id', v_store_id,
      'mode', 'store_only'
    );
  END IF;

  -- True first organization onboarding path.
  -- This creates the initial organization and first headquarters store.
  -- It is intentionally allowed before store-count limits exist for the tenant.
  INSERT INTO public.organizations (
    name, owner_user_id, subscription_plan, created_at
  ) VALUES (
    p_org_name, v_user_id, 'starter', NOW()
  ) RETURNING id INTO v_org_id;

  UPDATE public.profiles
  SET organization_id = v_org_id,
      business_name = p_org_name
  WHERE user_id = v_user_id;

  INSERT INTO public.stores (
    organization_id, name, slug, country, currency, category
  ) VALUES (
    v_org_id, p_store_name, p_store_slug, p_country, p_currency, p_store_category
  ) RETURNING id INTO v_store_id;

  INSERT INTO public.subscriptions (
    organization_id, plan_id, status, current_period_start, current_period_end
  ) VALUES (
    v_org_id, 'starter', 'active', NOW(), NOW() + INTERVAL '30 days'
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = NOW();

  PERFORM public.insert_default_categories(v_org_id, v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id,
    'store_id', v_store_id,
    'mode', 'org_and_store'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_first_organization(
  TEXT, TEXT, TEXT, public.store_category, TEXT, TEXT
) TO authenticated;

NOTIFY pgrst, 'reload schema';
