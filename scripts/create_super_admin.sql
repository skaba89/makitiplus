/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SUPER ADMIN MAKITIPLUS — Plan Enterprise (Tout Illimite) — v3 CORRIGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  EXECUTER DANS : Supabase Dashboard -> SQL Editor -> New Query
 *  MODIFIEZ l'email/mot de passe ci-dessous avant d'executer !
 *
 * FIX v3 : Le trigger auto_create_store_settings appelle
 *          insert_default_categories qui verifie auth.uid() via
 *          is_member_of_organization(). Or dans le SQL Editor,
 *          auth.uid() = NULL donc l'acces est refuse.
 *          Solution : desactiver le trigger temporairement, creer
 *          l'organisation, puis creer manuellement store_settings
 *          et categories, et reactiver le trigger.
 *
 * FIX v2 : confirmed_at est une colonne GENERATED dans Supabase recent,
 *          on ne peut pas y inserer de valeur — email_confirmed_at suffit.
 *
 * CONNEXION APRES EXECUTION :
 *   Email    : admin@makitiplus.com
 *   Password : MakitiPlus2026!
 * ═══════════════════════════════════════════════════════════════════════════
 */

DO $$
DECLARE
  v_admin_email    text := 'admin@makitiplus.com';
  v_admin_password text := 'MakitiPlus2026!';
  v_org_name       text := 'MakitiPlus HQ';
  v_owner_name     text := 'Admin MakitiPlus';
  v_owner_phone    text := '+224 622 00 00 00';

  v_user_id  uuid;
  v_org_id   uuid;
  v_store_id uuid;
  v_sub_id   uuid;
