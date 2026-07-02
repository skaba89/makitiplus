-- ═══════════════════════════════════════════════════════════════════════════
-- FIX PRODUCTION — Corrige toutes les erreurs 400/403/404
-- Execute dans : Supabase Dashboard -> SQL Editor -> New Query
--
-- Erreurs corriges :
--   400 get_organization_stores  -> RPC recree avec la bonne signature
--   403 subscriptions upsert     -> RLS INSERT/UPDATE policies ajoutees
--   404 update_onboarding_progress -> RPC cree
--   404 update_business_type     -> RPC cree
--   404 setup_onboarding_store   -> RPC cree
-- ═══════════════════════════════════════════════════════════════════════════

-- ================================================================
-- 1. RECREE get_organization_stores (fix 400)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_organization_stores()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, address TEXT, city TEXT, country TEXT,
  currency TEXT, phone TEXT, is_active BOOLEAN, is_headquarters BOOLEAN,
  category public.store_category, metadata JSONB,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  product_count BIGINT, sales_this_month NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.name, s.slug, s.address, s.city, s.country, s.currency, s.phone,
    s.is_active, s.is_headquarters, s.category, s.metadata, s.created_at, s.updated_at,
    COALESCE(pcnt.cnt, 0) AS product_count,
    COALESCE(sales.total, 0) AS sales_this_month
  FROM public.stores s
  LEFT JOIN (
    SELECT store_id, COUNT(*) AS cnt FROM public.products
    WHERE store_id IS NOT NULL GROUP BY store_id
  ) pcnt ON pcnt.store_id = s.id
  LEFT JOIN (
    SELECT store_id, SUM(total_amount) AS total FROM public.sales
    WHERE store_id IS NOT NULL AND created_at >= date_trunc('month', now())
    GROUP BY store_id
  ) sales ON sales.store_id = s.id
  WHERE s.organization_id = v_org_id
  ORDER BY s.is_headquarters DESC, s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_stores() TO authenticated;

-- ================================================================
-- 2. AJOUTER RLS INSERT/UPDATE sur subscriptions (fix 403)
--    Le frontend fait un upsert mais seule la policy SELECT existait.
--    On cree un RPC securise (select_plan) pour le onboarding,
--    ET on ajoute des policies INSERT/UPDATE pour les cas legaux.
-- ================================================================

-- Policy INSERT: les admins d'une org peuvent inserer leur subscription
DROP POLICY IF EXISTS "org_admins_can_insert_subscription" ON public.subscriptions;
CREATE POLICY "org_admins_can_insert_subscription" ON public.subscriptions
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
    )
  );

-- Policy UPDATE: les admins d'une org peuvent updater leur subscription
DROP POLICY IF EXISTS "org_admins_can_update_subscription" ON public.subscriptions;
CREATE POLICY "org_admins_can_update_subscription" ON public.subscriptions
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.is_active = true
    )
  );

