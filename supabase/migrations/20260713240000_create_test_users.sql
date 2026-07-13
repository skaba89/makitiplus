-- ============================================================
-- Script : Créer des utilisateurs (vendeur, manager, comptable)
-- Date: 2026-07-13
-- ============================================================

DO $$
DECLARE
  v_super_admin_email TEXT := 'kaba.sekouna@gmail.com';
  v_org_id UUID;
  v_business_name TEXT;
  v_user_id UUID;
  v_store_id UUID;
BEGIN
  SELECT p.organization_id, p.business_name INTO v_org_id, v_business_name
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE u.email = v_super_admin_email
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Super admin % non trouvé', v_super_admin_email;
  END IF;

  SELECT id INTO v_store_id FROM public.stores
  WHERE organization_id = v_org_id LIMIT 1;

  -- 1. VENDEUR
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'vendeur@test.com' LIMIT 1;
  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'vendeur@test.com', crypt('Vendeur123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{}'::jsonb, '{}'::jsonb, false)
    RETURNING id INTO v_user_id;
    INSERT INTO public.profiles (user_id, business_name, owner_name, phone, is_active, organization_id, current_store_id)
    VALUES (v_user_id, v_business_name, 'Vendeur Test', '+224000000000', true, v_org_id, v_store_id);
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'vendeur');
    RAISE NOTICE 'Vendeur cree : vendeur@test.com / Vendeur123!';
  ELSE
    RAISE NOTICE 'Vendeur existe deja';
  END IF;

  -- 2. MANAGER
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'manager@test.com' LIMIT 1;
  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'manager@test.com', crypt('Manager123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{}'::jsonb, '{}'::jsonb, false)
    RETURNING id INTO v_user_id;
    INSERT INTO public.profiles (user_id, business_name, owner_name, phone, is_active, organization_id, current_store_id)
    VALUES (v_user_id, v_business_name, 'Manager Test', '+224000000001', true, v_org_id, v_store_id);
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'manager');
    RAISE NOTICE 'Manager cree : manager@test.com / Manager123!';
  ELSE
    RAISE NOTICE 'Manager existe deja';
  END IF;

  -- 3. COMPTABLE
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'comptable@test.com' LIMIT 1;
  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'comptable@test.com', crypt('Comptable123!', gen_salt('bf')), NOW(), NOW(), NOW(), '{}'::jsonb, '{}'::jsonb, false)
    RETURNING id INTO v_user_id;
    INSERT INTO public.profiles (user_id, business_name, owner_name, phone, is_active, organization_id, current_store_id)
    VALUES (v_user_id, v_business_name, 'Comptable Test', '+224000000002', true, v_org_id, v_store_id);
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'comptable');
    RAISE NOTICE 'Comptable cree : comptable@test.com / Comptable123!';
  ELSE
    RAISE NOTICE 'Comptable existe deja';
  END IF;

  RAISE NOTICE '=== UTILISATEURS DE TEST CREES ===';
END $$;
