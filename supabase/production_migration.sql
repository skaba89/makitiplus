-- ═══════════════════════════════════════════════════════════════
-- MAKITIPLUS — Migration de production (une seule exécution)
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- Date : Juin 2026
-- ═══════════════════════════════════════════════════════════════

-- 1. Fonction RPC batch_update_stock (ventes atomiques)
CREATE OR REPLACE FUNCTION public.batch_update_stock(
  p_sale_id UUID,
  p_items JSONB
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  item JSONB;
  new_qty INT;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.products
    SET stock_quantity = stock_quantity - (item->>'quantity')::INT
    WHERE id = (item->>'product_id')::UUID
    RETURNING stock_quantity INTO new_qty;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', item->>'product_id';
    END IF;

    IF new_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product %', item->>'product_id';
    END IF;

    INSERT INTO public.stock_movements (user_id, product_id, type, quantity, previous_quantity, new_quantity, reference_id)
    VALUES (
      (SELECT user_id FROM public.sales WHERE id = p_sale_id),
      (item->>'product_id')::UUID,
      'sale',
      -(item->>'quantity')::INT,
      (item->>'previous_quantity')::INT,
      new_qty,
      p_sale_id
    );
  END LOOP;
END;
$$;

-- 2. Clés étrangères manquantes (intégrité des données)
-- Priority 1: Critical business logic FKs
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_reference_id_fkey
  FOREIGN KEY (reference_id) REFERENCES public.sales(id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id ON public.stock_movements(reference_id);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

-- Priority 2: organization_id FKs across all business tables
DO $$
BEGIN
  -- Use DO block to ignore errors if constraints already exist
  ALTER TABLE public.products ADD CONSTRAINT products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.categories ADD CONSTRAINT categories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customers ADD CONSTRAINT customers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customer_credits ADD CONSTRAINT customer_credits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.password_reset_tokens ADD CONSTRAINT password_reset_tokens_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Politiques RLS renforcées
-- sync_conflicts: Add organization_id column
ALTER TABLE public.sync_conflicts ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_org ON public.sync_conflicts(organization_id);

UPDATE public.sync_conflicts sc
SET organization_id = (
  SELECT organization_id FROM public.profiles
  WHERE user_id = sc.user_id LIMIT 1
)
WHERE sc.organization_id IS NULL;

DROP POLICY IF EXISTS "sync_conflicts_insert_authenticated" ON public.sync_conflicts;
CREATE POLICY "sync_conflicts_insert_own_org"
  ON public.sync_conflicts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.get_user_organization_id()
  );

-- categories UPDATE: admin/manager only
DROP POLICY IF EXISTS "org_members_update_categories" ON public.categories;
CREATE POLICY "org_admins_update_categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- customers UPDATE: admin/manager only
DROP POLICY IF EXISTS "org_members_update_customers" ON public.customers;
CREATE POLICY "org_admins_update_customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- products UPDATE: admin/manager only
DROP POLICY IF EXISTS "org_members_update_products" ON public.products;
CREATE POLICY "org_admins_update_products" ON public.products
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- customer_credits UPDATE + INSERT: admin/manager/comptable
DROP POLICY IF EXISTS "org_members_update_credits" ON public.customer_credits;
CREATE POLICY "org_admins_update_credits" ON public.customer_credits
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable'))
  );

DROP POLICY IF EXISTS "org_members_insert_credits" ON public.customer_credits;
CREATE POLICY "org_admins_insert_credits" ON public.customer_credits
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable'))
  );

-- Cleanup duplicate policy
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;

-- 4. Autoriser admin_exists() pour les utilisateurs non connectés
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated;

-- ✅ Migration terminée !
