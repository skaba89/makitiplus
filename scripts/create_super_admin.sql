/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚀 SUPER ADMIN MAKITIPLUS — Plan Enterprise (Tout Illimité)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️  EXÉCUTER DANS : Supabase Dashboard → SQL Editor → New Query
 * ⚠️  MODIFIEZ l'email/mot de passe ci-dessous avant d'exécuter !
 *
 * Ce script est IDEMPOTENT : vous pouvez le relancer sans risque.
 *
 * Ce qui est créé :
 *   ✅ Utilisateur auth (email confirmé, mot de passe hashé)
 *   ✅ Organisation "MakitiPlus HQ"
 *   ✅ Magasin principal "principal" (auto via trigger)
 *   ✅ Catégories par défaut (auto via trigger)
 *   ✅ Subscription Enterprise (100 ans, tout illimité)
 *   ✅ Profil complet (super_admin, enterprise)
 *   ✅ Rôle super_admin
 *   ✅ Compteurs d'utilisation initialisés (NULL = illimité)
 *   ✅ Événement d'abonnement tracé
 *
 * CONNEXION APRÈS EXÉCUTION :
 *   Email    : admin@makitiplus.com
 *   Password : MakitiPlus2026!
 * ═══════════════════════════════════════════════════════════════════════════
 */

DO $$
DECLARE
  -- ══════════════════════════════════════════════════════════════
  -- ✏️  MODIFIEZ CES VALEURS AVANT D'EXÉCUTER
  -- ══════════════════════════════════════════════════════════════
  v_admin_email    text := 'admin@makitiplus.com';
  v_admin_password text := 'MakitiPlus2026!';
  v_org_name       text := 'MakitiPlus HQ';
  v_owner_name     text := 'Admin MakitiPlus';
  v_owner_phone    text := '+224 622 00 00 00';
  -- ══════════════════════════════════════════════════════════════

  v_user_id  uuid;
  v_org_id   uuid;
  v_store_id uuid;
  v_sub_id   uuid;
