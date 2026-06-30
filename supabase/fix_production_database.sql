-- ═══════════════════════════════════════════════════════════════════════════
-- MAKITIPLUS — Migration consolidée pour base de production
-- Exécuter dans : Supabase Dashboard → SQL Editor
--
-- Ce script regroupe TOUTES les migrations qui n'ont pas été appliquées
-- sur la base de production. Il est idempotent (peut être exécuté
-- plusieurs fois sans effet secondaire grâce aux IF NOT EXISTS / IF NOT NULL).
--
-- ERREURS CORRIGÉES :
--   400 sur /categories → colonnes description, is_default, sort_order manquantes
--   404 sur /store_settings → table inexistante
--   BrandingContext crash → colonnes branding manquantes dans organizations/profiles
--   super_admin bloqué → RLS policies sans is_super_admin()
--
-- Date : 30 Juin 2026
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- PART 1: SUPER_ADMIN ROLE (from 20260629010000_add_super_admin_role.sql)
-- ─────────────────────────────────────────────────────────────────────

-- 1a. Ajouter super_admin à l'enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin' AFTER 'admin';

-- 1b. Fonction is_super_admin()
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

-- 1c. Mettre à jour admin_exists() pour vérifier super_admin aussi
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE role IN ('admin', 'super_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- 1d. RLS organizations: super_admin peut voir/créer/modifier toutes les orgs
DROP POLICY IF EXISTS "members_can_view_org" ON public.organizations;
CREATE POLICY "members_can_view_org" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_member_of_organization(id)
  );

DROP POLICY IF EXISTS "admin_can_create_org" ON public.organizations;
CREATE POLICY "admin_can_create_org" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR owner_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "admin_can_update_org" ON public.organizations;
CREATE POLICY "admin_can_update_org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.is_super_admin()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- 1e. RLS profiles: super_admin peut voir tous les profils
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR organization_id = public.get_user_organization_id()
  );

-- 1f. RLS user_roles: super_admin peut voir/insérer tous les rôles
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Users can create their own role" ON public.user_roles;
CREATE POLICY "Users can create their own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR user_id = auth.uid()
  );

-- 1g. RLS user_audit_log: super_admin peut voir les logs
DROP POLICY IF EXISTS "admins_view_audit_log" ON public.user_audit_log;
CREATE POLICY "admins_view_audit_log" ON public.user_audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin')
  );

-- 1h. Drop old single-admin index
DROP INDEX IF EXISTS public.idx_single_admin;

-- 1i. Create missing RPC functions + Grant EXECUTE
-- Strategy: create functions if they don't exist, then grant using dynamic SQL
-- built from pg_proc to match the ACTUAL function signature (with or without params).

-- ── Create missing functions ONLY if they don't exist yet ──

DO $$
BEGIN
  -- batch_update_stock()
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'batch_update_stock') THEN
    CREATE FUNCTION public.batch_update_stock()
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $inner$ BEGIN RAISE NOTICE 'batch_update_stock() stub'; END; $inner$;
    RAISE NOTICE 'Created batch_update_stock()';
  END IF;

  -- check_account_status()
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'check_account_status') THEN
    CREATE FUNCTION public.check_account_status()
    RETURNS TABLE(is_active boolean, deactivation_reason text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
    AS $inner$
    BEGIN
      RETURN QUERY SELECT p.is_active, p.deactivation_reason FROM public.profiles p WHERE p.user_id = auth.uid();
    END;
    $inner$;
    RAISE NOTICE 'Created check_account_status()';
  END IF;

  -- touch_last_login()
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'touch_last_login') THEN
    CREATE FUNCTION public.touch_last_login()
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $inner$
    BEGIN
      UPDATE public.profiles SET last_login_at = now() WHERE user_id = auth.uid();
    END;
    $inner$;
    RAISE NOTICE 'Created touch_last_login()';
  END IF;

  -- generate_sale_number()
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'generate_sale_number') THEN
    CREATE FUNCTION public.generate_sale_number()
    RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $inner$
    DECLARE
      v_num text;
    BEGIN
      v_num := 'VNT-' || to_char(now(), 'YYYYMMDDHH24MISS');
      RETURN v_num;
    END;
    $inner$;
    RAISE NOTICE 'Created generate_sale_number()';
  END IF;

  -- is_user_active(uuid)
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'is_user_active') THEN
    CREATE FUNCTION public.is_user_active(p_user_id uuid)
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $inner$ SELECT COALESCE(is_active, true) FROM public.profiles WHERE user_id = p_user_id; $inner$;
    RAISE NOTICE 'Created is_user_active()';
  END IF;

  -- resolve_stock_conflict()
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'resolve_stock_conflict') THEN
    CREATE FUNCTION public.resolve_stock_conflict()
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $inner$ BEGIN RAISE NOTICE 'resolve_stock_conflict() stub'; END; $inner$;
    RAISE NOTICE 'Created resolve_stock_conflict()';
  END IF;
