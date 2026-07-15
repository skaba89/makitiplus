-- ════════════════════════════════════════════════════════════════
-- Migration: fix_super_admin_create_organization_owner_notnull
-- Date: 2026-07-15
-- Objectif: Corriger l'erreur "null value in column owner_user_id 
--           violates not-null constraint" lors de la création d'org.
--           
--           La table organizations a une contrainte NOT NULL sur
--           owner_user_id. Le RPC précédent insérait NULL.
--           Solution: owner_user_id = v_user_id (le super_admin 
--           créateur). Le super_admin "possède" toutes les orgs du
--           SaaS — c'est cohérent avec is_super_admin() qui vérifie
--           organizations.owner_user_id = auth.uid().
--           
--           Le profil du super_admin n'est PAS modifié (son 
--           organization_id reste sur son org principale). L'admin
--           de la nouvelle org est créé séparément via Edge Function.
-- ════════════════════════════════════════════════════════════════

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
  v_org_id UUID;
  v_store_id UUID;
  v_store_cat public.store_category;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Utilisateur non authentifié'::TEXT;
    RETURN;
  END IF;

  -- Vérifier que l'utilisateur est super_admin via is_super_admin()
  IF NOT public.is_super_admin() THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Seul un super administrateur peut créer une organisation indépendante'::TEXT;
    RETURN;
  END IF;

  IF p_org_name IS NULL OR btrim(p_org_name) = '' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Le nom de l''organisation est obligatoire'::TEXT;
    RETURN;
  END IF;
  IF p_store_name IS NULL OR btrim(p_store_name) = '' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Le nom du magasin est obligatoire'::TEXT;
    RETURN;
  END IF;

  BEGIN
    v_store_cat := p_store_category::public.store_category;
  EXCEPTION WHEN OTHERS THEN
    v_store_cat := 'autre'::public.store_category;
  END;

  -- 1. Créer la nouvelle organisation
  --    owner_user_id = v_user_id (super_admin créateur) pour satisfaire NOT NULL
  --    Le super_admin "possède" toutes les orgs du SaaS (cohérent avec is_super_admin)
  --    IMPORTANT: on NE modifie PAS profiles.organization_id du super_admin
  BEGIN
    ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_store_settings;
    INSERT INTO public.organizations (name, owner_user_id)
    VALUES (p_org_name, v_user_id)
    RETURNING id INTO v_org_id;
    ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, ('Erreur création organisation: ' || SQLERRM)::TEXT;
    RETURN;
  END;

  -- 2. Créer le premier magasin (siège)
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
    DELETE FROM public.organizations WHERE id = v_org_id;
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, ('Erreur création magasin: ' || SQLERRM)::TEXT;
    RETURN;
  END;

  -- 3. Abonnement starter
  BEGIN
    INSERT INTO public.subscriptions (organization_id, plan_id, status)
    VALUES (v_org_id, 'starter', 'active')
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 4. Store settings
  BEGIN
    INSERT INTO public.store_settings (organization_id, store_name)
    VALUES (v_org_id, p_store_name)
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 5. Catégories par défaut
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
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY SELECT v_org_id, v_store_id, true, NULL::TEXT;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.super_admin_create_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.super_admin_create_organization IS
'Crée une nouvelle organisation indépendante avec son premier magasin. Réservé au super_admin. owner_user_id = super_admin créateur (satisfait NOT NULL). Le profil du super_admin n est PAS modifié. L admin de la nouvelle org est créé via admin-create-user avec targetOrganizationId = org_id retourné.';
