-- ============================================================
-- Suppliers & Supplier Products
-- Adds supplier management with product lists per supplier.
-- A supplier can have a catalog of products with agreed prices.
-- ============================================================

-- ─── suppliers table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON public.suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_active ON public.suppliers(organization_id, is_active);

-- ─── supplier_products table ────────────────────────────────
-- Links a supplier to a product with a negotiated supply price and
-- minimum order quantity.  One supplier can supply many products,
-- and one product can be supplied by many suppliers (N:N).
CREATE TABLE IF NOT EXISTS public.supplier_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supply_price  NUMERIC(12,2),           -- prix d'achat convenu avec ce fournisseur
  min_quantity  INTEGER NOT NULL DEFAULT 1, -- quantité minimale de commande
  notes         TEXT,                     -- notes spécifiques à cette ligne
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, product_id)         -- un produit par fournisseur = une ligne
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON public.supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_product ON public.supplier_products(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_org ON public.supplier_products(organization_id);

-- ─── updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER set_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_supplier_products_updated_at ON public.supplier_products;
CREATE TRIGGER set_supplier_products_updated_at
  BEFORE UPDATE ON public.supplier_products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── RLS ────────────────────────────────────────────────────
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;

-- suppliers: SELECT — org members
CREATE POLICY "org_members_select_suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- suppliers: INSERT — admin/manager
CREATE POLICY "org_admins_insert_suppliers" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- suppliers: UPDATE — admin/manager
CREATE POLICY "org_admins_update_suppliers" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- suppliers: DELETE — admin only
CREATE POLICY "org_admins_delete_suppliers" ON public.suppliers
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- supplier_products: SELECT — org members
CREATE POLICY "org_members_select_supplier_products" ON public.supplier_products
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- supplier_products: INSERT — admin/manager
CREATE POLICY "org_admins_insert_supplier_products" ON public.supplier_products
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- supplier_products: UPDATE — admin/manager
CREATE POLICY "org_admins_update_supplier_products" ON public.supplier_products
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- supplier_products: DELETE — admin/manager
CREATE POLICY "org_admins_delete_supplier_products" ON public.supplier_products
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- ─── RPC: get_supplier_stats ────────────────────────────────
-- Returns aggregated stats for the suppliers page header.
CREATE OR REPLACE FUNCTION public.get_supplier_stats(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'totalSuppliers', COUNT(*)::int,
    'activeSuppliers', COUNT(*) FILTER (WHERE is_active)::int,
    'totalProducts', (SELECT COUNT(*)::int FROM supplier_products WHERE organization_id = p_organization_id AND is_active),
    'totalSupplyValue', COALESCE(
      (SELECT SUM(sp.supply_price * sp.min_quantity)
       FROM supplier_products sp
       WHERE sp.organization_id = p_organization_id AND sp.is_active),
      0
    )
  ) INTO result
  FROM suppliers
  WHERE organization_id = p_organization_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_stats(UUID) TO authenticated;

-- ─── RPC: get_supplier_with_products ────────────────────────
-- Returns a supplier with its product list (for detail view).
CREATE OR REPLACE FUNCTION public.get_supplier_with_products(p_supplier_id UUID, p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  supplier_data JSONB;
  products_data JSONB;
BEGIN
  -- Get supplier info
  SELECT to_jsonb(s.*) INTO supplier_data
  FROM suppliers s
  WHERE s.id = p_supplier_id AND s.organization_id = p_organization_id;

  IF supplier_data IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get products for this supplier
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sp.id,
      'product_id', sp.product_id,
      'product_name', p.name,
      'product_barcode', p.barcode,
      'product_unit', p.unit,
      'supply_price', sp.supply_price,
      'min_quantity', sp.min_quantity,
      'current_stock', p.stock_quantity,
      'notes', sp.notes,
      'is_active', sp.is_active
    ) ORDER BY p.name
  ), '[]'::jsonb) INTO products_data
  FROM supplier_products sp
  JOIN products p ON p.id = sp.product_id
  WHERE sp.supplier_id = p_supplier_id
    AND sp.organization_id = p_organization_id;

  RETURN supplier_data || jsonb_build_object('products', products_data);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_with_products(UUID, UUID) TO authenticated;