END;
$$;

-- ── Grant EXECUTE on all RPC functions ──
-- Uses dynamic SQL built from pg_proc to match the ACTUAL function signature.
-- Each grant is wrapped in EXCEPTION WHEN to never abort the script.

DO $$
DECLARE
  r RECORD;
  grant_sql text;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema,
      p.proname AS name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'check_account_status',
        'touch_last_login',
        'generate_sale_number',
        'batch_update_stock',
        'get_user_organization_id',
        'is_member_of_organization',
        'has_role',
        'is_user_active',
        'resolve_stock_conflict',
        'set_organization_id'
      )
  LOOP
    BEGIN
      grant_sql := format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
        r.schema, r.name, r.args);

      -- Special case: also revoke anon for check_account_status
      IF r.name = 'check_account_status' THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
          r.schema, r.name, r.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
          r.schema, r.name, r.args);
        RAISE NOTICE 'GRANT % (%) OK (with REVOKE anon)', r.name, r.args;
      ELSE
        EXECUTE grant_sql;
        RAISE NOTICE 'GRANT % (%) OK', r.name, r.args;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'GRANT % (%) SKIPPED: %', r.name, r.args, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PART 2: STORE_SETTINGS TABLE (from 20260629010000_store_settings...)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_name text,
  logo_url text,
  favicon_url text,
  primary_color text DEFAULT '16 80% 50%',
  secondary_color text DEFAULT '38 60% 92%',
  accent_color text DEFAULT '38 70% 88%',
  success_color text DEFAULT '152 60% 42%',
  template text DEFAULT 'default' CHECK (template IN ('default', 'modern', 'minimal', 'african', 'luxury')),
  sidebar_style text DEFAULT 'default' CHECK (sidebar_style IN ('default', 'compact', 'expanded')),
  card_style text DEFAULT 'elevated' CHECK (card_style IN ('elevated', 'flat', 'outlined')),
  receipt_footer text,
  receipt_show_logo boolean DEFAULT true,
  receipt_show_tax boolean DEFAULT true,
  extra_settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_settings_organization_id ON public.store_settings(organization_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_store_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_store_settings_updated_at ON public.store_settings;
CREATE TRIGGER trigger_store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_store_settings_updated_at();

-- Auto-fill organization_id on INSERT
CREATE OR REPLACE FUNCTION public.set_store_settings_org_id()
RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO v_org_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
    NEW.organization_id := v_org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_set_store_settings_org_id ON public.store_settings;
CREATE TRIGGER trigger_set_store_settings_org_id
  BEFORE INSERT ON public.store_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_store_settings_org_id();

-- RLS for store_settings
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_view_store_settings" ON public.store_settings;
CREATE POLICY "org_members_view_store_settings" ON public.store_settings
  FOR SELECT
  USING (is_member_of_organization(organization_id));

DROP POLICY IF EXISTS "org_admins_insert_store_settings" ON public.store_settings;
CREATE POLICY "org_admins_insert_store_settings" ON public.store_settings
  FOR INSERT
  WITH CHECK (
    is_member_of_organization(organization_id)
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin())
  );

DROP POLICY IF EXISTS "org_admins_update_store_settings" ON public.store_settings;
CREATE POLICY "org_admins_update_store_settings" ON public.store_settings
  FOR UPDATE
  USING (
    is_member_of_organization(organization_id)
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin())
  );

