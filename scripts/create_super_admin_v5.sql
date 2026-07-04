/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SUPER ADMIN MAKITIPLUS — Plan Enterprise (Tout Illimité) — v5 CORRIGÉ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  EXÉCUTER DANS : Supabase Dashboard -> SQL Editor -> New Query
 *
 * FIX v5 : - $$ imbriqués dans DO $$ causent un syntax error
 *            → Utiliser $fn1$, $fn2$, $fn3$ au lieu de $$ pour les
 *              fonctions internes CREATE OR REPLACE FUNCTION
 *          - auto_create_starter_subscription utilise org_id au lieu de
 *            organization_id → ON CONFLICT (org_id) échoue
 *            → Corriger la fonction AVANT de créer l'organisation
 *          - Désactiver AUSSI trigger_auto_create_subscription pendant
 *            l'insertion de l'org (on crée la subscription manuellement)
 *
 * FIX v4 : - profiles n'a pas de UNIQUE(user_id), ON CONFLICT échoue
 *            → DELETE + INSERT au lieu de ON CONFLICT
 *
 * FIX v3 : - trigger auto_create_store_settings appelle
 *            insert_default_categories qui vérifie auth.uid() = NULL
 *            → DISABLE TRIGGER, INSERT manuel, ENABLE TRIGGER
 *
 * FIX v2 : - confirmed_at est GENERATED, on ne l'insère pas
 *
 * CONNEXION APRÈS EXÉCUTION :
 *   Email    : admin@makitiplus.com
 *   Password : MakitiPlus2026!
 * ═══════════════════════════════════════════════════════════════════════════
 */

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

  -- ================================================================
  -- 0a. CORRIGER la fonction auto_create_starter_subscription
  --     La migration 2026070501 utilise org_id au lieu de organization_id
  --     ON CONFLICT (org_id) → ERROR 42P10
  --     ⚠️ Utiliser $fn1$ au lieu de $$ (sinon conflit avec DO $outer$)
  -- ================================================================
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

  RAISE NOTICE 'Fonction auto_create_starter_subscription corrigee (organization_id)';

  -- ================================================================
  -- 0a2. CORRIGER la fonction check_plan_limit
  --      Inclure 'trialing' dans les statuts actifs
  --      ⚠️ Utiliser $fn2$ au lieu de $$
  -- ================================================================
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

    -- Get active subscription (trialing est aussi un statut actif)
    SELECT * INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.organization_id = v_org_id
      AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- If no subscription, default to starter limits
    IF NOT FOUND THEN
      SELECT * INTO v_sub FROM public.plans WHERE id = 'starter';
    END IF;

    -- Calculate current count based on limit type
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

    -- NULL limit means unlimited
    RETURN QUERY SELECT
      (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
      v_current,
      v_limit,
      v_sub.plan_id;
  END;
  $fn2$;

  RAISE NOTICE 'Fonction check_plan_limit corrigee (trialing inclus)';

  -- ================================================================
  -- 0a3. CORRIGER la fonction check_feature_access
  --      Inclure 'trialing' dans les statuts actifs
  --      ⚠️ Utiliser $fn3$ au lieu de $$
  -- ================================================================
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

    -- Get organization's plan (trialing = active)
    SELECT s.plan_id INTO v_plan_id
    FROM public.subscriptions s
    WHERE s.organization_id = v_org_id
      AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- Default to starter if no subscription
    IF v_plan_id IS NULL THEN
      v_plan_id := 'starter';
    END IF;

    -- Get feature's allowed plans
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

  -- ================================================================
  -- 0b. S'assurer que les colonnes/tables manquantes existent
  --     (migrations Stripe et SaaS pas encore déployées sur production)
  -- ================================================================

  -- billing_period dans subscriptions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='billing_period') THEN
    ALTER TABLE public.subscriptions ADD COLUMN billing_period TEXT DEFAULT 'monthly' CHECK (billing_period IN ('monthly','yearly'));
  END IF;

  -- stripe_customer_id dans organizations
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='stripe_customer_id') THEN
    ALTER TABLE public.organizations ADD COLUMN stripe_customer_id TEXT DEFAULT NULL;
  END IF;

  -- stripe_subscription_id dans subscriptions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='stripe_subscription_id') THEN
    ALTER TABLE public.subscriptions ADD COLUMN stripe_subscription_id TEXT DEFAULT NULL;
  END IF;

  -- plans table
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

  -- S'assurer que le plan enterprise existe (prix a jour : 99.90)
  INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, currency, max_stores, max_users, max_products, max_sales_per_month,
    has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced,
    has_api_access, has_priority_support, has_custom_branding, has_multi_currency, has_ai_assistant, has_loyalty_program,
    sort_order, is_active)
  VALUES ('enterprise', 'Enterprise', 'Pour les chaines et grossistes — analytics, API, support prioritaire',
    99.90, 999.00, 'EUR', NULL, NULL, NULL, NULL,
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 3, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    name=EXCLUDED.name, price_monthly=EXCLUDED.price_monthly, price_yearly=EXCLUDED.price_yearly,
    max_stores=NULL, max_users=NULL, max_products=NULL, max_sales_per_month=NULL,
    has_api_access=TRUE, has_priority_support=TRUE, has_custom_branding=TRUE,
    has_multi_currency=TRUE, has_ai_assistant=TRUE, has_loyalty_program=TRUE;

  -- S'assurer que le plan croissance existe (prix a jour : 39.90)
  INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, currency, max_stores, max_users, max_products,
    has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced,
    has_custom_branding, has_multi_currency, sort_order, is_active)
  VALUES ('croissance', 'Croissance', 'Pour les boutiques qui grandissent — fournisseurs, rapports, exports',
    39.90, 399.00, 'EUR', 3, 10, 5000,
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 2, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    name=EXCLUDED.name, price_monthly=EXCLUDED.price_monthly, price_yearly=EXCLUDED.price_yearly;

  -- S'assurer que le plan starter existe (essai gratuit 14 jours)
  INSERT INTO public.plans (id, name, description, price_monthly, max_stores, max_users, max_products,
    has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced, sort_order, is_active)
  VALUES ('starter', 'Essai gratuit', 'Periode d''essai de 14 jours — caisse et stock de base',
    0.00, 1, 2, 500, FALSE, FALSE, FALSE, FALSE, 1, TRUE)
  ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;

  -- subscription_events table
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

  -- usage_counters table
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

  -- stripe_events table
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

  RAISE NOTICE 'Colonnes et tables verifiees/ajoutees';

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
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, phone, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id,
    'authenticated', 'authenticated', v_admin_email,
    crypt(v_admin_password, gen_salt('bf')), NOW(), v_owner_phone,
    NOW(), NOW(), '', '', '', ''
  );

  RAISE NOTICE 'Utilisateur auth cree : % (ID: %)', v_admin_email, v_user_id;

  -- ================================================================
  -- 2. DESACTIVER LES TRIGGERS puis CREER L'ORGANISATION
  --    - trigger_auto_create_store_settings : appelle
  --      insert_default_categories qui verifie auth.uid() = NULL
  --    - trigger_auto_create_subscription : on cree la subscription
  --      Enterprise manuellement, pas besoin du starter auto
  -- ================================================================
  ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_store_settings;
  ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_subscription;

  INSERT INTO public.organizations (name, owner_user_id, country, currency, category, subscription_plan)
  VALUES (v_org_name, v_user_id, 'Guinee', 'GNF', 'alimentation_generale', 'enterprise')
  RETURNING id INTO v_org_id;

  RAISE NOTICE 'Organisation creee : % (ID: %)', v_org_name, v_org_id;

  -- ================================================================
  -- 3. CREER MANUELLEMENT STORE_SETTINGS + CATEGORIES
  --    (normalement faits par le trigger desactive)
  -- ================================================================
  INSERT INTO public.store_settings (organization_id, store_name)
  VALUES (v_org_id, v_org_name) ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.categories (name, icon, color, description, is_default, sort_order, organization_id, user_id) VALUES
    ('Alimentaire','UtensilsCrossed','#F59E0B','Produits alimentaires et boissons',true,1,v_org_id,v_user_id),
    ('Boissons','Wine','#3B82F6','Boissons et rafraichissements',true,2,v_org_id,v_user_id),
    ('Hygiene','Sparkles','#10B981','Produits d''hygiene et soins',true,3,v_org_id,v_user_id),
    ('Electromenager','Plug','#8B5CF6','Appareils electromenagers',true,4,v_org_id,v_user_id),
    ('Textile','Shirt','#EC4899','Vetements et textiles',true,5,v_org_id,v_user_id),
    ('Quincaillerie','Wrench','#EF4444','Outils et quincaillerie',true,6,v_org_id,v_user_id),
    ('Cosmetiques','Sparkles','#D946EF','Produits cosmetiques et beaute',true,7,v_org_id,v_user_id),
    ('Papeterie','FileText','#14B8A6','Fournitures et papeterie',true,8,v_org_id,v_user_id),
    ('Autres','Package','#6B7280','Autres produits non classes',true,99,v_org_id,v_user_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Store settings et categories crees';

  -- ================================================================
  -- 4. REACTIVER LES TRIGGERS
  -- ================================================================
  ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;
  ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_subscription;

  -- ================================================================
  -- 5. SUBSCRIPTION ENTERPRISE (ILLIMITE, 100 ANS)
  --    Note: on utilise organization_id, PAS org_id
  -- ================================================================
  UPDATE public.subscriptions SET
    plan_id='enterprise', status='active', billing_period='yearly',
    current_period_start=NOW(), current_period_end=NOW()+INTERVAL '100 years', updated_at=NOW()
  WHERE organization_id=v_org_id RETURNING id INTO v_sub_id;

  IF v_sub_id IS NULL THEN
    INSERT INTO public.subscriptions (organization_id, plan_id, status, billing_period, current_period_start, current_period_end)
    VALUES (v_org_id, 'enterprise', 'active', 'yearly', NOW(), NOW()+INTERVAL '100 years') RETURNING id INTO v_sub_id;
  END IF;

  RAISE NOTICE 'Subscription Enterprise OK (ID: %)', v_sub_id;

  -- ================================================================
  -- 6. CREER LE PROFIL (DELETE puis INSERT, pas ON CONFLICT)
  --    La table profiles n'a pas de UNIQUE(user_id), donc ON CONFLICT
  --    echoue. On delete d'abord puis on insere.
  -- ================================================================
  DELETE FROM public.profiles WHERE user_id = v_user_id;

  INSERT INTO public.profiles (
    user_id, business_name, owner_name, phone, organization_id,
    is_active, country, currency, subscription_plan, language, theme_mode
  ) VALUES (
    v_user_id, v_org_name, v_owner_name, v_owner_phone, v_org_id,
    true, 'Guinee', 'GNF', 'enterprise', 'fr', 'system'
  );

  RAISE NOTICE 'Profil cree pour %', v_owner_name;

  -- ================================================================
  -- 7. ROLE SUPER_ADMIN
  -- ================================================================
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'super_admin');

  RAISE NOTICE 'Role super_admin assigne';

  -- ================================================================
  -- 8. LIER MAGASIN PRINCIPAL
  -- ================================================================
  SELECT id INTO v_store_id FROM public.stores WHERE organization_id=v_org_id AND is_headquarters=true LIMIT 1;
  IF v_store_id IS NOT NULL THEN
    UPDATE public.profiles SET current_store_id=v_store_id WHERE user_id=v_user_id;
    RAISE NOTICE 'Magasin principal lie (ID: %)', v_store_id;
  ELSE
    RAISE NOTICE 'Aucun magasin principal trouve — le trigger on_organization_created creera le store';
  END IF;

  -- ================================================================
  -- 9. COMPTEURS (NULL = ILLIMITE)
  -- ================================================================
  INSERT INTO public.usage_counters (organization_id, counter_type, current_count, limit_value) VALUES
    (v_org_id,'stores',1,NULL),
    (v_org_id,'users',1,NULL),
    (v_org_id,'products',0,NULL),
    (v_org_id,'sales_this_month',0,NULL),
    (v_org_id,'exports_this_month',0,NULL)
  ON CONFLICT (organization_id, counter_type) DO UPDATE SET limit_value=NULL, updated_at=NOW();

  RAISE NOTICE 'Compteurs initialises (illimite)';

  -- ================================================================
  -- 10. EVENEMENT
  -- ================================================================
  INSERT INTO public.subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
  VALUES (v_org_id, 'upgraded', 'starter', 'enterprise', v_user_id,
    jsonb_build_object('reason','Super admin setup','expires_at',(NOW()+INTERVAL '100 years')::text,'billing_period','yearly'));

  RAISE NOTICE 'Evenement enregistre';

  -- ================================================================
  -- RESUME FINAL
  -- ================================================================
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
