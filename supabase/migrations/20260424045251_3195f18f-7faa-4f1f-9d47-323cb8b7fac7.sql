
-- ============================================================
-- 1. CRÉATION DE LA TABLE ORGANIZATIONS (BOUTIQUES)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL,
  country text DEFAULT 'Sénégal',
  currency text DEFAULT 'FCFA',
  subscription_plan public.subscription_plan DEFAULT 'starter',
  subscription_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. AJOUT organization_id SUR TOUTES LES TABLES MÉTIER
-- ============================================================
ALTER TABLE public.profiles         ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.products         ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.categories       ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.customers        ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.customer_credits ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.sales            ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.sale_items       ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.expenses         ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.stock_movements  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- ============================================================
-- 3. MIGRATION DES DONNÉES EXISTANTES
-- ============================================================
-- 3a. Créer une organisation pour chaque admin existant
INSERT INTO public.organizations (id, name, owner_user_id, country, currency, subscription_plan, subscription_expires_at, created_at)
SELECT 
  gen_random_uuid(),
  p.business_name,
  p.user_id,
  COALESCE(p.country, 'Sénégal'),
  COALESCE(p.currency, 'FCFA'),
  COALESCE(p.subscription_plan, 'starter'),
  p.subscription_expires_at,
  p.created_at
FROM public.profiles p
INNER JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations o WHERE o.owner_user_id = p.user_id
);

-- 3b. Rattacher chaque admin à SA boutique
UPDATE public.profiles p
SET organization_id = o.id
FROM public.organizations o
WHERE o.owner_user_id = p.user_id AND p.organization_id IS NULL;

-- 3c. Rattacher les employés (non-admin) à la boutique principale "Ménage Facile" (KABA)
-- Choix : le premier admin créé devient le propriétaire de référence pour les orphelins
UPDATE public.profiles p
SET organization_id = (
  SELECT o.id FROM public.organizations o
  INNER JOIN public.profiles po ON po.user_id = o.owner_user_id
  WHERE po.business_name = 'Ménage Facile'
  ORDER BY o.created_at ASC
  LIMIT 1
)
WHERE p.organization_id IS NULL;

-- 3d. Rattacher toutes les données métier à la boutique du propriétaire
UPDATE public.products SET organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = products.user_id LIMIT 1) WHERE organization_id IS NULL;
UPDATE public.categories SET organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = categories.user_id LIMIT 1) WHERE organization_id IS NULL;
UPDATE public.customers SET organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = customers.user_id LIMIT 1) WHERE organization_id IS NULL;
UPDATE public.customer_credits SET organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = customer_credits.user_id LIMIT 1) WHERE organization_id IS NULL;
UPDATE public.sales SET organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = sales.user_id LIMIT 1) WHERE organization_id IS NULL;
UPDATE public.expenses SET organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = expenses.user_id LIMIT 1) WHERE organization_id IS NULL;
UPDATE public.stock_movements SET organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = stock_movements.user_id LIMIT 1) WHERE organization_id IS NULL;
UPDATE public.sale_items SET organization_id = (SELECT s.organization_id FROM public.sales s WHERE s.id = sale_items.sale_id LIMIT 1) WHERE organization_id IS NULL;

-- ============================================================
-- 4. FONCTION SÉCURISÉE POUR RÉCUPÉRER L'ORG DE L'UTILISATEUR
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_member_of_organization(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND organization_id = _org_id
  );
$$;

-- ============================================================
-- 5. RLS ORGANIZATIONS
-- ============================================================
DROP POLICY IF EXISTS "members_can_view_org" ON public.organizations;
DROP POLICY IF EXISTS "admin_can_update_org" ON public.organizations;
DROP POLICY IF EXISTS "admin_can_create_org" ON public.organizations;

CREATE POLICY "members_can_view_org" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_member_of_organization(id));

CREATE POLICY "admin_can_update_org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_can_create_org" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- ============================================================
-- 6. NOUVELLES RLS BASÉES SUR ORGANIZATION_ID
-- ============================================================

-- PRODUCTS : tous les membres voient, admin/manager modifient
DROP POLICY IF EXISTS "Users can view their own products" ON public.products;
DROP POLICY IF EXISTS "Users can create their own products" ON public.products;
DROP POLICY IF EXISTS "Users can update their own products" ON public.products;
DROP POLICY IF EXISTS "Users can delete their own products" ON public.products;

CREATE POLICY "org_members_view_products" ON public.products
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_members_insert_products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "org_members_update_products" ON public.products
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "org_admins_delete_products" ON public.products
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- CATEGORIES
DROP POLICY IF EXISTS "Users can view their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can create their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can update their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can delete their own categories" ON public.categories;