-- ─────────────────────────────────────────────────────────────────────
-- PART 3: CATEGORIES COLUMNS (description, is_default, sort_order)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Default categories function
CREATE OR REPLACE FUNCTION public.insert_default_categories(p_org_id uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.categories (name, icon, color, description, is_default, sort_order, organization_id, user_id)
  VALUES
    ('Alimentaire',     'Package', '#E57E4D', 'Riz, farine, huile, conserves, pâtes et produits alimentaires', true, 1, p_org_id, p_user_id),
    ('Boissons',        'CupSoda', '#3B82F6', 'Jus, sodas, eau minérale, boissons énergisantes', true, 2, p_org_id, p_user_id),
    ('Produits frais',  'Leaf',    '#10B981', 'Fruits, légumes, viandes, poissons et produits frais', true, 3, p_org_id, p_user_id),
    ('Épicerie',        'Package', '#F59E0B', 'Épices, condiments, sauces, produits secs', true, 4, p_org_id, p_user_id),
    ('Hygiène & Beauté','Sparkles','#EC4899', 'Savons, shampoings, cosmétiques, produits d''hygiène', true, 5, p_org_id, p_user_id),
    ('Entretien',       'Wrench',  '#8B5CF6', 'Produits de nettoyage, détergents, balais, accessoires', true, 6, p_org_id, p_user_id),
    ('Boissons chaudes','Wheat',   '#6366F1', 'Café, thé, chocolat chaud, cacao', true, 7, p_org_id, p_user_id),
    ('Snacks',          'Croissant','#F97316','Biscuits, bonbons, chips, pâtisseries', true, 8, p_org_id, p_user_id),
    ('Electronique',    'Smartphone','#14B8A6','Phones, chargeurs, écouteurs, accessoires électroniques', true, 9, p_org_id, p_user_id),
    ('Textile',         'Shirt',   '#EF4444', 'Vêtements, tissus, chaussures, mode', true, 10, p_org_id, p_user_id),
    ('Bébé & Enfant',   'Sparkles','#F472B6', 'Couches, lait infantile, jouets, produits bébé', true, 11, p_org_id, p_user_id),
    ('Santé',           'Sparkles','#22C55E', 'Médicaments courants, premiers soins, compléments', true, 12, p_org_id, p_user_id),
    ('Maison & Déco',   'Brush',   '#A855F7', 'Ustensiles, décoration, articles ménagers', true, 13, p_org_id, p_user_id),
    ('Bricolage',       'Wrench',  '#78716C', 'Outils, quincaillerie, peinture, matériaux', true, 14, p_org_id, p_user_id),
    ('Surgelés',        'Snowflake','#0EA5E9','Produits congelés, glaces, poissons surgelés', true, 15, p_org_id, p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.insert_default_categories TO authenticated;

-- Auto-create store_settings + default categories when a new org is created
CREATE OR REPLACE FUNCTION public.auto_create_store_settings()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.store_settings (organization_id, store_name)
  VALUES (NEW.id, NEW.name)
  ON CONFLICT (organization_id) DO NOTHING;

  PERFORM public.insert_default_categories(NEW.id, NEW.owner_user_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_create_store_settings ON public.organizations;
CREATE TRIGGER trigger_auto_create_store_settings
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_store_settings();

GRANT EXECUTE ON FUNCTION public.auto_create_store_settings TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- PART 4: STORE CATEGORY ENUM (from 20260629020000_add_store_category.sql)
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_category') THEN
    CREATE TYPE public.store_category AS ENUM (
      'epicerie',
      'boutique_vetements',
      'boutique_chaussures',
      'supermarche',
      'restaurant',
      'boulangerie_patisserie',
      'pharmacie',
      'cosmetiques_beaute',
      'electronique',
      'quincaillerie',
      'materiel_construction',
      'alimentation_generale',
      'station_service',
      'point_vente_telecom',
      'salon_coiffure',
      'autre'
    );
  END IF;
END $$;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS category public.store_category DEFAULT 'epicerie';

-- ─────────────────────────────────────────────────────────────────────
-- PART 5: BRANDING COLUMNS (from add_branding_columns.sql)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '16 80% 50%',
  ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '38 70% 88%',
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS app_name TEXT DEFAULT 'MakitiPlus',
  ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'light' CHECK (theme_mode IN ('light', 'dark', 'system')),
  ADD COLUMN IF NOT EXISTS receipt_template TEXT DEFAULT 'default' CHECK (receipt_template IN ('default', 'minimal', 'detailed', 'african')),
  ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Plus Jakarta Sans',
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'fr';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'system' CHECK (theme_mode IN ('light', 'dark', 'system')),
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'fr';

-- ─────────────────────────────────────────────────────────────────────
-- PART 6: STORAGE BUCKET FOR LOGOS
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos', 'logos', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop and recreate to avoid duplicates)
DROP POLICY IF EXISTS "Users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Logos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own logos" ON storage.objects;
DROP POLICY IF EXISTS "org_members_upload_logos" ON storage.objects;
DROP POLICY IF EXISTS "org_members_update_logos" ON storage.objects;
DROP POLICY IF EXISTS "anyone_view_logos" ON storage.objects;
DROP POLICY IF EXISTS "org_members_delete_logos" ON storage.objects;

-- Use org-based path: {organization_id}/logo.ext
CREATE POLICY "org_members_upload_logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');

CREATE POLICY "org_members_update_logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

CREATE POLICY "anyone_view_logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

CREATE POLICY "org_members_delete_logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────
-- PART 7: FIX RLS — Add is_super_admin() to ALL business table policies
-- ─────────────────────────────────────────────────────────────────────

-- CATEGORIES
DROP POLICY IF EXISTS "org_members_insert_categories" ON public.categories;
CREATE POLICY "org_members_insert_categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "org_admins_update_categories" ON public.categories;
CREATE POLICY "org_admins_update_categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "org_admins_delete_categories" ON public.categories;
CREATE POLICY "org_admins_delete_categories" ON public.categories
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  );

-- PRODUCTS
DROP POLICY IF EXISTS "org_members_insert_products" ON public.products;
CREATE POLICY "org_members_insert_products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "org_admins_update_products" ON public.products;
CREATE POLICY "org_admins_update_products" ON public.products
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "org_admins_delete_products" ON public.products;
CREATE POLICY "org_admins_delete_products" ON public.products
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  );

-- CUSTOMERS
DROP POLICY IF EXISTS "org_members_insert_customers" ON public.customers;
CREATE POLICY "org_members_insert_customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "org_admins_update_customers" ON public.customers;
CREATE POLICY "org_admins_update_customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "org_admins_delete_customers" ON public.customers;
CREATE POLICY "org_admins_delete_customers" ON public.customers
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  );

