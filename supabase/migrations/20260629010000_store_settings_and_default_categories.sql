-- ═══════════════════════════════════════════════════════════════
-- Store Settings + Default Categories
-- Adds: store_settings table, generic categories, RLS policies
-- ═══════════════════════════════════════════════════════════════

-- 1. Create store_settings table
CREATE TABLE IF NOT EXISTS public.store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Branding
  store_name text,
  logo_url text,
  favicon_url text,
  
  -- Colors (HSL values stored as text like "16 80% 50%")
  primary_color text DEFAULT '16 80% 50%',
  secondary_color text DEFAULT '38 60% 92%',
  accent_color text DEFAULT '38 70% 88%',
  success_color text DEFAULT '152 60% 42%',
  
  -- Template
  template text DEFAULT 'default' CHECK (template IN ('default', 'modern', 'minimal', 'african', 'luxury')),
  
  -- Layout preferences
  sidebar_style text DEFAULT 'default' CHECK (sidebar_style IN ('default', 'compact', 'expanded')),
  card_style text DEFAULT 'elevated' CHECK (card_style IN ('elevated', 'flat', 'outlined')),
  
  -- Receipt customization
  receipt_footer text,
  receipt_show_logo boolean DEFAULT true,
  receipt_show_tax boolean DEFAULT true,
  
  -- Additional settings (JSONB for extensibility)
  extra_settings jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index on organization_id (unique - one settings row per org)
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

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies for store_settings
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Members can view their org's settings
CREATE POLICY "org_members_view_store_settings" ON public.store_settings
  FOR SELECT
  USING (is_member_of_organization(organization_id));

-- Admin and manager can insert settings for their org
CREATE POLICY "org_admins_insert_store_settings" ON public.store_settings
  FOR INSERT
  WITH CHECK (
    is_member_of_organization(organization_id)
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- Admin and manager can update settings for their org
CREATE POLICY "org_admins_update_store_settings" ON public.store_settings
  FOR UPDATE
  USING (
    is_member_of_organization(organization_id)
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );

-- ═══════════════════════════════════════════════════════════════
-- Add product_count column to categories for display optimization
-- ═══════════════════════════════════════════════════════════════

-- Add description column to categories for richer admin management
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════
-- Default generic categories (these will be inserted per-org 
-- when an admin first visits the categories page or via a helper function)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.insert_default_categories(p_org_id uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.categories (name, icon, color, description, is_default, sort_order, organization_id, user_id)
  VALUES
    ('Alimentaire',     '🍚', '#E57E4D', 'Riz, farine, huile, conserves, pâtes et produits alimentaires', true, 1, p_org_id, p_user_id),
    ('Boissons',        '🥤', '#3B82F6', 'Jus, sodas, eau minérale, boissons énergisantes', true, 2, p_org_id, p_user_id),
    ('Produits frais',  '🥬', '#10B981', 'Fruits, légumes, viandes, poissons et produits frais', true, 3, p_org_id, p_user_id),
    ('Épicerie',        '📦', '#F59E0B', 'Épices, condiments, sauces, produits secs', true, 4, p_org_id, p_user_id),
    ('Hygiène & Beauté','🧴', '#EC4899', 'Savons, shampoings, cosmétiques, produits d''hygiène', true, 5, p_org_id, p_user_id),
    ('Entretien',       '🧹', '#8B5CF6', 'Produits de nettoyage, détergents, balais, accessoires', true, 6, p_org_id, p_user_id),
    ('Boissons chaudes','☕', '#6366F1', 'Café, thé, chocolat chaud, cacao', true, 7, p_org_id, p_user_id),
    ('Snacks',          '🍞', '#F97316', 'Biscuits, bonbons, chips, pâtisseries', true, 8, p_org_id, p_user_id),
    ('Electronique',    '📱', '#14B8A6', 'Phones, chargeurs, écouteurs, accessoires électroniques', true, 9, p_org_id, p_user_id),
    ('Textile',         '👕', '#EF4444', 'Vêtements, tissus, chaussures, mode', true, 10, p_org_id, p_user_id),
    ('Bébé & Enfant',   '🍼', '#F472B6', 'Couches, lait infantile, jouets, produits bébé', true, 11, p_org_id, p_user_id),
    ('Santé',           '💊', '#22C55E', 'Médicaments courants, premiers soins, compléments', true, 12, p_org_id, p_user_id),
    ('Maison & Déco',   '🏠', '#A855F7', 'Ustensiles, décoration, articles ménagers', true, 13, p_org_id, p_user_id),
    ('Bricolage',       '🔧', '#78716C', 'Outils, quincaillerie, peinture, matériaux', true, 14, p_org_id, p_user_id),
    ('Surgelés',        '🧊', '#0EA5E9', 'Produits congelés, glaces, poissons surgelés', true, 15, p_org_id, p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- Auto-create store_settings when a new organization is created
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_create_store_settings()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.store_settings (organization_id, store_name)
  VALUES (NEW.id, NEW.name)
  ON CONFLICT DO NOTHING;
  
  -- Also insert default categories for this new org
  PERFORM public.insert_default_categories(NEW.id, NEW.owner_user_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_create_store_settings ON public.organizations;
CREATE TRIGGER trigger_auto_create_store_settings
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_store_settings();

-- ═══════════════════════════════════════════════════════════════
-- Storage bucket for logos
-- ═══════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos', 'logos', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Storage policy: org members can upload logos
CREATE POLICY "org_members_upload_logos" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "org_members_update_logos" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "anyone_view_logos" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "org_members_delete_logos" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
  );

-- ═══════════════════════════════════════════════════════════════
-- Backfill: Insert default categories + store_settings for EXISTING orgs
-- ═══════════════════════════════════════════════════════════════

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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.insert_default_categories TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_create_store_settings TO authenticated;
