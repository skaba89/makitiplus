-- ════════════════════════════════════════════════════════════════
-- Migration: fix_super_admin_create_organization_duplicate_store
-- Date: 2026-07-15
-- Objectif: Corriger le bug "2 boutiques par organisation" — le trigger
--           on_organization_created crée AUTOMATIQUEMENT un store avec le
--           nom de l'org à chaque INSERT dans organizations, en plus du
--           store explicitement créé par le RPC.
--           
--           Solution: 
--           1. Désactiver AUSSI le trigger on_organization_created 
--              pendant l'INSERT organization dans le RPC
--           2. Supprimer le store automatique existant pour les orgs 
--              déjà créées (store.name = organization.name)
-- ════════════════════════════════════════════════════════════════

-- 1. Recréer le RPC en désactivant LES DEUX triggers
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

  -- 1. Créer la nouvelle organisation en désactivant LES DEUX triggers
  --    - trigger_auto_create_store_settings : crée store_settings + catégories
  --    - on_organization_created : crée AUTOMATIQUEMENT un store (le doublon !)
  BEGIN
    ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_store_settings;
    ALTER TABLE public.organizations DISABLE TRIGGER on_organization_created;
    INSERT INTO public.organizations (name, owner_user_id)
    VALUES (p_org_name, v_user_id)
    RETURNING id INTO v_org_id;
    ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;
    ALTER TABLE public.organizations ENABLE TRIGGER on_organization_created;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;
    ALTER TABLE public.organizations ENABLE TRIGGER on_organization_created;
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, ('Erreur création organisation: ' || SQLERRM)::TEXT;
    RETURN;
  END;

  -- 2. Créer le premier magasin (siège) — le SEUL magasin
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

-- 2. Nettoyer les doublons existants : supprimer le store automatique
--    (celui dont le name = organization.name, qui a été créé par le trigger)
--    Garder le store explicite créé par le RPC (name = p_store_name)
DELETE FROM public.stores s
USING public.organizations o
WHERE s.organization_id = o.id
  AND s.name = o.name
  -- Ne supprimer que s'il existe un AUTRE store pour la même org
  AND EXISTS (
    SELECT 1 FROM public.stores s2
    WHERE s2.organization_id = s.organization_id
      AND s2.id != s.id
  );

-- 3. Vérification
DO $$
DECLARE
  v_total_orgs INTEGER;
  v_total_stores INTEGER;
  v_avg_stores FLOAT;
BEGIN
  SELECT COUNT(*) INTO v_total_orgs FROM public.organizations;
  SELECT COUNT(*) INTO v_total_stores FROM public.stores;
  IF v_total_orgs > 0 THEN
    v_avg_stores := v_total_stores::FLOAT / v_total_orgs;
  END IF;
  
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Organisations: %', v_total_orgs;
  RAISE NOTICE 'Stores: %', v_total_stores;
  RAISE NOTICE 'Moyenne stores/org: %', v_avg_stores;
  RAISE NOTICE 'Les doublons ont été nettoyés.';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
