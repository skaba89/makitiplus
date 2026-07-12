-- ============================================================
-- SCRIPT DE RÉCUPÉRATION — Recréer org + store pour le super admin
-- Date: 2026-07-13
-- ============================================================
-- OBJECTIF :
--   Après le nettoyage, le super admin kaba.sekouna@gmail.com n'a
--   plus d'organisation. Ce script recrée :
--   1. Une nouvelle organisation
--   2. Un magasin headquarters
--   3. Un abonnement starter actif
--   4. Les catégories par défaut
--   5. Lie le super admin à la nouvelle org + store
--
-- À exécuter dans Supabase SQL Editor après le script de nettoyage.
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
  -- ─── 1. Identifier le super admin ────────────────────────────
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_super_admin_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Super admin % non trouvé', v_super_admin_email;
  END IF;

  -- Récupérer le nom depuis profiles
  SELECT owner_name, business_name INTO v_owner_name, v_business_name
  FROM public.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  v_owner_name := COALESCE(v_owner_name, 'Ousmane Kaba');
  v_business_name := COALESCE(v_business_name, 'MakitiPlus Boutique');

  RAISE NOTICE '✅ Super admin : % (%)', v_super_admin_email, v_user_id;
  RAISE NOTICE '   Nom : %', v_owner_name;
  RAISE NOTICE '   Business : %', v_business_name;

  -- ─── 2. Vérifier si une org existe déjà pour ce user ─────────
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = v_user_id
    AND organization_id IS NOT NULL
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    -- Vérifier que l'org existe encore
    PERFORM 1 FROM public.organizations WHERE id = v_org_id;
    IF FOUND THEN
      RAISE NOTICE '✅ Organisation existante trouvée : %', v_org_id;
      -- Récupérer le store
      SELECT id INTO v_store_id
      FROM public.stores
      WHERE organization_id = v_org_id
        AND is_headquarters = true
      LIMIT 1;

      IF v_store_id IS NULL THEN
        SELECT id INTO v_store_id
        FROM public.stores
        WHERE organization_id = v_org_id
        LIMIT 1;
      END IF;
    ELSE
      v_org_id := NULL; -- L'org n'existe plus, on va la recréer
    END IF;
  END IF;

  -- ─── 3. Créer l'organisation si elle n'existe pas ────────────
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, owner_user_id)
    VALUES (v_business_name, v_user_id)
    RETURNING id INTO v_org_id;

    RAISE NOTICE '✅ Nouvelle organisation créée : % (%)', v_business_name, v_org_id;
  END IF;

  -- ─── 4. Mettre à jour le profil du super admin ───────────────
  UPDATE public.profiles
  SET
    organization_id = v_org_id,
    current_store_id = COALESCE(current_store_id, NULL),
    updated_at = NOW()
  WHERE user_id = v_user_id;

  RAISE NOTICE '✅ Profil mis à jour : organization_id = %', v_org_id;

  -- ─── 5. Créer un magasin headquarters si aucun ───────────────
  IF v_store_id IS NULL THEN
    INSERT INTO public.stores (
      organization_id, name, slug, category, country, currency,
      is_headquarters, is_active
    ) VALUES (
      v_org_id,
      v_business_name,
      'magasin-principal',
      'Alimentation',
      'GN',
      'GNF',
      true,
      true
    )
    RETURNING id INTO v_store_id;

    RAISE NOTICE '✅ Magasin principal créé : %', v_store_id;
  ELSE
    RAISE NOTICE '✅ Magasin existant : %', v_store_id;
  END IF;

  -- ─── 6. Mettre à jour current_store_id dans le profil ────────
  UPDATE public.profiles
  SET current_store_id = v_store_id
  WHERE user_id = v_user_id
    AND current_store_id IS NULL;

  RAISE NOTICE '✅ current_store_id mis à jour : %', v_store_id;

  -- ─── 7. Créer l'abonnement starter si aucun ──────────────────
  INSERT INTO public.subscriptions (organization_id, plan_id, status)
  VALUES (v_org_id, 'starter', 'active')
  ON CONFLICT (organization_id) DO NOTHING;

  RAISE NOTICE '✅ Abonnement starter actif créé pour l''org %', v_org_id;

  -- ─── 8. Créer les store_settings si aucun ────────────────────
  INSERT INTO public.store_settings (store_id, organization_id)
  VALUES (v_store_id, v_org_id)
  ON CONFLICT (store_id) DO NOTHING;

  RAISE NOTICE '✅ Store settings créés pour le store %', v_store_id;

  -- ─── 9. Insérer les catégories par défaut si aucune ──────────
  INSERT INTO public.categories (organization_id, name, icon, color, description, sort_order, is_default)
  SELECT
    v_org_id,
    cat.name, cat.icon, cat.color, cat.description, cat.sort_order, cat.is_default
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
    SELECT 1 FROM public.categories
    WHERE organization_id = v_org_id
      AND name = cat.name
  );

  RAISE NOTICE '✅ Catégories par défaut créées pour l''org %', v_org_id;

  -- ─── 10. Vérification finale ────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ RÉCUPÉRATION TERMINÉE';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Super admin : %', v_super_admin_email;
  RAISE NOTICE 'Organisation : % (%)', v_business_name, v_org_id;
  RAISE NOTICE 'Magasin : % (%)', v_business_name, v_store_id;
  RAISE NOTICE 'Abonnement : starter (actif)';
  RAISE NOTICE 'Catégories : 10 catégories par défaut';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '👉 Le super admin peut maintenant se reconnecter.';
  RAISE NOTICE '   L''organisation et les catégories sont prêtes.';
  RAISE NOTICE '   Il ne reste plus qu''à créer des produits.';
END $$;

-- ─── Vérifications post-récupération ──────────────────────────

-- Organisation du super admin
SELECT o.id, o.name, o.owner_id
FROM public.organizations o
JOIN public.profiles p ON p.organization_id = o.id
WHERE p.user_id = (SELECT id FROM auth.users WHERE email = 'kaba.sekouna@gmail.com');

-- Magasins du super admin
SELECT s.id, s.name, s.is_headquarters, s.is_active
FROM public.stores s
JOIN public.profiles p ON p.organization_id = s.organization_id
WHERE p.user_id = (SELECT id FROM auth.users WHERE email = 'kaba.sekouna@gmail.com');

-- Catégories du super admin
SELECT c.id, c.name, c.icon, c.color
FROM public.categories c
JOIN public.profiles p ON p.organization_id = c.organization_id
WHERE p.user_id = (SELECT id FROM auth.users WHERE email = 'kaba.sekouna@gmail.com')
ORDER BY c.sort_order;

-- Abonnement du super admin
SELECT s.plan_id, s.status, s.created_at
FROM public.subscriptions s
JOIN public.profiles p ON p.organization_id = s.organization_id
WHERE p.user_id = (SELECT id FROM auth.users WHERE email = 'kaba.sekouna@gmail.com');
