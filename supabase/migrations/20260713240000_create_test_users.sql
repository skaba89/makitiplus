-- ============================================================
-- Script : Créer des utilisateurs (vendeur, manager, comptable)
-- sans Edge Function — directement via SQL
-- Date: 2026-07-13
-- ============================================================
-- Ce script crée des utilisateurs de test pour chaque rôle.
-- L'admin peut ensuite les utiliser pour tester l'application.
--
-- ⚠️  Remplacez les emails/mots de passe par les vôtres.
-- ============================================================

DO $$
DECLARE
  v_super_admin_email TEXT := 'kaba.sekouna@gmail.com';
  v_org_id UUID;
  v_business_name TEXT;
  v_user_id UUID;
  v_store_id UUID;
BEGIN
  -- Récupérer l'org du super admin par son email (auth.uid() est NULL en SQL Editor)
  SELECT p.organization_id, p.business_name INTO v_org_id, v_business_name
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE u.email = v_super_admin_email
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Super admin % non trouvé ou sans organisation', v_super_admin_email;
  END IF;

  -- Récupérer le store
  SELECT id INTO v_store_id FROM public.stores
  WHERE organization_id = v_org_id LIMIT 1;

  RAISE NOTICE 'Organisation : % (%)', v_business_name, v_org_id;

  -- ════════════════════════════════════════════════════════════════
  -- 1. VENDEUR
  -- ════════════════════════════════════════════════════════════════
  BEGIN
    -- Créer l'utilisateur dans auth.users
    v_user_id := auth.uid(); -- placeholder, sera remplacé
    
    -- Utiliser la fonction admin.createUser via un INSERT direct
    -- (nécessite service_role — en SQL Editor on est admin)
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'vendeur@test.com',
      crypt('Vendeur123!', gen_salt('bf')),
      NOW(), NOW(), NOW(), NULL,
      '{}'::jsonb, '{}'::jsonb, false
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING id INTO v_user_id;

    IF v_user_id IS NOT NULL THEN
      -- Créer le profil
      INSERT INTO public.profiles (user_id, business_name, owner_name, phone, is_active, organization_id, current_store_id)
      VALUES (v_user_id, v_business_name, 'Vendeur Test', '+224000000000', true, v_org_id, v_store_id)
      ON CONFLICT DO NOTHING;

      -- Créer le rôle
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'vendeur')
      ON CONFLICT DO NOTHING;

      RAISE NOTICE '✅ Vendeur créé : vendeur@test.com / Vendeur123!';
    ELSE
      RAISE NOTICE '⏭️  Vendeur existe déjà';
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════
  -- 2. MANAGER
  -- ════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'manager@test.com',
      crypt('Manager123!', gen_salt('bf')),
      NOW(), NOW(), NOW(), NULL,
      '{}'::jsonb, '{}'::jsonb, false
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING id INTO v_user_id;

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.profiles (user_id, business_name, owner_name, phone, is_active, organization_id, current_store_id)
      VALUES (v_user_id, v_business_name, 'Manager Test', '+224000000001', true, v_org_id, v_store_id)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'manager')
      ON CONFLICT DO NOTHING;

      RAISE NOTICE '✅ Manager créé : manager@test.com / Manager123!';
    ELSE
      RAISE NOTICE '⏭️  Manager existe déjà';
    END IF;
  END;

  -- ════════════════════════════════════════════════════════════════
  -- 3. COMPTABLE
  -- ════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'comptable@test.com',
      crypt('Comptable123!', gen_salt('bf')),
      NOW(), NOW(), NOW(), NULL,
      '{}'::jsonb, '{}'::jsonb, false
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING id INTO v_user_id;

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.profiles (user_id, business_name, owner_name, phone, is_active, organization_id, current_store_id)
      VALUES (v_user_id, v_business_name, 'Comptable Test', '+224000000002', true, v_org_id, v_store_id)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'comptable')
      ON CONFLICT DO NOTHING;

      RAISE NOTICE '✅ Comptable créé : comptable@test.com / Comptable123!';
    ELSE
      RAISE NOTICE '⏭️  Comptable existe déjà';
    END IF;
  END;

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ UTILISATEURS DE TEST CRÉÉS';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Vendeur    : vendeur@test.com / Vendeur123!';
  RAISE NOTICE 'Manager    : manager@test.com / Manager123!';
  RAISE NOTICE 'Comptable  : comptable@test.com / Comptable123!';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