-- ================================================================
-- 3. CREER update_onboarding_progress (fix 404)
--    Met a jour la progression de l'onboarding pour l'utilisateur
-- ================================================================
CREATE OR REPLACE FUNCTION public.update_onboarding_progress(
  p_current_step TEXT DEFAULT NULL,
  p_completed_steps TEXT[] DEFAULT NULL,
  p_onboarding_complete BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifie';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = v_user_id AND is_active = true LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvee';
  END IF;

  -- Update organizations metadata with onboarding progress
  UPDATE public.organizations
  SET metadata = COALESCE(metadata, '{}'::jsonb) ||
    jsonb_build_object(
      'onboarding', COALESCE(metadata->'onboarding', '{}'::jsonb) ||
      jsonb_strip_nulls(jsonb_build_object(
        'current_step', p_current_step,
        'completed_steps', CASE WHEN p_completed_steps IS NOT NULL THEN to_jsonb(p_completed_steps) ELSE NULL END,
        'onboarding_complete', p_onboarding_complete,
        'updated_at', NOW()::text
      ))
    ),
    updated_at = NOW()
  WHERE id = v_org_id
  RETURNING metadata->'onboarding' INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_onboarding_progress(TEXT, TEXT[], BOOLEAN) TO authenticated;

-- ================================================================
-- 4. CREER update_business_type (fix 404)
--    Met a jour le type de commerce pendant l'onboarding
-- ================================================================
CREATE OR REPLACE FUNCTION public.update_business_type(
  p_category TEXT,
  p_currency TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifie';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = v_user_id AND is_active = true LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvee';
  END IF;

  -- Update organization category and optional fields
  UPDATE public.organizations
  SET
    category = p_category,
    currency = COALESCE(p_currency, currency),
    country = COALESCE(p_country, country),
    updated_at = NOW()
  WHERE id = v_org_id
  RETURNING jsonb_build_object(
    'category', category,
    'currency', currency,
    'country', country
  ) INTO v_result;

  -- Also update profile
  UPDATE public.profiles
  SET
    currency = COALESCE(p_currency, currency),
    country = COALESCE(p_country, country),
    updated_at = NOW()
  WHERE user_id = v_user_id AND organization_id = v_org_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_business_type(TEXT, TEXT, TEXT) TO authenticated;

-- ================================================================
-- 5. CREER setup_onboarding_store (fix 404)
--    Cree le magasin principal pendant l'onboarding
-- ================================================================
CREATE OR REPLACE FUNCTION public.setup_onboarding_store(
  p_store_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_category public.store_category DEFAULT 'alimentation_generale'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_store_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifie';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = v_user_id AND is_active = true LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvee';
  END IF;

  -- Check if store already exists for this org
  SELECT id INTO v_store_id FROM public.stores
  WHERE organization_id = v_org_id AND is_headquarters = true LIMIT 1;

  IF v_store_id IS NOT NULL THEN
    -- Update existing store
    UPDATE public.stores
    SET
      name = p_store_name,
      address = COALESCE(p_address, address),
      city = COALESCE(p_city, city),
      phone = COALESCE(p_phone, phone),
      category = p_category,
      updated_at = NOW()
    WHERE id = v_store_id;
  ELSE
    -- Create new headquarters store
    INSERT INTO public.stores (name, address, city, phone, category, organization_id, is_headquarters, is_active, slug)
    VALUES (
      p_store_name, p_address, p_city, p_phone, p_category,
      v_org_id, true, true,
      lower(regexp_replace(p_store_name, '[^a-zA-Z0-9]', '-', 'g'))
    )
    RETURNING id INTO v_store_id;
  END IF;

  -- Link store to profile
  UPDATE public.profiles SET current_store_id = v_store_id, updated_at = NOW()
  WHERE user_id = v_user_id AND organization_id = v_org_id;

  RETURN v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_onboarding_store(TEXT, TEXT, TEXT, TEXT, public.store_category) TO authenticated;

-- ================================================================
-- 6. CREER select_plan RPC (securise pour le onboarding)
--    Remplace le upsert direct depuis le frontend
-- ================================================================
CREATE OR REPLACE FUNCTION public.select_plan(
  p_plan_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_sub_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifie';
  END IF;

  IF p_plan_id IS NULL OR p_plan_id NOT IN ('starter', 'croissance', 'enterprise') THEN
    RAISE EXCEPTION 'Plan invalide : %', p_plan_id;
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = v_user_id AND is_active = true LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aucune organisation trouvee';
  END IF;

  -- Upsert subscription
  INSERT INTO public.subscriptions (organization_id, plan_id, status, billing_period, current_period_start, current_period_end)
  VALUES (
    v_org_id, p_plan_id, 'active', 'monthly',
    NOW(),
    CASE
      WHEN p_plan_id = 'starter' THEN NOW() + INTERVAL '30 days'
      WHEN p_plan_id = 'croissance' THEN NOW() + INTERVAL '30 days'
      WHEN p_plan_id = 'enterprise' THEN NOW() + INTERVAL '30 days'
      ELSE NOW() + INTERVAL '30 days'
    END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_start = NOW(),
    current_period_end = EXCLUDED.current_period_end,
    updated_at = NOW()
  RETURNING id INTO v_sub_id;

  -- Log event
  INSERT INTO public.subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
  VALUES (
    v_org_id,
    CASE WHEN p_plan_id = 'starter' THEN 'created' ELSE 'upgraded' END,
    'starter',
    p_plan_id,
    v_user_id,
    jsonb_build_object('source', 'onboarding', 'plan_id', p_plan_id)
  );

  RETURN v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.select_plan(TEXT) TO authenticated;

-- ================================================================
-- 7. S'ASSURER QUE get_user_organization_id EXISTE
--    (dependance de get_organization_stores)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;

-- ================================================================
-- 8. VERIFIER QUE LA COLONNE metadata EXISTE DANS organizations
--    (necessaire pour update_onboarding_progress)
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Toutes les corrections ont ete appliquees !
