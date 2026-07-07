-- Repair the MakitiPlus test super_admin account.
-- Run this manually from Supabase SQL Editor with an admin/postgres role.
-- Do not run as an authenticated app user.
-- Do not grant access to auth.users.

DO $$
DECLARE
  v_user_id UUID := 'e62d26fe-4d9d-41ae-829b-00472b8146e2';
BEGIN
  -- Keep exactly one role for this test account.
  DELETE FROM public.user_roles
  WHERE user_id = v_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin'::public.app_role);

  -- Ensure one active profile exists for the account.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user_id) THEN
    UPDATE public.profiles
    SET
      owner_name = 'Cheickna Kaba',
      business_name = 'MakitiPlus Test',
      is_active = true
    WHERE user_id = v_user_id;
  ELSE
    INSERT INTO public.profiles (
      user_id,
      owner_name,
      business_name,
      is_active
    ) VALUES (
      v_user_id,
      'Cheickna Kaba',
      'MakitiPlus Test',
      true
    );
  END IF;
END $$;

-- Verification queries
SELECT user_id, role
FROM public.user_roles
WHERE user_id = 'e62d26fe-4d9d-41ae-829b-00472b8146e2';

SELECT user_id, owner_name, business_name, is_active, organization_id
FROM public.profiles
WHERE user_id = 'e62d26fe-4d9d-41ae-829b-00472b8146e2';
