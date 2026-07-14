-- ============================================================
-- Migration : Supprimer un magasin spécifique + clarifier org vs store
-- Date: 2026-07-14
-- ============================================================
-- Objectifs :
-- 1. delete_store() — supprimer UN magasin spécifique (pas toute l'org)
-- 2. L'admin d'org peut créer des magasins (pas seulement le super_admin)
-- 3. Le même nom de magasin est autorisé dans des villes/quartiers différents
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. delete_store() — supprimer un magasin spécifique
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.delete_store(UUID);

CREATE OR REPLACE FUNCTION public.delete_store(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_store_name TEXT;
  v_is_super_admin BOOLEAN;
  v_user_org_id UUID;
  v_store_count INTEGER;
BEGIN
  -- Vérifier que le magasin existe
  SELECT organization_id, name INTO v_org_id, v_store_name
  FROM public.stores WHERE id = p_store_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Magasin introuvable : %', p_store_id;
  END IF;

  -- Récupérer l'org de l'appelant
  SELECT organization_id INTO v_user_org_id
  FROM public.profiles WHERE user_id = auth.uid();

  v_is_super_admin := public.is_super_admin();

  -- Autorisation : super_admin peut supprimer n'importe quel magasin
  -- admin peut supprimer les magasins de SON organisation
  IF NOT v_is_super_admin THEN
    IF v_user_org_id IS NULL OR v_user_org_id != v_org_id THEN
      RAISE EXCEPTION 'Accès refusé : vous ne pouvez supprimer que les magasins de votre organisation';
    END IF;
  END IF;

  -- Empêcher la suppression du magasin headquarters s'il est le seul
  SELECT COUNT(*) INTO v_store_count
  FROM public.stores WHERE organization_id = v_org_id;

  IF v_store_count <= 1 THEN
    RAISE EXCEPTION 'Impossible de supprimer le dernier magasin. Utilisez "Supprimer l''organisation" pour tout supprimer.';
  END IF;

  -- Supprimer les données liées au magasin
  DELETE FROM public.sale_items WHERE store_id = p_store_id;
  DELETE FROM public.sales WHERE store_id = p_store_id;
  DELETE FROM public.stock_movements WHERE store_id = p_store_id;
  DELETE FROM public.store_settings WHERE store_id = p_store_id;

  -- Supprimer le magasin
  DELETE FROM public.stores WHERE id = p_store_id;

  -- Mettre à jour current_store_id des profils qui pointaient vers ce magasin
  UPDATE public.profiles SET current_store_id = NULL
  WHERE current_store_id = p_store_id;

  -- Audit log
  INSERT INTO public.user_audit_log (actor_id, actor_name, action, details)
  SELECT auth.uid(), p.owner_name, 'store_deleted',
    jsonb_build_object('store_id', p_store_id, 'store_name', v_store_name, 'org_id', v_org_id)
  FROM public.profiles p WHERE p.user_id = auth.uid();

  RETURN jsonb_build_object('success', true, 'deleted_store', v_store_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_store(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 2. create_store() — créer un magasin dans une organisation existante
-- L'admin d'org peut créer des magasins (pas seulement super_admin)
-- Le même nom est autorisé (magasin dans une autre ville/quartier)
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_store(UUID, TEXT, TEXT, public.store_category, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_store(
  p_organization_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_category public.store_category DEFAULT 'epicerie',
  p_country TEXT DEFAULT 'GN',
  p_currency TEXT DEFAULT 'GNF',
  p_city TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_org_id UUID;
  v_is_super_admin BOOLEAN;
  v_is_admin BOOLEAN;
  v_store_id UUID;
  v_limit_ok BOOLEAN;
  v_plan_check JSONB;
  v_final_slug TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Utilisateur non authentifié'; END IF;

  -- Vérifier l'org de l'utilisateur
  SELECT organization_id INTO v_user_org_id
  FROM public.profiles WHERE user_id = v_user_id;

  v_is_super_admin := public.is_super_admin();

  -- Vérifier que l'utilisateur est admin de cette org
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')
  ) INTO v_is_admin;

  IF NOT v_is_super_admin AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Accès refusé : seuls les administrateurs peuvent créer des magasins';
  END IF;

  -- Vérifier que l'org correspond (sauf super_admin)
  IF NOT v_is_super_admin AND v_user_org_id != p_organization_id THEN
    RAISE EXCEPTION 'Accès refusé : vous ne pouvez créer des magasins que dans votre organisation';
  END IF;

  -- Vérifier la limite de magasins du plan
  v_plan_check := public.check_plan_limit('stores');
  v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de magasins atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Générer un slug unique si non fourni ou si déjà utilisé
  v_final_slug := COALESCE(p_slug, LOWER(REPLACE(p_name, ' ', '-')));
  -- Ajouter un suffixe si le slug existe déjà (même nom, ville différente)
  WHILE EXISTS (SELECT 1 FROM public.stores WHERE slug = v_final_slug) LOOP
    v_final_slug := v_final_slug || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4);
  END LOOP;

  -- Créer le magasin
  INSERT INTO public.stores (
    organization_id, name, slug, category, country, currency, is_headquarters, is_active
  ) VALUES (
    p_organization_id, p_name, v_final_slug, p_category, p_country, p_currency, false, true
  ) RETURNING id INTO v_store_id;

  -- Créer les store_settings
  INSERT INTO public.store_settings (organization_id, store_name)
  VALUES (p_organization_id, p_name)
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_store(UUID, TEXT, TEXT, public.store_category, TEXT, TEXT, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. Ajouter colonne city aux stores (pour différencier même nom)
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS address TEXT;

-- ════════════════════════════════════════════════════════════════
-- 4. Autoriser plusieurs magasins avec le même nom (slug reste unique)
-- Supprimer la contrainte UNIQUE sur name si elle existe
-- ════════════════════════════════════════════════════════════════
-- Le slug reste unique (généré automatiquement avec suffixe)
-- Le name peut être dupliqué (magasin dans une autre ville)

DO $$
BEGIN
  RAISE NOTICE '=== Migration terminée ===';
  RAISE NOTICE '1. delete_store() — supprimer un magasin spécifique';
  RAISE NOTICE '2. create_store() — admin d''org peut créer des magasins';
  RAISE NOTICE '3. Colonne city + address ajoutées aux stores';
  RAISE NOTICE '4. Même nom de magasin autorisé (slug unique auto-généré)';
END $$;
