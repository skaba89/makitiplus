-- ════════════════════════════════════════════════════════════════
-- MIGRATION CONSOLIDÉE — Tous les fixes du 2026-07-15
-- ════════════════════════════════════════════════════════════════
-- Ce script combine les 9 migrations du 2026-07-15 en UN SEUL script
-- à exécuter dans Supabase SQL Editor.
--
-- Il est IDEMPOTENT : peut être exécuté plusieurs fois sans erreur.
-- (CREATE OR REPLACE, ON CONFLICT DO NOTHING, DROP IF EXISTS)
--
-- Ordre des opérations :
--   1. is_super_admin() robuste
--   2. Promouvoir owners → super_admin
--   3. RPC super_admin_create_organization
--   4. Nettoyer doublons stores
--   5. DROP policies (AVANT has_role car elles en dépendent)
--   6. DROP + CREATE has_role()
--   7. CREATE policies (stores, user_roles, profiles, audit_log)
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- 1. is_super_admin() ROBUSTE
--    Vérifie user_roles ET organizations.owner_user_id
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.organizations
    WHERE owner_user_id = auth.uid()
  );
$$;

-- ════════════════════════════════════════════════════════════════
-- 2. PROMOUVOIR LES OWNERS D'ORG EN super_admin DANS user_roles
--    + Créer les user_roles manquants pour tous les profils
-- ════════════════════════════════════════════════════════════════
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT o.owner_user_id, 'super_admin'::public.app_role
FROM public.organizations o
INNER JOIN public.user_roles ur ON ur.user_id = o.owner_user_id AND ur.role = 'admin'
WHERE o.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = o.owner_user_id AND ur2.role = 'super_admin'
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT 
  p.user_id,
  (CASE 
    WHEN EXISTS (SELECT 1 FROM public.organizations o WHERE o.owner_user_id = p.user_id)
    THEN 'admin'
    ELSE 'vendeur'
  END)::public.app_role
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id
)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- 3. RPC super_admin_create_organization (VERSION FINALE)
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

  BEGIN
    INSERT INTO public.subscriptions (organization_id, plan_id, status)
    VALUES (v_org_id, 'starter', 'active')
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    INSERT INTO public.store_settings (organization_id, store_name)
    VALUES (v_org_id, p_store_name)
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

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

-- ════════════════════════════════════════════════════════════════
-- 4. NETTOYER LES DOUBLONS DE STORES EXISTANTS
-- ════════════════════════════════════════════════════════════════
DELETE FROM public.stores s
USING public.organizations o
WHERE s.organization_id = o.id
  AND s.name = o.name
  AND EXISTS (
    SELECT 1 FROM public.stores s2
    WHERE s2.organization_id = s.organization_id
      AND s2.id != s.id
  );

-- ════════════════════════════════════════════════════════════════
-- 5. DROP ALL POLICIES that depend on has_role()
--    (AVANT de dropper has_role, sinon erreur 2BP01)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "stores_select_org_member" ON public.stores;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_scoped" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_scoped" ON public.profiles;
DROP POLICY IF EXISTS "admins_view_audit_log" ON public.user_audit_log;

-- ════════════════════════════════════════════════════════════════
-- 6. DROP + CREATE has_role() (avec nouveaux noms de paramètres)
--    ⚠️ DROP nécessaire car on change le nom du paramètre
--    ⚠️ Le paramètre _role doit être casté en app_role (enum)
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.has_role(uuid, text);

CREATE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = _role::public.app_role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 7. (RE)CREATE POLICIES RLS — stores (super_admin voit tout)
-- ════════════════════════════════════════════════════════════════
CREATE POLICY "stores_select_org_member"
  ON public.stores FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- ════════════════════════════════════════════════════════════════
-- 8. (RE)CREATE POLICIES RLS — user_roles (priorité user_id=auth.uid())
-- ════════════════════════════════════════════════════════════════
CREATE POLICY "user_roles_select_scoped"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR (
      public.has_role(auth.uid(), 'admin')
      AND role != 'super_admin'::public.app_role
    )
  );

-- ════════════════════════════════════════════════════════════════
-- 9. (RE)CREATE POLICIES RLS — profiles (priorité user_id=auth.uid())
-- ════════════════════════════════════════════════════════════════
CREATE POLICY "profiles_select_scoped"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR (
      public.has_role(auth.uid(), 'admin')
      AND organization_id = public.get_user_organization_id()
      AND user_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
    OR (
      organization_id = public.get_user_organization_id()
      AND user_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
  );

-- ════════════════════════════════════════════════════════════════
-- 10. (RE)CREATE POLICIES RLS — user_audit_log (filtré pour admins)
-- ════════════════════════════════════════════════════════════════
CREATE POLICY "admins_view_audit_log"
  ON public.user_audit_log FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_role(auth.uid(), 'admin')
      AND (
        actor_id IN (
          SELECT p.user_id FROM public.profiles p
          WHERE p.organization_id = public.get_user_organization_id()
        )
        OR target_user_id IN (
          SELECT p.user_id FROM public.profiles p
          WHERE p.organization_id = public.get_user_organization_id()
        )
      )
      AND actor_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- VÉRIFICATION FINALE (hors transaction pour voir les NOTICE)
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_total_profiles INTEGER;
  v_users_with_role INTEGER;
  v_super_admins INTEGER;
  v_orgs INTEGER;
  v_stores INTEGER;
  v_duplicate_stores INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_profiles FROM public.profiles;
  SELECT COUNT(DISTINCT user_id) INTO v_users_with_role FROM public.user_roles;
  SELECT COUNT(*) INTO v_super_admins FROM public.user_roles WHERE role = 'super_admin';
  SELECT COUNT(*) INTO v_orgs FROM public.organizations;
  SELECT COUNT(*) INTO v_stores FROM public.stores;
  
  SELECT COUNT(*) INTO v_duplicate_stores
  FROM public.stores s
  JOIN public.organizations o ON s.organization_id = o.id
  WHERE s.name = o.name
    AND EXISTS (SELECT 1 FROM public.stores s2 WHERE s2.organization_id = s.organization_id AND s2.id != s.id);
  
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'VÉRIFICATION FINALE';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Total profils: %', v_total_profiles;
  RAISE NOTICE 'Users AVEC rôle: %', v_users_with_role;
  RAISE NOTICE 'Super admins: %', v_super_admins;
  RAISE NOTICE 'Organisations: %', v_orgs;
  RAISE NOTICE 'Stores: %', v_stores;
  RAISE NOTICE 'Stores doublons restants (devrait être 0): %', v_duplicate_stores;
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