BEGIN
  -- ================================================================
  -- NETTOYAGE IDEMPOTENT
  -- ================================================================
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_admin_email;

  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE 'Utilisateur existant detecte (%), nettoyage...', v_admin_email;

    DELETE FROM public.user_roles WHERE user_id = v_user_id;

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

    RAISE NOTICE 'Nettoyage termine';
  END IF;

  -- ================================================================
  -- 1. CREER L'UTILISATEUR AUTH
  --    NOTE: confirmed_at est GENERATED, on NE l'insere PAS.
  --    email_confirmed_at = NOW() suffit pour confirmer le compte.
  -- ================================================================
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

  RAISE NOTICE 'Utilisateur auth cree : % (ID: %)', v_admin_email, v_user_id;

  -- ================================================================
  -- 2. DESACTIVER LE TRIGGER puis CREER L'ORGANISATION
  --    Le trigger auto_create_store_settings appelle
  --    insert_default_categories qui verifie auth.uid().
  --    Dans le SQL Editor, auth.uid() = NULL, donc le check echoue.
  --    On desactive le trigger, on cree l'org, puis on reactivera.
  -- ================================================================
  ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_store_settings;

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
    'Guinee',
    'GNF',
    'alimentation_generale',
    'enterprise'
  )
  RETURNING id INTO v_org_id;

  RAISE NOTICE 'Organisation creee : % (ID: %)', v_org_name, v_org_id;

  -- ================================================================
  -- 3. CREER MANUELLEMENT LES STORE_SETTINGS
  --    (normalement fait par le trigger desactive)
  -- ================================================================
  INSERT INTO public.store_settings (organization_id, store_name)
  VALUES (v_org_id, v_org_name)
  ON CONFLICT (organization_id) DO NOTHING;

  RAISE NOTICE 'Store settings crees pour %', v_org_name;

  -- ================================================================
  -- 4. CREER MANUELLEMENT LES CATEGORIES PAR DEFAUT
  --    (normalement fait par insert_default_categories via le trigger)
  --    On les insere directement pour contourner le check auth.uid().
  -- ================================================================
  INSERT INTO public.categories (name, icon, color, description, is_default, sort_order, organization_id, user_id)
  VALUES
    ('Alimentaire',     'UtensilsCrossed', '#F59E0B', 'Produits alimentaires et boissons',           true, 1,  v_org_id, v_user_id),
    ('Boissons',        'Wine',            '#3B82F6', 'Boissons et rafraichissements',               true, 2,  v_org_id, v_user_id),
    ('Hygiene',         'Sparkles',        '#10B981', 'Produits d''hygiene et soins',                true, 3,  v_org_id, v_user_id),
    ('Electromenager',  'Plug',            '#8B5CF6', 'Appareils electromenagers',                   true, 4,  v_org_id, v_user_id),
    ('Textile',         'Shirt',           '#EC4899', 'Vetements et textiles',                       true, 5,  v_org_id, v_user_id),
    ('Quincaillerie',   'Wrench',          '#EF4444', 'Outils et quincaillerie',                     true, 6,  v_org_id, v_user_id),
    ('Cosmetiques',     'Sparkles',        '#D946EF', 'Produits cosmetiques et beaute',              true, 7,  v_org_id, v_user_id),
    ('Papeterie',       'FileText',        '#14B8A6', 'Fournitures et papeterie',                    true, 8,  v_org_id, v_user_id),
    ('Autres',          'Package',         '#6B7280', 'Autres produits non classes',                  true, 99, v_org_id, v_user_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Categories par defaut creees';

  -- ================================================================
  -- 5. REACTIVER LE TRIGGER
  -- ================================================================
  ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;

  RAISE NOTICE 'Trigger re-active';

  -- ================================================================
  -- 6. AJOUTER billing_period SI LA COLONNE N'EXISTE PAS
  --    (migration Stripe pas encore deployee sur production)
  -- ================================================================
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'billing_period'
  ) THEN
    ALTER TABLE public.subscriptions ADD COLUMN billing_period TEXT DEFAULT 'monthly'
      CHECK (billing_period IN ('monthly', 'yearly'));
    RAISE NOTICE 'Colonne billing_period ajoutee a subscriptions';
  END IF;

  -- ================================================================
  -- 7. UPGRADE SUBSCRIPTION -> ENTERPRISE (ILLIMITE, 100 ANS)
  -- ================================================================
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
    INSERT INTO public.subscriptions (
      organization_id, plan_id, status, billing_period,
      current_period_start, current_period_end
    ) VALUES (
      v_org_id, 'enterprise', 'active', 'yearly',
      NOW(), NOW() + INTERVAL '100 years'
    )
    RETURNING id INTO v_sub_id;
    RAISE NOTICE 'Subscription Enterprise creee manuellement (ID: %)', v_sub_id;
  ELSE
    RAISE NOTICE 'Subscription upgrade starter -> enterprise (ID: %)', v_sub_id;
  END IF;

  -- ================================================================
  -- 7. CREER LE PROFIL COMPLET
  -- ================================================================
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
    'Guinee',
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

  RAISE NOTICE 'Profil cree pour %', v_owner_name;

  -- ================================================================
  -- 8. ASSIGNER LE ROLE SUPER_ADMIN
  -- ================================================================
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Role super_admin assigne';

  -- ================================================================
  -- 9. LIER LE MAGASIN PRINCIPAL AU PROFIL
  -- ================================================================
  SELECT id INTO v_store_id FROM public.stores
  WHERE organization_id = v_org_id AND is_headquarters = true
  LIMIT 1;

  IF v_store_id IS NOT NULL THEN
    UPDATE public.profiles SET current_store_id = v_store_id WHERE user_id = v_user_id;
    RAISE NOTICE 'Magasin principal lie au profil (ID: %)', v_store_id;
  ELSE
    RAISE NOTICE 'Aucun magasin principal trouve -- a creer manuellement';
  END IF;

  -- ================================================================
  -- 10. INITIALISER LES COMPTEURS (NULL = ILLIMITE)
  -- ================================================================
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

  RAISE NOTICE 'Compteurs initialises (tout illimite)';

  -- ================================================================
  -- 11. TRACER L'EVENEMENT
  -- ================================================================
  INSERT INTO public.subscription_events (
    organization_id, event_type, from_plan, to_plan, performed_by, metadata
  ) VALUES (
    v_org_id,
    'upgraded',
    'starter',
    'enterprise',
    v_user_id,
    jsonb_build_object(
      'reason', 'Super admin setup - Enterprise manuel',
      'expires_at', (NOW() + INTERVAL '100 years')::text,
      'billing_period', 'yearly'
    )
  );

  RAISE NOTICE 'Evenement d''abonnement enregistre';

  -- ================================================================
  -- RESUME FINAL
  -- ================================================================
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '  SUPER ADMIN CREE AVEC SUCCES !';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '  Email      : %', v_admin_email;
  RAISE NOTICE '  Password   : %', v_admin_password;
  RAISE NOTICE '  Role       : super_admin';
  RAISE NOTICE '  Plan       : Enterprise (illimite, 100 ans)';
  RAISE NOTICE '  Org        : % (ID: %)', v_org_name, v_org_id;
  RAISE NOTICE '  User ID    : %', v_user_id;
  RAISE NOTICE '  Store      : %', COALESCE(v_store_id::text, 'N/A');
  RAISE NOTICE '================================================================';
END $$;
