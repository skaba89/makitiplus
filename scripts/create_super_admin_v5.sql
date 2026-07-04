-- ======================================================================
-- SUPER ADMIN MAKITIPLUS - Plan Enterprise (Tout Illimite) - v5 CORRIGE
-- ======================================================================
-- EXECUTER DANS : Supabase Dashboard -> SQL Editor -> New Query
--
-- CONNEXION APRES EXECUTION :
--   Email    : admin@makitiplus.com
--   Password : MakitiPlus2026!
-- ======================================================================

DO $outer$
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

  -- 0a. Corriger auto_create_starter_subscription (organization_id pas org_id)
  CREATE OR REPLACE FUNCTION public.auto_create_starter_subscription()
  RETURNS TRIGGER AS $fn1$
  DECLARE
    v_trial_end TIMESTAMPTZ;
  BEGIN
    v_trial_end := NOW() + INTERVAL '14 days';
    INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
    VALUES (NEW.id, 'starter', 'trialing', NOW(), v_trial_end)
    ON CONFLICT (organization_id) DO NOTHING;
    RETURN NEW;
  END;
  $fn1$ LANGUAGE plpgsql SECURITY DEFINER;

  RAISE NOTICE 'Fonction auto_create_starter_subscription corrigee';

  -- 0a2. Corriger check_plan_limit (inclure trialing)
  CREATE OR REPLACE FUNCTION public.check_plan_limit(
    p_limit_type TEXT
  )
  RETURNS TABLE (
    allowed BOOLEAN,
    current_count INTEGER,
    limit_value INTEGER,
    plan_id TEXT
  )
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn2$
  DECLARE
    v_org_id UUID;
    v_sub record;
    v_current INTEGER;
    v_limit INTEGER;
  BEGIN
    v_org_id := public.get_user_organization_id();
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Organisation introuvable';
    END IF;

    SELECT * INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.organization_id = v_org_id
      AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT * INTO v_sub FROM public.plans WHERE id = 'starter';
    END IF;

    CASE p_limit_type
      WHEN 'stores' THEN
        SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
        v_limit := v_sub.max_stores;
      WHEN 'users' THEN
        SELECT COUNT(*) INTO v_current FROM public.user_roles ur
        JOIN public.profiles p ON p.user_id = ur.user_id
        WHERE p.organization_id = v_org_id;
        v_limit := v_sub.max_users;
      WHEN 'products' THEN
        SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id;
        v_limit := v_sub.max_products;
      WHEN 'sales_this_month' THEN
        SELECT COUNT(*) INTO v_current FROM public.sales
        WHERE organization_id = v_org_id
          AND created_at >= date_trunc('month', NOW());
        v_limit := v_sub.max_sales_per_month;
      ELSE
        RAISE EXCEPTION 'Type de limite inconnu : %', p_limit_type;
    END CASE;

    RETURN QUERY SELECT
      (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
      v_current,
      v_limit,
      v_sub.plan_id;
  END;
  $fn2$;

  RAISE NOTICE 'Fonction check_plan_limit corrigee (trialing inclus)';

  -- 0a3. Corriger check_feature_access (inclure trialing)
  CREATE OR REPLACE FUNCTION public.check_feature_access(
    p_feature_key TEXT
  )
  RETURNS TABLE (
    allowed BOOLEAN,
    plan_id TEXT
  )
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $fn3$
  DECLARE
    v_org_id UUID;
    v_plan_id TEXT;
    v_allowed_plans TEXT[];
  BEGIN
    v_org_id := public.get_user_organization_id();
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Organisation introuvable';
    END IF;

    SELECT s.plan_id INTO v_plan_id
    FROM public.subscriptions s
    WHERE s.organization_id = v_org_id
      AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_plan_id IS NULL THEN
      v_plan_id := 'starter';
    END IF;

    SELECT allowed_plans INTO v_allowed_plans
    FROM public.feature_flags
    WHERE feature_key = p_feature_key AND is_active = TRUE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, v_plan_id;
      RETURN;
    END IF;

    RETURN QUERY SELECT (v_plan_id = ANY(v_allowed_plans))::BOOLEAN, v_plan_id;
  END;
  $fn3$;

  RAISE NOTICE 'Fonction check_feature_access corrigee (trialing inclus)';

  -- 0b. Verifier que les colonnes/tables manquantes existent

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='billing_period') THEN
    ALTER TABLE public.subscriptions ADD COLUMN billing_period TEXT DEFAULT 'monthly' CHECK (billing_period IN ('monthly','yearly'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='stripe_customer_id') THEN
    ALTER TABLE public.organizations ADD COLUMN stripe_customer_id TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='stripe_subscription_id') THEN
    ALTER TABLE public.subscriptions ADD COLUMN stripe_subscription_id TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='plans') THEN
    CREATE TABLE public.plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
      price_yearly NUMERIC(10,2) DEFAULT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      max_stores INTEGER DEFAULT NULL,
      max_users INTEGER DEFAULT NULL,
      max_products INTEGER DEFAULT NULL,
      max_sales_per_month INTEGER DEFAULT NULL,
      has_advanced_reports BOOLEAN NOT NULL DEFAULT FALSE,
      has_exports BOOLEAN NOT NULL DEFAULT FALSE,
      has_supplier_management BOOLEAN NOT NULL DEFAULT FALSE,
      has_offline_advanced BOOLEAN NOT NULL DEFAULT FALSE,
      has_api_access BOOLEAN NOT NULL DEFAULT FALSE,
      has_priority_support BOOLEAN NOT NULL DEFAULT FALSE,
      has_custom_branding BOOLEAN NOT NULL DEFAULT FALSE,
      has_multi_currency BOOLEAN NOT NULL DEFAULT FALSE,
      has_ai_assistant BOOLEAN NOT NULL DEFAULT FALSE,
      has_loyalty_program BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;

  -- Plan enterprise (99.90 EUR)
  INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, currency, max_stores, max_users, max_products, max_sales_per_month,
    has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced,
    has_api_access, has_priority_support, has_custom_branding, has_multi_currency, has_ai_assistant, has_loyalty_program,
    sort_order, is_active)
  VALUES ('enterprise', 'Enterprise', 'Pour les chaines et grossistes',
    99.90, 999.00, 'EUR', NULL, NULL, NULL, NULL,
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 3, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    name=EXCLUDED.name, price_monthly=EXCLUDED.price_monthly, price_yearly=EXCLUDED.price_yearly,
    max_stores=NULL, max_users=NULL, max_products=NULL, max_sales_per_month=NULL,
    has_api_access=TRUE, has_priority_support=TRUE, has_custom_branding=TRUE,
    has_multi_currency=TRUE, has_ai_assistant=TRUE, has_loyalty_program=TRUE;

  -- Plan croissance (39.90 EUR)
  INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, currency, max_stores, max_users, max_products,
    has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced,
    has_custom_branding, has_multi_currency, sort_order, is_active)
  VALUES ('croissance', 'Croissance', 'Pour les boutiques qui grandissent',
    39.90, 399.00, 'EUR', 3, 10, 5000,
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 2, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    name=EXCLUDED.name, price_monthly=EXCLUDED.price_monthly, price_yearly=EXCLUDED.price_yearly;

  -- Plan starter (essai gratuit 14 jours)
  INSERT INTO public.plans (id, name, description, price_monthly, max_stores, max_users, max_products,
    has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced, sort_order, is_active)
  VALUES ('starter', 'Essai gratuit', 'Periode dessai de 14 jours',
    0.00, 1, 2, 500, FALSE, FALSE, FALSE, FALSE, 1, TRUE)
  ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='subscription_events') THEN
    CREATE TABLE public.subscription_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      from_plan TEXT,
      to_plan TEXT,
      performed_by UUID,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='usage_counters') THEN
    CREATE TABLE public.usage_counters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      counter_type TEXT NOT NULL,
      current_count INTEGER NOT NULL DEFAULT 0,
      limit_value INTEGER DEFAULT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, counter_type)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stripe_events') THEN
    CREATE TABLE public.stripe_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
      stripe_event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      payload JSONB DEFAULT '{}',
      processed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;

  -- Ajouter trialing au status check si necessaire
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_status_check'
    AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_catalog.pg_get_constraintdef(c.oid) AS def ON TRUE
      WHERE c.conname = 'subscriptions_status_check'
      AND def LIKE '%trialing%'
    ) THEN
      ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
      ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
        CHECK (status IN ('active', 'trialing', 'past_due', 'grace_period', 'read_only', 'cancelled', 'expired'));
    END IF;
  END IF;

  RAISE NOTICE 'Colonnes et tables verifiees';

  -- NETTOYAGE IDEMPOTENT
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_admin_email;

  IF v_user_id IS NOT NULL THEN
    RAISE NOTICE 'Utilisateur existant detecte, nettoyage...';

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

  -- 1. CREER L'UTILISATEUR AUTH
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, phone, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id,
    'authenticated', 'authenticated', v_admin_email,
    crypt(v_admin_password, gen_salt('bf')), NOW(), v_owner_phone,
    NOW(), NOW(), '', '', '', ''
  );

  RAISE NOTICE 'Utilisateur auth cree : %', v_admin_email;

  -- 2. DESACTIVER LES TRIGGERS PUIS CREER L'ORGANISATION
  ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_store_settings;
  ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_subscription;

  INSERT INTO public.organizations (name, owner_user_id, country, currency, category, subscription_plan)
  VALUES (v_org_name, v_user_id, 'Guinee', 'GNF', 'alimentation_generale', 'enterprise')
  RETURNING id INTO v_org_id;

  RAISE NOTICE 'Organisation creee : %', v_org_name;

  -- 3. CREER MANUELLEMENT STORE_SETTINGS + CATEGORIES
  INSERT INTO public.store_settings (organization_id, store_name)
  VALUES (v_org_id, v_org_name) ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.categories (name, icon, color, description, is_default, sort_order, organization_id, user_id) VALUES
    ('Alimentaire','UtensilsCrossed','#F59E0B','Produits alimentaires',true,1,v_org_id,v_user_id),
    ('Boissons','Wine','#3B82F6','Boissons',true,2,v_org_id,v_user_id),
    ('Hygiene','Sparkles','#10B981','Produits hygiene',true,3,v_org_id,v_user_id),
    ('Electromenager','Plug','#8B5CF6','Appareils electromenagers',true,4,v_org_id,v_user_id),
    ('Textile','Shirt','#EC4899','Vetements',true,5,v_org_id,v_user_id),
    ('Quincaillerie','Wrench','#EF4444','Outils et quincaillerie',true,6,v_org_id,v_user_id),
    ('Cosmetiques','Sparkles','#D946EF','Cosmetiques',true,7,v_org_id,v_user_id),
    ('Papeterie','FileText','#14B8A6','Fournitures',true,8,v_org_id,v_user_id),
    ('Autres','Package','#6B7280','Autres produits',true,99,v_org_id,v_user_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Store settings et categories crees';

  -- 4. REACTIVER LES TRIGGERS
  ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;
  ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_subscription;

  -- 5. SUBSCRIPTION ENTERPRISE (ILLIMITE, 100 ANS)
  UPDATE public.subscriptions SET
    plan_id='enterprise', status='active', billing_period='yearly',
    current_period_start=NOW(), current_period_end=NOW()+INTERVAL '100 years', updated_at=NOW()
  WHERE organization_id=v_org_id RETURNING id INTO v_sub_id;

  IF v_sub_id IS NULL THEN
    INSERT INTO public.subscriptions (organization_id, plan_id, status, billing_period, current_period_start, current_period_end)
    VALUES (v_org_id, 'enterprise', 'active', 'yearly', NOW(), NOW()+INTERVAL '100 years') RETURNING id INTO v_sub_id;
  END IF;

  RAISE NOTICE 'Subscription Enterprise OK';

  -- 6. CREER LE PROFIL (DELETE puis INSERT)
  DELETE FROM public.profiles WHERE user_id = v_user_id;

  INSERT INTO public.profiles (
    user_id, business_name, owner_name, phone, organization_id,
    is_active, country, currency, subscription_plan, language, theme_mode
  ) VALUES (
    v_user_id, v_org_name, v_owner_name, v_owner_phone, v_org_id,
    true, 'Guinee', 'GNF', 'enterprise', 'fr', 'system'
  );

  RAISE NOTICE 'Profil cree';

  -- 7. ROLE SUPER_ADMIN
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'super_admin');

  RAISE NOTICE 'Role super_admin assigne';

  -- 8. LIER MAGASIN PRINCIPAL
  SELECT id INTO v_store_id FROM public.stores WHERE organization_id=v_org_id AND is_headquarters=true LIMIT 1;
  IF v_store_id IS NOT NULL THEN
    UPDATE public.profiles SET current_store_id=v_store_id WHERE user_id=v_user_id;
    RAISE NOTICE 'Magasin principal lie';
  ELSE
    RAISE NOTICE 'Aucun magasin principal trouve';
  END IF;

  -- 9. COMPTEURS (NULL = ILLIMITE)
  INSERT INTO public.usage_counters (organization_id, counter_type, current_count, limit_value) VALUES
    (v_org_id,'stores',1,NULL),
    (v_org_id,'users',1,NULL),
    (v_org_id,'products',0,NULL),
    (v_org_id,'sales_this_month',0,NULL),
    (v_org_id,'exports_this_month',0,NULL)
  ON CONFLICT (organization_id, counter_type) DO UPDATE SET limit_value=NULL, updated_at=NOW();

  RAISE NOTICE 'Compteurs initialises (illimite)';

  -- 10. EVENEMENT
  INSERT INTO public.subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
  VALUES (v_org_id, 'upgraded', 'starter', 'enterprise', v_user_id,
    jsonb_build_object('reason','Super admin setup','expires_at',(NOW()+INTERVAL '100 years')::text,'billing_period','yearly'));

  RAISE NOTICE 'Evenement enregistre';

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
END $outer$;