BEGIN
  -- ═══ NETTOYAGE IDEMPOTENT ═══════════════════════════════════════════════
  -- Si un utilisateur avec cet email existe déjà, on nettoie tout

  SELECT id INTO v_user_id FROM auth.users WHERE email = v_admin_email;

  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE '🔄 Utilisateur existant détecté (%), nettoyage...', v_admin_email;

    -- Supprimer les dépendances
    DELETE FROM public.user_roles WHERE user_id = v_user_id;

    -- Récupérer l'org existante
    SELECT organization_id INTO v_org_id FROM public.profiles WHERE user_id = v_user_id LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      DELETE FROM public.subscription_events WHERE organization_id = v_org_id;
      DELETE FROM public.stripe_events WHERE organization_id = v_org_id;
      DELETE FROM public.subscriptions WHERE organization_id = v_org_id;
      DELETE FROM public.usage_counters WHERE organization_id = v_org_id;
      DELETE FROM public.stock_movements WHERE store_id IN (SELECT id FROM public.stores WHERE organization_id = v_org_id);
      DELETE FROM public.sale_items WHERE sale_id IN (SELECT id FROM public.sales WHERE store_id IN (SELECT id FROM public.stores WHERE organization_id = v_org_id));
      DELETE FROM public.sales WHERE store_id IN (SELECT id FROM public.stores WHERE organization_id = v_org_id);
      DELETE FROM public.products WHERE store_id IN (SELECT id FROM public.stores WHERE organization_id = v_org_id);
      DELETE FROM public.categories WHERE organization_id = v_org_id;
      DELETE FROM public.stores WHERE organization_id = v_org_id;
      DELETE FROM public.store_settings WHERE organization_id = v_org_id;
      DELETE FROM public.profiles WHERE organization_id = v_org_id;
      DELETE FROM public.organizations WHERE id = v_org_id;
    END IF;

    DELETE FROM public.profiles WHERE user_id = v_user_id;
    DELETE FROM auth.users WHERE id = v_user_id;

    RAISE NOTICE '✅ Nettoyage terminé';
  END IF;

  -- ═══ 1. CRÉER L'UTILISATEUR AUTH ════════════════════════════════════════
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    phone,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_admin_email,
    crypt(v_admin_password, gen_salt('bf')),
    NOW(),
    v_owner_phone,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  );

  RAISE NOTICE '✅ Utilisateur auth créé : % (ID: %)', v_admin_email, v_user_id;

  -- ═══ 2. CRÉER L'ORGANISATION ════════════════════════════════════════════
  -- Les triggers AFTER INSERT créent automatiquement :
  --   - subscription starter
  --   - store_settings
  --   - magasin "principal" (is_headquarters=true)
  --   - catégories par défaut

  INSERT INTO public.organizations (
    name,
    owner_user_id,
    country,
    currency,
    category,
    subscription_plan
  ) VALUES (
    v_org_name,
    v_user_id,
    'Guinée',
    'GNF',
    'alimentation_generale',
    'enterprise'
  )
  RETURNING id INTO v_org_id;

  RAISE NOTICE '✅ Organisation créée : % (ID: %)', v_org_name, v_org_id;

  -- ═══ 3. UPGRADE SUBSCRIPTION → ENTERPRISE (ILLIMITÉ, 100 ANS) ══════════
  UPDATE public.subscriptions
  SET
    plan_id = 'enterprise',
    status = 'active',
    billing_period = 'yearly',
    current_period_start = NOW(),
    current_period_end = NOW() + INTERVAL '100 years',
    updated_at = NOW()
  WHERE organization_id = v_org_id
  RETURNING id INTO v_sub_id;

  IF v_sub_id IS NULL THEN
    -- Si le trigger n'a pas fonctionné, créer manuellement
    INSERT INTO public.subscriptions (
      organization_id, plan_id, status, billing_period,
      current_period_start, current_period_end
    ) VALUES (
      v_org_id, 'enterprise', 'active', 'yearly',
      NOW(), NOW() + INTERVAL '100 years'
    )
    RETURNING id INTO v_sub_id;
    RAISE NOTICE '✅ Subscription Enterprise créée manuellement (ID: %)', v_sub_id;
  ELSE
    RAISE NOTICE '✅ Subscription upgrade starter → enterprise (ID: %)', v_sub_id;
  END IF;

  -- ═══ 4. CRÉER LE PROFIL COMPLET ═════════════════════════════════════════
  INSERT INTO public.profiles (
    user_id,
    business_name,
    owner_name,
    phone,
    organization_id,
    is_active,
    country,
    currency,
    subscription_plan,
    language,
    theme_mode
  ) VALUES (
    v_user_id,
    v_org_name,
    v_owner_name,
    v_owner_phone,
    v_org_id,
    true,
    'Guinée',
    'GNF',
    'enterprise',
    'fr',
    'system'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    business_name = EXCLUDED.business_name,
    owner_name = EXCLUDED.owner_name,
    phone = EXCLUDED.phone,
    organization_id = EXCLUDED.organization_id,
    is_active = true,
    subscription_plan = 'enterprise',
    deactivated_at = NULL,
    deactivation_reason = NULL,
    updated_at = NOW();

  RAISE NOTICE '✅ Profil créé pour %', v_owner_name;

  -- ═══ 5. ASSIGNER LE RÔLE SUPER_ADMIN ════════════════════════════════════
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✅ Rôle super_admin assigné';

  -- ═══ 6. LIER LE MAGASIN PRINCIPAL AU PROFIL ═════════════════════════════
  SELECT id INTO v_store_id FROM public.stores
  WHERE organization_id = v_org_id AND is_headquarters = true
  LIMIT 1;

  IF v_store_id IS NOT NULL THEN
    UPDATE public.profiles SET current_store_id = v_store_id WHERE user_id = v_user_id;
    RAISE NOTICE '✅ Magasin principal lié au profil (ID: %)', v_store_id;
  ELSE
    RAISE NOTICE '⚠️  Aucun magasin principal trouvé — à créer manuellement';
  END IF;

  -- ═══ 7. INITIALISER LES COMPTEURS (NULL = ILLIMITÉ) ════════════════════
  INSERT INTO public.usage_counters (organization_id, counter_type, current_count, limit_value)
  VALUES
    (v_org_id, 'stores',             1, NULL),
    (v_org_id, 'users',              1, NULL),
    (v_org_id, 'products',           0, NULL),
    (v_org_id, 'sales_this_month',   0, NULL),
    (v_org_id, 'exports_this_month', 0, NULL)
  ON CONFLICT (organization_id, counter_type) DO UPDATE SET
    limit_value = NULL,
    updated_at = NOW();

  RAISE NOTICE '✅ Compteurs initialisés (tout illimité)';

  -- ═══ 8. TRACER L'ÉVÉNEMENT ══════════════════════════════════════════════
  INSERT INTO public.subscription_events (
    organization_id, event_type, from_plan, to_plan, performed_by, metadata
  ) VALUES (
    v_org_id,
    'upgraded',
    'starter',
    'enterprise',
    v_user_id,
    jsonb_build_object(
      'reason', 'Super admin setup — Enterprise manuel',
      'expires_at', (NOW() + INTERVAL '100 years')::text,
      'billing_period', 'yearly'
    )
  );

  RAISE NOTICE '✅ Événement d''abonnement enregistré';

  -- ═══ RÉSUMÉ FINAL ════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  🎉 SUPER ADMIN CRÉÉ AVEC SUCCÈS !';
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE '  Email      : %', v_admin_email;
  RAISE NOTICE '  Password   : %', v_admin_password;
  RAISE NOTICE '  Rôle       : super_admin';
  RAISE NOTICE '  Plan       : Enterprise (illimité, 100 ans)';
  RAISE NOTICE '  Org        : % (ID: %)', v_org_name, v_org_id;
  RAISE NOTICE '  User ID    : %', v_user_id;
  RAISE NOTICE '  Store      : %', COALESCE(v_store_id::text, 'N/A');
  RAISE NOTICE '════════════════════════════════════════════════════════════';
END $$;