CREATE POLICY "org_members_view_categories" ON public.categories
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_members_insert_categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "org_members_update_categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_admins_delete_categories" ON public.categories
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- CUSTOMERS
DROP POLICY IF EXISTS "Users can view their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can create their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can update their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete their own customers" ON public.customers;

CREATE POLICY "org_members_view_customers" ON public.customers
  FOR SELECT TO authenticated USING (organization_id = public.get_user_organization_id());
CREATE POLICY "org_members_insert_customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY "org_members_update_customers" ON public.customers
  FOR UPDATE TO authenticated USING (organization_id = public.get_user_organization_id());
CREATE POLICY "org_admins_delete_customers" ON public.customers
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- CUSTOMER_CREDITS
DROP POLICY IF EXISTS "Users can view their own credits" ON public.customer_credits;
DROP POLICY IF EXISTS "Users can create their own credits" ON public.customer_credits;
DROP POLICY IF EXISTS "Users can update their own credits" ON public.customer_credits;
DROP POLICY IF EXISTS "Users can delete their own credits" ON public.customer_credits;

CREATE POLICY "org_members_view_credits" ON public.customer_credits
  FOR SELECT TO authenticated USING (organization_id = public.get_user_organization_id());
CREATE POLICY "org_members_insert_credits" ON public.customer_credits
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY "org_members_update_credits" ON public.customer_credits
  FOR UPDATE TO authenticated USING (organization_id = public.get_user_organization_id());
CREATE POLICY "org_admins_delete_credits" ON public.customer_credits
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_role(auth.uid(), 'admin')
  );

-- SALES
DROP POLICY IF EXISTS "Users can view their own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can create their own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can update their own sales" ON public.sales;

CREATE POLICY "org_members_view_sales" ON public.sales
  FOR SELECT TO authenticated USING (organization_id = public.get_user_organization_id());
CREATE POLICY "org_members_insert_sales" ON public.sales
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY "org_admins_update_sales" ON public.sales
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- SALE_ITEMS
DROP POLICY IF EXISTS "Users can view their own sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Users can create their own sale items" ON public.sale_items;

CREATE POLICY "org_members_view_sale_items" ON public.sale_items
  FOR SELECT TO authenticated USING (organization_id = public.get_user_organization_id());
CREATE POLICY "org_members_insert_sale_items" ON public.sale_items
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.get_user_organization_id());

-- EXPENSES (comptable et admin/manager)
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;

CREATE POLICY "org_members_view_expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'comptable')
    )
  );
CREATE POLICY "org_accountants_insert_expenses" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'comptable')
    )
  );
CREATE POLICY "org_accountants_update_expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'comptable')
    )
  );
CREATE POLICY "org_admins_delete_expenses" ON public.expenses
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- STOCK_MOVEMENTS
DROP POLICY IF EXISTS "Users can view their own stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Users can create their own stock movements" ON public.stock_movements;

CREATE POLICY "org_members_view_stock" ON public.stock_movements
  FOR SELECT TO authenticated USING (organization_id = public.get_user_organization_id());
CREATE POLICY "org_members_insert_stock" ON public.stock_movements
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.get_user_organization_id());

-- ============================================================
-- 7. INDEX POUR PERFORMANCES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_categories_org ON public.categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_org ON public.sales(organization_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_org ON public.sale_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org ON public.expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_org ON public.stock_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_credits_org ON public.customer_credits(organization_id);

-- ============================================================
-- 8. TRIGGER updated_at sur organizations
-- ============================================================
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 9. AUTO-ASSIGNATION organization_id LORS DES INSERTS
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_user_organization_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_org_products ON public.products;
CREATE TRIGGER auto_org_products BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

DROP TRIGGER IF EXISTS auto_org_categories ON public.categories;
CREATE TRIGGER auto_org_categories BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

DROP TRIGGER IF EXISTS auto_org_customers ON public.customers;
CREATE TRIGGER auto_org_customers BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

DROP TRIGGER IF EXISTS auto_org_credits ON public.customer_credits;
CREATE TRIGGER auto_org_credits BEFORE INSERT ON public.customer_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

DROP TRIGGER IF EXISTS auto_org_sales ON public.sales;
CREATE TRIGGER auto_org_sales BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

DROP TRIGGER IF EXISTS auto_org_expenses ON public.expenses;
CREATE TRIGGER auto_org_expenses BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

DROP TRIGGER IF EXISTS auto_org_stock ON public.stock_movements;
CREATE TRIGGER auto_org_stock BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- Auto-set sale_items.organization_id depuis la sale parente
CREATE OR REPLACE FUNCTION public.set_sale_item_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.sales WHERE id = NEW.sale_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_org_sale_items ON public.sale_items;
CREATE TRIGGER auto_org_sale_items BEFORE INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.set_sale_item_organization();
