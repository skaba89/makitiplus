-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Create First Organization RPC
-- ═══════════════════════════════════════════════════════════════════════════════
-- Purpose: Allow users without an organization to create their first org + store
-- This is needed after database cleanup or for new super_admin users
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_first_organization(
  p_org_name TEXT,
  p_store_name TEXT,
  p_store_slug TEXT,
  p_store_category public.store_category DEFAULT 'epicerie',
  p_country TEXT DEFAULT 'GN',
  p_currency TEXT DEFAULT 'GNF'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_store_id UUID;
  v_existing_org UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  
  -- Check if user already has an organization
  SELECT organization_id INTO v_existing_org
  FROM public.profiles WHERE user_id = v_user_id;
  
  IF v_existing_org IS NOT NULL THEN
    -- User already has an org, just create a store
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
  
  -- Create new organization
  INSERT INTO public.organizations (
    name, owner_user_id, subscription_plan, created_at
  ) VALUES (
    p_org_name, v_user_id, 'starter', NOW()
  ) RETURNING id INTO v_org_id;
  
  -- Update user's profile to link to the new org
  UPDATE public.profiles
  SET organization_id = v_org_id,
      business_name = p_org_name
  WHERE user_id = v_user_id;
  
  -- Create the first store
  INSERT INTO public.stores (
    organization_id, name, slug, country, currency, category
  ) VALUES (
    v_org_id, p_store_name, p_store_slug, p_country, p_currency, p_store_category
  ) RETURNING id INTO v_store_id;
  
  -- Create starter subscription
  INSERT INTO public.subscriptions (
    organization_id, plan, status, current_period_start, current_period_end
  ) VALUES (
    v_org_id, 'starter', 'active', NOW(), NOW() + INTERVAL '30 days'
  );
  
  -- Insert default categories for the organization
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

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';