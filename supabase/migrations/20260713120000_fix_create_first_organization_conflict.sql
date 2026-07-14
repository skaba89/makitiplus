-- ============================================================
-- Fix : conflit de signature create_first_organization
-- Date: 2026-07-13
-- ============================================================
-- Bug : "Could not choose the best candidate function between:
--   create_first_organization(p_store_category => public.store_category, ...)
--   create_first_organization(p_store_category => text, ...)"
--
-- Cause : deux versions de la fonction existent avec le même nom
-- et mêmes params mais types différents pour p_store_category.
-- PostgreSQL ne peut pas choisir quand on passe une string.
--
-- Fix : DROP les deux versions et recréer une seule avec TEXT
-- (plus permissive — accepte les strings du frontend sans cast).
-- ============================================================

-- Supprimer les deux versions en conflit
DROP FUNCTION IF EXISTS public.create_first_organization(
  TEXT, TEXT, TEXT, public.store_category, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.create_first_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

-- Recréer une seule version avec TEXT pour p_store_category
CREATE OR REPLACE FUNCTION public.create_first_organization(
  p_org_name TEXT,
  p_store_name TEXT,
  p_store_slug TEXT,
  p_store_category TEXT,
  p_country TEXT,
  p_currency TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_store_id UUID;
  v_existing_org_id UUID;
  v_limit_ok BOOLEAN;
  v_plan_check JSONB;
  v_store_cat public.store_category;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  -- Vérifier si l'utilisateur a déjà une organisation
  SELECT organization_id INTO v_existing_org_id
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_existing_org_id IS NOT NULL THEN
    -- Path ajout magasin (utilisateur a déjà une org)
    v_plan_check := public.check_plan_limit('stores');
    v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);
    IF NOT v_limit_ok THEN
      RAISE EXCEPTION 'Limite de boutiques atteinte pour votre plan. Upgradéz votre abonnement.';
    END IF;

    -- Caster p_store_category vers l'enum
    v_store_cat := p_store_category::public.store_category;

    INSERT INTO public.stores (
      organization_id, name, slug, category, country, currency, is_headquarters
    ) VALUES (
      v_existing_org_id, p_store_name, p_store_slug, v_store_cat, p_country, p_currency, false
    ) RETURNING id INTO v_store_id;

    RETURN v_store_id;
  END IF;

  -- Path nouvelle org + premier store (headquarters)
  -- Désactiver le trigger pour éviter l'appel à insert_default_categories
  -- (qui vérifie auth.uid() et échouerait)
  ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_store_settings;

  INSERT INTO public.organizations (name, owner_user_id)
  VALUES (p_org_name, v_user_id)
  RETURNING id INTO v_org_id;

  ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;

  UPDATE public.profiles SET organization_id = v_org_id WHERE user_id = v_user_id;

  v_store_cat := p_store_category::public.store_category;

  INSERT INTO public.stores (
    organization_id, name, slug, category, country, currency, is_headquarters
  ) VALUES (
    v_org_id, p_store_name, p_store_slug, v_store_cat, p_country, p_currency, true
  ) RETURNING id INTO v_store_id;

  -- Abonnement starter
  INSERT INTO public.subscriptions (organization_id, plan_id, status)
  VALUES (v_org_id, 'starter', 'active')
  ON CONFLICT (organization_id) DO NOTHING;

  -- Store settings
  INSERT INTO public.store_settings (organization_id, store_name)
  VALUES (v_org_id, p_store_name)
  ON CONFLICT (organization_id) DO NOTHING;

  -- Catégories par défaut (insertion directe)
  INSERT INTO public.categories (organization_id, name, icon, color, description, sort_order, is_default, user_id)
  SELECT v_org_id, cat.name, cat.icon, cat.color, cat.description, cat.sort_order, cat.is_default, v_user_id
  FROM (VALUES
    ('Alimentation'::text, 'Package'::text, '#F59E0B'::text, 'Produits alimentaires'::text, 1::int, true::boolean),
    ('Boissons', 'Coffee', '#3B82F6', 'Boissons et jus', 2, true),
    ('Quincaillerie', 'Wrench', '#6B7280', 'Outils et quincaillerie', 3, true),
    ('Ménager', 'Home', '#10B981', 'Produits d''entretien ménager', 4, true),
    ('Textile', 'Shirt', '#8B5CF6', 'Vêtements et tissus', 5, true),
    ('Électroménager', 'Zap', '#EF4444', 'Appareils électroménagers', 6, true),
    ('Papeterie', 'FileText', '#06B6D4', 'Fournitures de bureau', 7, true),
    ('Hygiène', 'Heart', '#EC4899', 'Produits d''hygiène', 8, true),
    ('Cosmétique', 'Sparkles', '#F97316', 'Produits cosmétiques', 9, true),
    ('Divers', 'Package', '#6366F1', 'Autres produits', 10, true)
  ) AS cat(name, icon, color, description, sort_order, is_default)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories WHERE organization_id = v_org_id AND name = cat.name
  );

  RETURN v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_first_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ create_first_organization recréée avec signature unique (p_store_category TEXT)';
  RAISE NOTICE '   Plus de conflit de signature — le frontend peut créer des magasins';
END $$;
