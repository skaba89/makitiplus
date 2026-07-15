-- ════════════════════════════════════════════════════════════════
-- Migration: super_admin_create_organization
-- Date: 2026-07-15
-- Objectif: Permettre au super_admin de créer une NOUVELLE organisation
--           indépendante (différente de la sienne) avec son premier magasin.
--           Le super_admin ne doit PAS devenir propriétaire de cette org,
--           et son propre organization_id ne doit PAS être modifié.
-- ════════════════════════════════════════════════════════════════

-- 1. Vérifier que le rôle super_admin existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role' AND typtype = 'e') THEN
    CREATE TYPE public.user_role AS ENUM (
      'super_admin', 'admin', 'manager', 'vendeur', 'comptable'
    );
  END IF;
END $$;

-- 2. Créer le nouveau RPC super_admin_create_organization
--    Ce RPC crée une organisation indépendante SANS toucher au profil du super_admin
CREATE OR REPLACE FUNCTION public.super_admin_create_organization(
  p_org_name TEXT,
  p_store_name TEXT,
  p_store_slug TEXT,
  p_store_category TEXT,
  p_country TEXT,
  p_currency TEXT,
  p_city TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL
)
RETURNS TABLE (
  org_id UUID,
  store_id UUID,
  success BOOLEAN,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_org_id UUID;
  v_store_id UUID;
  v_store_cat public.store_category;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Utilisateur non authentifié'::TEXT;
    RETURN;
  END IF;

  -- Vérifier que l'utilisateur est super_admin
  SELECT role INTO v_user_role FROM public.profiles WHERE user_id = v_user_id;
  IF v_user_role IS NULL OR v_user_role != 'super_admin' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Seul un super administrateur peut créer une organisation indépendante'::TEXT;
    RETURN;
  END IF;

  -- Valider les paramètres obligatoires
  IF p_org_name IS NULL OR btrim(p_org_name) = '' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Le nom de l''organisation est obligatoire'::TEXT;
    RETURN;
  END IF;
  IF p_store_name IS NULL OR btrim(p_store_name) = '' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Le nom du magasin est obligatoire'::TEXT;
    RETURN;
  END IF;

  -- Convertir la catégorie
  BEGIN
    v_store_cat := p_store_category::public.store_category;
  EXCEPTION WHEN OTHERS THEN
    v_store_cat := 'autre'::public.store_category;
  END;

  -- 1. Créer la nouvelle organisation (owner_user_id = NULL car elle n'appartient
  --    pas au super_admin, elle sera assignée à l'admin créé séparément)
  BEGIN
    ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_store_settings;
    INSERT INTO public.organizations (name, owner_user_id)
    VALUES (p_org_name, NULL)
    RETURNING id INTO v_org_id;
    ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, ('Erreur création organisation: ' || SQLERRM)::TEXT;
    RETURN;
  END;

  -- 2. Créer le premier magasin (siège) pour cette nouvelle organisation
  BEGIN
    INSERT INTO public.stores (
      organization_id, name, slug, category, country, currency,
      is_headquarters, is_active, city, address
    )
    VALUES (
      v_org_id, p_store_name, p_store_slug, v_store_cat, p_country, p_currency,
      true, true, p_city, p_address
    )
    RETURNING id INTO v_store_id;
  EXCEPTION WHEN OTHERS THEN
    -- Rollback: supprimer l'org créée
    DELETE FROM public.organizations WHERE id = v_org_id;
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, ('Erreur création magasin: ' || SQLERRM)::TEXT;
    RETURN;
  END;

  -- 3. Créer un abonnement starter pour cette organisation
  BEGIN
    INSERT INTO public.subscriptions (organization_id, plan_id, status)
    VALUES (v_org_id, 'starter', 'active')
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Non bloquant
    NULL;
  END;

  -- 4. Créer les store_settings
  BEGIN
    INSERT INTO public.store_settings (organization_id, store_name)
    VALUES (v_org_id, p_store_name)
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 5. Créer les catégories par défaut pour cette organisation
  BEGIN
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
      ('Divers', 'Package', '#6364F1', 'Autres produits', 10, true)
    ) AS cat(name, icon, color, description, sort_order, is_default)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.categories WHERE organization_id = v_org_id AND name = cat.name
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 6. Retourner le résultat
  RETURN QUERY SELECT v_org_id, v_store_id, true, NULL::TEXT;
  RETURN;
END;
$$;

-- 3. Accorder l'exécution aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION public.super_admin_create_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- 4. Commentaire de documentation
COMMENT ON FUNCTION public.super_admin_create_organization IS
'Crée une nouvelle organisation indépendante avec son premier magasin. Réservé au super_admin. Ne modifie PAS le organization_id du super_admin dans son profil. L''admin de la nouvelle org doit être créé séparément via admin-create-user avec targetOrganizationId = org_id retourné.';
