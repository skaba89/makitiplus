-- ═══════════════════════════════════════════════════════════════════════
-- MAKITIPLUS — Ajout de la table suppliers + relation avec products
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- Date : Juillet 2026
-- ═══════════════════════════════════════════════════════════════════════

-- ============================================================
-- 1. TABLE SUPPLIERS (Fournisseurs)
-- ============================================================
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  city text,
  country text DEFAULT 'Guinée',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. INDEX
-- ============================================================
CREATE INDEX idx_suppliers_user_id ON public.suppliers(user_id);
CREATE INDEX idx_suppliers_organization_id ON public.suppliers(organization_id);
CREATE INDEX idx_suppliers_name ON public.suppliers(name);

-- ============================================================
-- 3. RLS POLICIES — même pattern que les autres tables
-- ============================================================

-- Les utilisateurs voient les fournisseurs de leur organisation
CREATE POLICY "Suppliers: lecture organisation"
  ON public.suppliers
  FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT p.organization_id
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
  );

-- Les admins/managers peuvent insérer
CREATE POLICY "Suppliers: insertion par propriétaire ou admin"
  ON public.suppliers
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'admin', 'manager')
    )
  );

-- Les admins/managers peuvent modifier
CREATE POLICY "Suppliers: modification par propriétaire ou admin"
  ON public.suppliers
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'admin', 'manager')
    )
  );

-- Les admins/managers peuvent supprimer
CREATE POLICY "Suppliers: suppression par propriétaire ou admin"
  ON public.suppliers
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'admin', 'manager')
    )
  );

-- ============================================================
-- 4. TRIGGER — auto-set organization_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_supplier_organization_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT p.organization_id INTO NEW.organization_id
    FROM public.profiles p
    WHERE p.user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_set_supplier_organization_id
  BEFORE INSERT ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_supplier_organization_id();

-- ============================================================
-- 5. AJOUT supplier_id SUR PRODUCTS
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX idx_products_supplier_id ON public.products(supplier_id);

-- ============================================================
-- 6. REALTIME — activer pour la table suppliers
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
