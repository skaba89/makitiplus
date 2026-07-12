-- ============================================================
-- SCRIPT DE RÉCUPÉRATION v3 — Recréer org + store + catégories
-- Date: 2026-07-13 (corrigé : désactiver trigger pendant INSERT)
-- ============================================================
-- Bug : le trigger auto_create_store_settings appelle
-- insert_default_categories qui vérifie auth.uid() = p_user_id.
-- En SQL Editor, auth.uid() est NULL → échec.
--
-- Fix : désactiver le trigger pendant l'INSERT organization,
-- puis insérer les catégories manuellement.
-- ============================================================

DO $$
DECLARE
  v_super_admin_email TEXT := 'kaba.sekouna@gmail.com';
  v_user_id UUID;
  v_org_id UUID;
  v_store_id UUID;
  v_owner_name TEXT;
  v_business_name TEXT;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_super_admin_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Super admin % non trouvé', v_super_admin_email;
  END IF;

  SELECT owner_name, business_name INTO v_owner_name, v_business_name
  FROM public.profiles WHERE user_id = v_user_id LIMIT 1;

  v_owner_name := COALESCE(v_owner_name, 'Ousmane Kaba');
  v_business_name := COALESCE(v_business_name, 'MakitiPlus Boutique');

  RAISE NOTICE 'Super admin : %', v_super_admin_email;

  -- Vérifier si une org existe déjà
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = v_user_id AND organization_id IS NOT NULL LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    PERFORM 1 FROM public.organizations WHERE id = v_org_id;
    IF NOT FOUND THEN v_org_id := NULL; END IF;
  END IF;

  -- Créer l'organisation avec trigger désactivé
  IF v_org_id IS NULL THEN
    -- Désactiver le trigger qui appelle insert_default_categories
    ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_store_settings;

    INSERT INTO public.organizations (name, owner_user_id)
    VALUES (v_business_name, v_user_id)
    RETURNING id INTO v_org_id;

    -- Réactiver le trigger
    ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings;

    RAISE NOTICE 'Nouvelle organisation créée : %', v_org_id;
  ELSE
    RAISE NOTICE 'Organisation existante : %', v_org_id;
  END IF;

  -- Mettre à jour le profil
  UPDATE public.profiles
  SET organization_id = v_org_id, updated_at = NOW()
  WHERE user_id = v_user_id;

  -- Récupérer ou créer le store headquarters
  SELECT id INTO v_store_id
  FROM public.stores
  WHERE organization_id = v_org_id AND is_headquarters = true LIMIT 1;

  IF v_store_id IS NULL THEN
    SELECT id INTO v_store_id FROM public.stores WHERE organization_id = v_org_id LIMIT 1;
  END IF;

  IF v_store_id IS NULL THEN
    INSERT INTO public.stores (organization_id, name, slug, category, country, currency, is_headquarters, is_active)
    VALUES (v_org_id, v_business_name, 'magasin-principal', 'Alimentation', 'GN', 'GNF', true, true)
    RETURNING id INTO v_store_id;
    RAISE NOTICE 'Magasin créé : %', v_store_id;
  ELSE
    RAISE NOTICE 'Magasin existant : %', v_store_id;
  END IF;

  -- current_store_id
  UPDATE public.profiles SET current_store_id = v_store_id
  WHERE user_id = v_user_id AND current_store_id IS NULL;

  -- Abonnement starter
  INSERT INTO public.subscriptions (organization_id, plan_id, status)
  VALUES (v_org_id, 'starter', 'active')
  ON CONFLICT (organization_id) DO NOTHING;

  -- Store settings (lié à organization, pas à store)
  INSERT INTO public.store_settings (organization_id, store_name)
  VALUES (v_org_id, v_business_name)
  ON CONFLICT (organization_id) DO NOTHING;

  -- Catégories par défaut (insertion directe, sans passer par la RPC)
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

  RAISE NOTICE '✅ RÉCUPÉRATION TERMINÉE';
  RAISE NOTICE 'Org : % | Store : % | Abonnement : starter | Catégories : 10', v_org_id, v_store_id;
END $$;

-- Vérifications
SELECT o.id, o.name FROM public.organizations o
JOIN public.profiles p ON p.organization_id = o.id
WHERE p.user_id = (SELECT id FROM auth.users WHERE email = 'kaba.sekouna@gmail.com');

SELECT s.id, s.name, s.is_headquarters FROM public.stores s
JOIN public.profiles p ON p.organization_id = s.organization_id
WHERE p.user_id = (SELECT id FROM auth.users WHERE email = 'kaba.sekouna@gmail.com');

SELECT c.name, c.icon FROM public.categories c
JOIN public.profiles p ON p.organization_id = c.organization_id
WHERE p.user_id = (SELECT id FROM auth.users WHERE email = 'kaba.sekouna@gmail.com')
ORDER BY c.sort_order;