-- SALES
DROP POLICY IF EXISTS "org_members_insert_sales" ON public.sales;
CREATE POLICY "org_members_insert_sales" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "org_admins_update_sales" ON public.sales;
CREATE POLICY "org_admins_update_sales" ON public.sales
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  );

-- SALE_ITEMS
DROP POLICY IF EXISTS "org_members_insert_sale_items" ON public.sale_items;
CREATE POLICY "org_members_insert_sale_items" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

-- CUSTOMER_CREDITS
DROP POLICY IF EXISTS "org_admins_insert_credits" ON public.customer_credits;
CREATE POLICY "org_admins_insert_credits" ON public.customer_credits
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable') OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "org_admins_update_credits" ON public.customer_credits;
CREATE POLICY "org_admins_update_credits" ON public.customer_credits
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable') OR public.is_super_admin())
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable') OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "org_admins_delete_credits" ON public.customer_credits;
CREATE POLICY "org_admins_delete_credits" ON public.customer_credits
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  );

-- EXPENSES
DROP POLICY IF EXISTS "org_members_view_expenses" ON public.expenses;
CREATE POLICY "org_members_view_expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable') OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "org_accountants_insert_expenses" ON public.expenses;
CREATE POLICY "org_accountants_insert_expenses" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable') OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "org_accountants_update_expenses" ON public.expenses;
CREATE POLICY "org_accountants_update_expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable') OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "org_admins_delete_expenses" ON public.expenses;
CREATE POLICY "org_admins_delete_expenses" ON public.expenses
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.is_super_admin())
  );

-- STOCK_MOVEMENTS
DROP POLICY IF EXISTS "org_members_insert_stock" ON public.stock_movements;
CREATE POLICY "org_members_insert_stock" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

-- SYNC_CONFLICTS
DROP POLICY IF EXISTS "sync_conflicts_insert_own_org" ON public.sync_conflicts;
CREATE POLICY "sync_conflicts_insert_own_org" ON public.sync_conflicts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (organization_id = public.get_user_organization_id() OR public.is_super_admin())
  );

-- ─────────────────────────────────────────────────────────────────────
-- PART 8: BACKFILL — Create store_settings + default categories for EXISTING orgs
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN SELECT id, name, owner_user_id FROM public.organizations LOOP
    -- Create store settings if not exists
    INSERT INTO public.store_settings (organization_id, store_name)
    VALUES (org_record.id, org_record.name)
    ON CONFLICT (organization_id) DO NOTHING;

    -- Insert default categories if the org has no categories yet
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE organization_id = org_record.id) THEN
      PERFORM public.insert_default_categories(org_record.id, org_record.owner_user_id);
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- PART 9: FIX SIGNUP FLOW RLS (from fix_rls_policies.sql)
-- ─────────────────────────────────────────────────────────────────────

-- profiles INSERT: allow self-signup
DROP POLICY IF EXISTS "profiles_insert_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_insert_own_or_admin"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.is_super_admin()
);

-- user_roles INSERT: allow first admin self-signup
DROP POLICY IF EXISTS "Users can create their own role" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_self_or_admin" ON public.user_roles;
DROP POLICY IF EXISTS "Allow first admin or admin-created roles" ON public.user_roles;
CREATE POLICY "user_roles_insert_self_or_admin"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  (NOT public.admin_exists() AND auth.uid() = user_id AND role IN ('admin', 'super_admin'))
  OR (auth.uid() = user_id AND role IN ('vendeur', 'manager', 'comptable'))
  OR public.has_role(auth.uid(), 'admin')
  OR public.is_super_admin()
);

-- ─────────────────────────────────────────────────────────────────────
-- PART 10: Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- TERMINÉ ! Toutes les migrations sont appliquées.
--
-- Vérifiez avec :
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'categories';
-- ═══════════════════════════════════════════════════════════════════════════
