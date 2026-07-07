-- Manual store test setup SQL skeleton
-- Run from Supabase SQL Editor with an admin/postgres role only.
-- Replace USER_ID_HERE with the authenticated test user UUID from browser logs.

DO $$
DECLARE
  v_user_id UUID := 'USER_ID_HERE';
  v_org_id UUID;
BEGIN
  -- Ensure profile is active.
  UPDATE public.profiles
  SET
    owner_name = 'Cheickna Kaba',
    business_name = 'MakitiPlus Test',
    is_active = true
  WHERE user_id = v_user_id;

  -- Ensure the user has the platform role for manual test.
  INSERT INTO public.user_roles (user_id, role)
  SELECT v_user_id, 'super_admin'::public.app_role
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id
      AND role = 'super_admin'
  );

  -- Create an organization when none is linked to the profile.
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, owner_user_id, subscription_plan, created_at)
    VALUES ('MakitiPlus Test', v_user_id, 'starter', NOW())
    RETURNING id INTO v_org_id;

    UPDATE public.profiles
    SET organization_id = v_org_id
    WHERE user_id = v_user_id;
  END IF;

  -- Create a test store if absent.
  INSERT INTO public.stores (organization_id, name, slug, country, currency, category)
  SELECT v_org_id, 'Diallo & Freres', 'diallo-freres-test', 'GN', 'GNF', 'alimentation_generale'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE organization_id = v_org_id
      AND slug = 'diallo-freres-test'
  );
END $$;
