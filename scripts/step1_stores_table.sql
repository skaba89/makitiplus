-- ============================================================
-- Multi-Store — ÉTAPE 1: Créer la table stores + trigger
-- Exécuter en PREMIER dans Supabase SQL Editor
-- ============================================================

-- 1. Créer la table stores
CREATE TABLE IF NOT EXISTS public.stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  address     TEXT,
  city        TEXT,
  country     TEXT DEFAULT 'GN',
  currency    TEXT DEFAULT 'GNF',
  phone       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_headquarters BOOLEAN NOT NULL DEFAULT false,
  category    public.store_category DEFAULT 'autre',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_stores_organization_id ON public.stores (organization_id);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON public.stores (organization_id, slug);

-- 2. Auto-créer une boutique principale pour chaque organisation existante
INSERT INTO public.stores (organization_id, name, slug, is_headquarters, category, country, currency)
SELECT
  o.id,
  COALESCE(o.name, 'Boutique principale'),
  'principal',
  true,
  COALESCE(o.category, 'autre'),
  COALESCE(o.country, 'GN'),
  COALESCE(o.currency, 'GNF')
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.stores s WHERE s.organization_id = o.id
)
ON CONFLICT DO NOTHING;

-- 3. Trigger: auto-créer un store pour chaque nouvelle organisation
CREATE OR REPLACE FUNCTION public.handle_new_organization_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stores (organization_id, name, slug, is_headquarters, category, country, currency)
  VALUES (
    NEW.id,
    COALESCE(NEW.name, 'Boutique principale'),
    'principal',
    true,
    COALESCE(NEW.category, 'autre'),
    COALESCE(NEW.country, 'GN'),
    COALESCE(NEW.currency, 'GNF')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization_store();
