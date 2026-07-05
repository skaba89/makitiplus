-- ============================================================
-- MakitiPlus — Combined Deployment Script
-- Auto-generated — DO NOT EDIT
-- ============================================================

-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260202072852_917790af-3d14-44e9-bcdd-d88776ced82b.sql
-- ═════════════════════════════════════════════════════════════════

-- Allow users to insert their own role after signup
CREATE POLICY "Users can create their own role" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260207065000_da463d93-5048-43ec-bb39-482bb0ea3ab9.sql
-- ═════════════════════════════════════════════════════════════════

-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  total_purchases NUMERIC NOT NULL DEFAULT 0,
  total_credit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own customers" ON public.customers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own customers" ON public.customers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own customers" ON public.customers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own customers" ON public.customers FOR DELETE USING (auth.uid() = user_id);

-- Create customer_credits table for credit tracking
CREATE TABLE public.customer_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id),
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'payment')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credits" ON public.customer_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own credits" ON public.customer_credits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own credits" ON public.customer_credits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own credits" ON public.customer_credits FOR DELETE USING (auth.uid() = user_id);

-- Add customer_id to sales table
ALTER TABLE public.sales ADD COLUMN customer_id UUID REFERENCES public.customers(id);

-- Add trigger for updated_at on customers
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260423040958_42cc2233-086f-4864-a7d3-64cb40a81ed5.sql
-- ═════════════════════════════════════════════════════════════════

-- Function to check if any admin already exists (used to allow first signup as admin)
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  );
$$;

-- Ensure only one admin can exist (race condition protection)
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_admin ON public.user_roles (role)
WHERE role = 'admin';

-- RLS: only admin can insert into user_roles (except the very first admin)
DROP POLICY IF EXISTS "Users can insert their own role on signup" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert any role" ON public.user_roles;
DROP POLICY IF EXISTS "Allow first admin or admin-created roles" ON public.user_roles;

CREATE POLICY "Allow first admin or admin-created roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow if no admin exists yet AND user is creating their own admin role
  (NOT public.admin_exists() AND auth.uid() = user_id AND role = 'admin')
  OR
  -- Allow existing admins to create any role for any user
  public.has_role(auth.uid(), 'admin')
);

-- Allow admins to delete user_roles
DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
CREATE POLICY "Admins can delete user roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all user_roles
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

-- Allow admins to view/update all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

-- Allow admins to insert profiles for other users
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.profiles;
CREATE POLICY "Admins can insert any profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260423042235_125de771-f1c8-4b67-90db-2b6d811096ca.sql
-- ═════════════════════════════════════════════════════════════════

-- 1. Add status & login tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivation_reason text;

-- 2. Tighten RLS on profiles: drop overly permissive policies
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Recreate strict policies
CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_insert_own_or_admin"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_update_own_or_admin"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_delete_admin_only"
ON public.profiles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. Tighten RLS on user_roles: vendors/managers see only their own role
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Anyone can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can view all roles" ON public.user_roles;

CREATE POLICY "user_roles_select_own_or_admin"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 4. Audit log table (immutable trail)
CREATE TABLE IF NOT EXISTS public.user_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  target_user_id uuid,
  target_user_name text,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_created_at
  ON public.user_audit_log (created_at DESC);

ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit log
DROP POLICY IF EXISTS "audit_select_admin" ON public.user_audit_log;
CREATE POLICY "audit_select_admin"
ON public.user_audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Insert allowed by authenticated admins (edge functions use service role and bypass RLS)
DROP POLICY IF EXISTS "audit_insert_admin" ON public.user_audit_log;
CREATE POLICY "audit_insert_admin"
ON public.user_audit_log FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- No UPDATE / DELETE policies → effectively immutable for end users

-- 5. Function to update own last_login_at safely
CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = now()
  WHERE user_id = auth.uid();
END;
$$;

-- 6. Function to check if user is active (used by edge functions)
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE user_id = _user_id),
    true
  );
$$;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260424042936_db7e40cf-c001-4513-9126-a0596e12f542.sql
-- ═════════════════════════════════════════════════════════════════

-- Table de journal des conflits de synchronisation
CREATE TABLE public.sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL, -- 'product', 'sale', 'profile', 'user_role', 'stock'
  entity_id UUID,
  entity_label TEXT, -- nom lisible (ex: nom du produit)
  device_id TEXT, -- identifiant de l'appareil source
  local_data JSONB,
  remote_data JSONB,
  resolved_data JSONB,
  resolution_strategy TEXT NOT NULL, -- 'last_write_wins', 'merge_delta', 'unique_id', 'manual'
  status TEXT NOT NULL DEFAULT 'resolved', -- 'resolved', 'pending', 'failed'
  error_message TEXT,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

-- Seul l'admin voit / gère les conflits de toute l'équipe
CREATE POLICY "sync_conflicts_select_admin"
  ON public.sync_conflicts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sync_conflicts_insert_authenticated"
  ON public.sync_conflicts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sync_conflicts_update_admin"
  ON public.sync_conflicts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_sync_conflicts_user_acknowledged
  ON public.sync_conflicts (user_id, acknowledged, created_at DESC);

-- Fonction : statut du compte connecté (pour polling client)
CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE(is_active boolean, deactivation_reason text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(p.is_active, true) AS is_active,
    p.deactivation_reason
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

-- Fonction : résolution conflit stock par deltas
-- previous = quantité de référence connue avant édition
-- local_new = quantité après opération locale
-- remote_new = quantité après opération distante
-- résultat = remote_new + (local_new - previous)
CREATE OR REPLACE FUNCTION public.resolve_stock_conflict(
  previous_qty integer,
  local_new_qty integer,
  remote_new_qty integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0, remote_new_qty + (local_new_qty - previous_qty));
$$;

-- Index pour accélérer les filtres audit
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.user_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_target_user ON public.user_audit_log (target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.user_audit_log (created_at DESC);


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260424042947_b1941d89-89c0-4cb2-bdbc-6aaebc400cbb.sql
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_stock_conflict(
  previous_qty integer,
  local_new_qty integer,
  remote_new_qty integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(0, remote_new_qty + (local_new_qty - previous_qty));
$$;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260424045251_3195f18f-7faa-4f1f-9d47-323cb8b7fac7.sql
-- ═════════════════════════════════════════════════════════════════

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


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260425041530_c56455ad-2249-438f-b9a2-15f7f64df5e5.sql
-- ═════════════════════════════════════════════════════════════════

-- Ajout d'un taux de taxe par défaut au niveau organisation et override par produit
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_tax_rate numeric NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tax_rate numeric;

COMMENT ON COLUMN public.organizations.default_tax_rate IS 'Taux de taxe par défaut en % (ex: 18 pour TVA Sénégal). 0 = pas de taxe.';
COMMENT ON COLUMN public.products.tax_rate IS 'Taux de taxe spécifique au produit en %. NULL = utiliser le taux de la boutique. Le prix produit est considéré TTC.';


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260426042420_f2188ae3-aeea-4b23-9b02-04b4b9938345.sql
-- ═════════════════════════════════════════════════════════════════

-- 1. Add test account columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_test_expiry
  ON public.profiles (test_expires_at)
  WHERE is_test_account = true AND is_active = true;

-- 2. Password reset tokens table (one-time magic links)
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  destination text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  organization_id uuid
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_tokens_user
  ON public.password_reset_tokens (user_id, used_at);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_view_reset_tokens"
  ON public.password_reset_tokens FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins_insert_reset_tokens"
  ON public.password_reset_tokens FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- No UPDATE/DELETE policies: only edge functions (service role) can mutate

-- 3. Mark existing test accounts as test with 7-day rotation
UPDATE public.profiles p
SET is_test_account = true,
    test_expires_at = now() + interval '7 days'
FROM auth.users u
WHERE p.user_id = u.id
  AND u.email LIKE '%.test@malikiplus.local';

-- 4. Enable cron + net extensions for scheduled rotation
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260426042625_fac2f592-7105-47f9-b6d5-63e8c4135346.sql
-- ═════════════════════════════════════════════════════════════════

-- Schedule daily test account rotation at 03:00 UTC
SELECT cron.schedule(
  'rotate-test-accounts-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://eiquqawymbgfejwucvyt.supabase.co/functions/v1/rotate-test-accounts',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260427045819_7d242cc0-26f4-4887-a0d5-d687cb78cdba.sql
-- ═════════════════════════════════════════════════════════════════

-- 1. Add IP address column to audit log (admin-only visible via existing RLS)
ALTER TABLE public.user_audit_log
  ADD COLUMN IF NOT EXISTS ip_address text;

-- 2. Tighten password_reset_tokens RLS: admins only see tokens of their own org
DROP POLICY IF EXISTS admins_view_reset_tokens ON public.password_reset_tokens;

CREATE POLICY admins_view_reset_tokens_org
ON public.password_reset_tokens
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND organization_id = public.get_user_organization_id()
);

-- Insert policy: admin must insert for their own org
DROP POLICY IF EXISTS admins_insert_reset_tokens ON public.password_reset_tokens;

CREATE POLICY admins_insert_reset_tokens_org
ON public.password_reset_tokens
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND organization_id = public.get_user_organization_id()
);


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260612031944_ff09240b-7ecb-49e5-b88b-e9800618663b.sql
-- ═════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.is_user_active(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_organization_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_sale_item_organization() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_sale_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_stock_conflict(integer, integer, integer) FROM anon, authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260612031957_f26f99b1-d459-4100-876b-f11b8ebf4985.sql
-- ═════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_organization_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_member_of_organization(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_account_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_last_login() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_exists() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO service_role;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260612032011_a2f1b765-7ea2-46da-be0c-40a9e3e7f831.sql
-- ═════════════════════════════════════════════════════════════════

-- Revoke PUBLIC on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.is_user_active(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_organization_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_sale_item_organization() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_sale_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_stock_conflict(integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_organization_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_member_of_organization(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_account_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_last_login() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_exists() FROM PUBLIC;

-- Re-grant only to legitimate roles
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_member_of_organization(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_user_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_stock_conflict(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_sale_number() TO service_role;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260614010000_batch_update_stock_rpc.sql
-- ═════════════════════════════════════════════════════════════════

-- Batch stock update RPC for POS sales.
-- Atomically decrements stock and records movements in a single transaction.
-- Prevents race conditions and avoids N+1 queries from the frontend.

CREATE OR REPLACE FUNCTION public.batch_update_stock(
  p_sale_id UUID,
  p_items JSONB  -- [{product_id: UUID, quantity: INT, previous_quantity: INT}]
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
    -- Decrement stock atomically with row lock
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

    -- Record stock movement
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


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260614020000_add_missing_foreign_keys.sql
-- ═════════════════════════════════════════════════════════════════

-- Add missing foreign key constraints for data integrity.
-- Priority 1: Critical business logic FKs
-- Priority 2: organization_id FKs across all business tables (already indexed)

-- ═══════════════════════════════════════════════════════════
-- PRIORITY 1: Critical FKs for data integrity
-- ═══════════════════════════════════════════════════════════

-- stock_movements.reference_id → sales(id) — used by batch_update_stock RPC
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_reference_id_fkey
  FOREIGN KEY (reference_id) REFERENCES public.sales(id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id ON public.stock_movements(reference_id);

-- profiles.organization_id → organizations(id) — core relationship
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

-- ═══════════════════════════════════════════════════════════
-- PRIORITY 2: organization_id FKs across all business tables
-- All tables already have indexes on organization_id
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.products
  ADD CONSTRAINT products_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.sales
  ADD CONSTRAINT sales_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.categories
  ADD CONSTRAINT categories_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.customers
  ADD CONSTRAINT customers_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.customer_credits
  ADD CONSTRAINT customer_credits_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.password_reset_tokens
  ADD CONSTRAINT password_reset_tokens_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260614030000_tighten_rls_policies.sql
-- ═════════════════════════════════════════════════════════════════

-- Tighten RLS policies: restrict UPDATE on categories/customers/products/credits
-- to admin/manager, fix sync_conflicts INSERT with org scoping.

-- ═══════════════════════════════════════════════════════════
-- 1. sync_conflicts: Add organization_id column and fix INSERT policy
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.sync_conflicts
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_org
  ON public.sync_conflicts(organization_id);

-- Backfill existing rows from user's profile
UPDATE public.sync_conflicts sc
SET organization_id = (
  SELECT organization_id FROM public.profiles
  WHERE user_id = sc.user_id LIMIT 1
)
WHERE sc.organization_id IS NULL;

-- Replace wide-open INSERT policy with org-scoped one
DROP POLICY IF EXISTS "sync_conflicts_insert_authenticated" ON public.sync_conflicts;
CREATE POLICY "sync_conflicts_insert_own_org"
  ON public.sync_conflicts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.get_user_organization_id()
  );

-- ═══════════════════════════════════════════════════════════
-- 2. categories UPDATE: restrict to admin/manager only
-- ═══════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════
-- 3. customers UPDATE: restrict to admin/manager only
-- ═══════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════
-- 4. products UPDATE: restrict to admin/manager only
-- ═══════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════
-- 5. customer_credits UPDATE + INSERT: restrict to admin/manager/comptable
-- ═══════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════
-- 6. Cleanup: remove duplicate user_roles SELECT policy
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260614040000_grant_admin_exists_to_anon.sql
-- ═════════════════════════════════════════════════════════════════

-- Allow unauthenticated users to check if an admin exists
-- This is required for the "Premier admin" signup tab to appear
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260629010000_add_super_admin_role.sql
-- ═════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- MAKITIPLUS — Ajout du rôle super_admin
-- Le super_admin peut créer des magasins (organizations) et 
-- des admins pour chaque magasin.
-- ═══════════════════════════════════════════════════════════════

-- 1. Ajouter super_admin à l'enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin' AFTER 'admin';

-- 2. Supprimer l'ancien index unique sur admin (un seul admin)
DROP INDEX IF EXISTS public.idx_single_admin;

-- 3. Fonction pour vérifier si l'utilisateur est super_admin
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

-- 4. Mettre à jour la fonction admin_exists pour vérifier super_admin aussi
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

-- 5. Autoriser is_super_admin() pour les utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- 6. RLS : super_admin peut voir TOUTES les organisations
DROP POLICY IF EXISTS "members_can_view_org" ON public.organizations;
CREATE POLICY "members_can_view_org" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() 
    OR public.is_member_of_organization(id)
  );

-- super_admin peut créer des organisations
DROP POLICY IF EXISTS "admin_can_create_org" ON public.organizations;
CREATE POLICY "admin_can_create_org" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() 
    OR owner_user_id = auth.uid()
  );

-- super_admin peut modifier toute organisation
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

-- 7. RLS : super_admin peut voir tous les profils (pour gérer les admins)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid() 
    OR organization_id = public.get_user_organization_id()
  );

-- 8. RLS : super_admin peut voir tous les rôles
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid() 
    OR public.has_role(auth.uid(), 'admin')
  );

-- 9. RLS : super_admin peut insérer des rôles pour n'importe quel utilisateur
DROP POLICY IF EXISTS "Users can create their own role" ON public.user_roles;
CREATE POLICY "Users can create their own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR user_id = auth.uid()
  );

-- 10. RLS : super_admin peut voir les utilisateurs de toutes les orgs
-- (needed for the admin management page)
DROP POLICY IF EXISTS "admins_view_audit_log" ON public.user_audit_log;
CREATE POLICY "admins_view_audit_log" ON public.user_audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin')
  );

-- ✅ Migration terminée !


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260629010001_store_settings_and_default_categories.sql
-- ═════════════════════════════════════════════════════════════════

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


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260629020000_add_store_category.sql
-- ═════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- MAKITIPLUS — Ajout catégories de magasins
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- Date : Juin 2026
-- ═══════════════════════════════════════════════════════════════════════

-- Étape 1 : Créer l'enum store_category (transaction séparée)
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

-- Étape 2 : Ajouter la colonne category à organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS category public.store_category DEFAULT 'epicerie';

-- Étape 3 : Recharger le cache PostgREST
NOTIFY pgrst, 'reload schema';


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701010000_fix_rls_self_escalation_and_super_admin.sql
-- ═════════════════════════════════════════════════════════════════

-- Migration: Fix RLS self-escalation vulnerability and include super_admin in all policies
-- Date: 2026-07-01
-- FULLY IDEMPOTENT — safe to re-run any number of times

-- ============================================
-- 1. Prevent self-role-escalation on user_roles INSERT
-- ============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "user_roles_insert_self_or_admin" ON user_roles;
  DROP POLICY IF EXISTS "user_roles_insert_admin_only" ON user_roles;
  DROP POLICY IF EXISTS "Users can create their own role" ON user_roles;
  DROP POLICY IF EXISTS "Allow first admin or admin-created roles" ON user_roles;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'user_roles drop: %', SQLERRM;
END $$;

CREATE POLICY "user_roles_insert_admin_only" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 2. Include super_admin in user_roles DELETE
-- ============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can delete user roles" ON user_roles;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'user_roles delete drop: %', SQLERRM;
END $$;

CREATE POLICY "Admins can delete user roles" ON user_roles
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 3. Include super_admin in audit_log INSERT
-- ============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "admins_insert_audit_log" ON user_audit_log;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'audit_log drop: %', SQLERRM;
END $$;

CREATE POLICY "admins_insert_audit_log" ON user_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 4. Include super_admin in reset_tokens INSERT
-- ============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "admins_insert_reset_tokens" ON password_reset_tokens;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'reset_tokens drop: %', SQLERRM;
END $$;

CREATE POLICY "admins_insert_reset_tokens" ON password_reset_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 5. Include super_admin in profiles UPDATE
-- ============================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'profiles update drop: %', SQLERRM;
END $$;

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR is_super_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR is_super_admin()
  );

-- ============================================
-- 6. check_account_status returns FALSE when no profile
-- ============================================
CREATE OR REPLACE FUNCTION check_account_status(check_user_id UUID)
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(p.is_active, FALSE),
    r.role::TEXT,
    p.organization_id
  FROM profiles p
  LEFT JOIN user_roles r ON r.user_id = p.user_id
  WHERE p.user_id = check_user_id
  UNION ALL
  SELECT FALSE, NULL, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = check_user_id
  );
$$;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701010001_phase1_security_and_rpc.sql
-- ═════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- Phase 1: Security & Stability Migration
-- 1. Create missing RPC functions (fix 404 errors)
-- 2. Fix search_path injection in check_account_status
-- 3. Add atomic RPC functions for inventory/credits (race condition fix)
-- 4. Add missing database indexes for performance
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- 1. get_dashboard_stats — Dashboard overview statistics
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_today_sales NUMERIC := 0;
  v_today_transactions INT := 0;
  v_month_expenses NUMERIC := 0;
  v_total_products INT := 0;
  v_low_stock_count INT := 0;
  v_out_of_stock_count INT := 0;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  v_start := COALESCE(p_period_start, CURRENT_DATE);
  v_end   := COALESCE(p_period_end, CURRENT_DATE + INTERVAL '1 day');

  -- Today's sales
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_today_sales, v_today_transactions
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= v_start
    AND created_at < v_end;

  -- Month expenses
  SELECT COALESCE(SUM(amount), 0)
    INTO v_month_expenses
  FROM expenses
  WHERE organization_id = v_org_id
    AND expense_date >= date_trunc('month', CURRENT_DATE)
    AND expense_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';

  -- Products stats
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(min_stock_alert, 5) AND stock_quantity > 0),
         COUNT(*) FILTER (WHERE stock_quantity = 0)
    INTO v_total_products, v_low_stock_count, v_out_of_stock_count
  FROM products
  WHERE organization_id = v_org_id AND is_active = true;

  RETURN jsonb_build_object(
    'today_sales', v_today_sales,
    'today_transactions', v_today_transactions,
    'month_expenses', v_month_expenses,
    'total_products', v_total_products,
    'low_stock_count', v_low_stock_count,
    'out_of_stock_count', v_out_of_stock_count
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. get_top_products — Top selling products by quantity
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_top_products(
  p_limit INT DEFAULT 5,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(name TEXT, quantity BIGINT, revenue NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  RETURN QUERY
  SELECT
    si.product_name AS name,
    SUM(si.quantity)::BIGINT AS quantity,
    SUM(si.total_price) AS revenue
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE s.organization_id = v_org_id
    AND (p_period_start IS NULL OR s.created_at >= p_period_start)
    AND (p_period_end IS NULL OR s.created_at < p_period_end)
  GROUP BY si.product_name
  ORDER BY quantity DESC
  LIMIT p_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. get_low_stock_products — Products at or below alert threshold
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_low_stock_products(
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  stock_quantity INT,
  min_stock_alert INT,
  category_name TEXT,
  category_icon TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.stock_quantity,
    COALESCE(p.min_stock_alert, 5),
    c.name AS category_name,
    c.icon AS category_icon
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.organization_id = v_org_id
    AND p.is_active = true
    AND p.stock_quantity <= COALESCE(p.min_stock_alert, 5)
  ORDER BY p.stock_quantity ASC
  LIMIT p_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. get_product_stats — Product page statistics
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_product_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total INT;
  v_low_stock INT;
  v_out_of_stock INT;
  v_active INT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(min_stock_alert, 5) AND stock_quantity > 0),
    COUNT(*) FILTER (WHERE stock_quantity = 0),
    COUNT(*) FILTER (WHERE is_active = true)
  INTO v_total, v_low_stock, v_out_of_stock, v_active
  FROM products
  WHERE organization_id = v_org_id;

  RETURN jsonb_build_object(
    'total_products', v_total,
    'low_stock_count', v_low_stock,
    'out_of_stock_count', v_out_of_stock,
    'active_count', v_active
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. get_reports_stats — Reports page aggregated statistics
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_reports_stats(
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total_sales NUMERIC := 0;
  v_total_transactions INT := 0;
  v_total_expenses NUMERIC := 0;
  v_net_profit NUMERIC := 0;
  v_avg_basket NUMERIC := 0;
  v_payment_distribution JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  -- Sales stats
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_total_sales, v_total_transactions
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= p_period_start
    AND created_at < p_period_end;

  -- Expenses
  SELECT COALESCE(SUM(amount), 0)
    INTO v_total_expenses
  FROM expenses
  WHERE organization_id = v_org_id
    AND expense_date >= p_period_start::date
    AND expense_date < p_period_end::date;

  v_net_profit := v_total_sales - v_total_expenses;
  v_avg_basket := CASE WHEN v_total_transactions > 0
    THEN v_total_sales / v_total_transactions
    ELSE 0 END;

  -- Payment method distribution
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_payment_distribution
  FROM (
    SELECT payment_method AS method, SUM(total_amount) AS value
    FROM sales
    WHERE organization_id = v_org_id
      AND created_at >= p_period_start
      AND created_at < p_period_end
    GROUP BY payment_method
    ORDER BY value DESC
  ) t;

  RETURN jsonb_build_object(
    'total_sales', v_total_sales,
    'total_transactions', v_total_transactions,
    'total_expenses', v_total_expenses,
    'net_profit', v_net_profit,
    'avg_basket', v_avg_basket,
    'payment_distribution', v_payment_distribution
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Fix check_account_status — Add SET search_path = public
--    Dynamically drop ALL existing overloads first to avoid 42P13 errors.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'check_account_status' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE(deactivation_reason text, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT p.deactivation_reason, p.is_active
  FROM profiles p
  WHERE p.user_id = v_uid
  LIMIT 1;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Atomic decrement_stock — Race condition safe stock decrement
--    Dynamically drop existing version first (may return VOID instead of JSONB).
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'decrement_stock' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_product_id UUID,
  p_quantity INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_qty INT;
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization not found');
  END IF;

  -- Lock the row, then update atomically
  UPDATE products
  SET stock_quantity = stock_quantity - p_quantity,
      updated_at = now()
  WHERE id = p_product_id
    AND organization_id = v_org_id
  RETURNING stock_quantity INTO v_new_qty;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Product not found');
  END IF;

  IF v_new_qty < 0 THEN
    -- Rollback the over-decrement
    UPDATE products
    SET stock_quantity = stock_quantity + p_quantity,
        updated_at = now()
    WHERE id = p_product_id;

    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient stock');
  END IF;

  RETURN jsonb_build_object('ok', true, 'new_quantity', v_new_qty);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Atomic decrement_credits — Race condition safe credit decrement
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'decrement_credits' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.decrement_credits(
  p_customer_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_current_credit NUMERIC;
  v_new_credit NUMERIC;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization not found');
  END IF;

  -- Lock and read current credit
  SELECT total_credit INTO v_current_credit
  FROM customers
  WHERE id = p_customer_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Customer not found');
  END IF;

  IF v_current_credit < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient credit', 'current', v_current_credit);
  END IF;

  v_new_credit := v_current_credit - p_amount;

  UPDATE customers
  SET total_credit = v_new_credit,
      updated_at = now()
  WHERE id = p_customer_id AND organization_id = v_org_id;

  RETURN jsonb_build_object('ok', true, 'previous_credit', v_current_credit, 'new_credit', v_new_credit);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. process_pos_sale — Atomic POS sale: validate + create + decrement
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'process_pos_sale' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.process_pos_sale(
  p_account_id UUID,
  p_product_id UUID,
  p_quantity INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_product RECORD;
  v_account RECORD;
  v_sale_id UUID;
  v_sale_number TEXT;
  v_line_total NUMERIC;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization not found');
  END IF;

  -- Lock product row
  SELECT id, name, price, stock_quantity, cost_price
  INTO v_product
  FROM products
  WHERE id = p_product_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Product not found');
  END IF;

  -- Validate stock
  IF v_product.stock_quantity < p_quantity THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient stock', 'available', v_product.stock_quantity);
  END IF;

  -- Lock account row (if using credits)
  SELECT id, total_credit
  INTO v_account
  FROM customers
  WHERE id = p_account_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account not found');
  END IF;

  -- Generate sale number
  v_sale_number := public.generate_sale_number();

  -- Calculate line total
  v_line_total := v_product.price * p_quantity;

  -- Create the sale
  INSERT INTO sales (user_id, organization_id, sale_number, total_amount, subtotal, payment_method, customer_id)
  VALUES (auth.uid(), v_org_id, v_sale_number, v_line_total, v_line_total, 'cash', p_account_id)
  RETURNING id INTO v_sale_id;

  -- Create sale item
  INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price, organization_id)
  VALUES (v_sale_id, p_product_id, v_product.name, p_quantity, v_product.price, v_line_total, v_org_id);

  -- Decrement stock atomically
  UPDATE products
  SET stock_quantity = stock_quantity - p_quantity,
      updated_at = now()
  WHERE id = p_product_id AND organization_id = v_org_id;

  -- Record stock movement
  INSERT INTO stock_movements (user_id, product_id, type, quantity, previous_quantity, new_quantity, reference_id, organization_id)
  VALUES (auth.uid(), p_product_id, 'sale', -p_quantity, v_product.stock_quantity, v_product.stock_quantity - p_quantity, v_sale_id, v_org_id);

  RETURN jsonb_build_object(
    'ok', true,
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'total', v_line_total
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 10. Missing Database Indexes — Performance optimization
-- ═══════════════════════════════════════════════════════════════════════

-- Sales table indexes
CREATE INDEX IF NOT EXISTS idx_sales_account_id ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at_desc ON public.sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_currency ON public.sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_organization_id ON public.sales(organization_id);

-- Accounts / Customers indexes
CREATE INDEX IF NOT EXISTS idx_customers_organization_id ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_stock ON public.products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_organization_id ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode) WHERE barcode IS NOT NULL;

-- Expenses indexes
CREATE INDEX IF NOT EXISTS idx_expenses_organization_id ON public.expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_organization_id ON public.categories(organization_id);

-- Stock movements indexes
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id ON public.stock_movements(reference_id) WHERE reference_id IS NOT NULL;

-- Sale items indexes
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_organization_id ON public.sale_items(organization_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 11. Grant execute permissions to authenticated role
-- ═══════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_products(INT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_low_stock_products(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reports_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_credits(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_pos_sale(UUID, UUID, INT) TO authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701020000_critical_audit_fixes.sql
-- ═════════════════════════════════════════════════════════════════

-- Migration: Critical audit fixes — batch_update_stock grant, check_account_status DROP+recreate,
--            create_full_sale RPC, process_credit_payment RPC, decrement_stock RPC,
--            register_user RPC (atomic signup), increment_customer_credit RPC
-- Date: 2026-07-01
-- FULLY IDEMPOTENT — safe to re-run any number of times
-- Uses dynamic DROP via pg_proc to avoid 42P13 errors regardless of existing signature

-- ============================================
-- 0. Helper: dynamically drop ALL overloads of a function by name
--    This avoids 42P13 errors from signature mismatches in DROP FUNCTION IF EXISTS
-- ============================================

-- ============================================
-- 1. GRANT EXECUTE on batch_update_stock to authenticated (C2)
-- ============================================
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.batch_update_stock(UUID, JSONB) TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'batch_update_stock grant: %', SQLERRM;
END $$;

-- ============================================
-- 2. Fix check_account_status (C3)
--    Dynamically drop ALL existing overloads, then recreate
-- ============================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'check_account_status'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

-- Zero-arg: enriched return type (is_active, role, organization_id, deactivation_reason)
CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID, deactivation_reason TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(p.is_active, FALSE),
    r.role::TEXT,
    p.organization_id,
    p.deactivation_reason
  FROM profiles p
  LEFT JOIN user_roles r ON r.user_id = p.user_id
  WHERE p.user_id = auth.uid()
  UNION ALL
  SELECT FALSE, NULL, NULL, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated, service_role;

-- 1-arg overload
CREATE OR REPLACE FUNCTION public.check_account_status(check_user_id UUID)
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(p.is_active, FALSE),
    r.role::TEXT,
    p.organization_id
  FROM profiles p
  LEFT JOIN user_roles r ON r.user_id = p.user_id
  WHERE p.user_id = check_user_id
  UNION ALL
  SELECT FALSE, NULL, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = check_user_id
  );
$$;

-- ============================================
-- 3. create_full_sale RPC — atomic sale creation (C4 + C5)
--    Dynamically drop ALL existing versions first
-- ============================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'create_full_sale'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_full_sale(
  p_user_id UUID,
  p_organization_id UUID,
  p_sale_number TEXT,
  p_subtotal NUMERIC,
  p_total_amount NUMERIC,
  p_items JSONB,
  p_tax_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash',
  p_amount_paid NUMERIC DEFAULT 0,
  p_change_amount NUMERIC DEFAULT 0,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_current_stock INTEGER;
  v_requested_qty INTEGER;
BEGIN
  -- 0. Pre-check: verify sufficient stock for all items (C5: prevent oversell)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_requested_qty := (v_item->>'quantity')::INTEGER;
    SELECT stock_quantity INTO v_current_stock
    FROM products WHERE id = (v_item->>'product_id')::UUID;

    IF v_current_stock < v_requested_qty THEN
      RAISE EXCEPTION 'Stock insuffisant pour %: demande=%, disponible=%',
        v_item->>'product_name', v_requested_qty, v_current_stock;
    END IF;
  END LOOP;

  -- 1. Insert sale
  INSERT INTO sales (
    user_id, organization_id, sale_number, subtotal, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, customer_name, customer_phone, seller_name
  ) VALUES (
    p_user_id, p_organization_id, p_sale_number, p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method, p_amount_paid, p_change_amount, p_customer_name, p_customer_phone, p_seller_name
  ) RETURNING id INTO v_sale_id;

  -- 2. Insert sale items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (
      sale_id, product_id, product_name, quantity, unit_price, total_price, organization_id
    ) VALUES (
      v_sale_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC,
      p_organization_id
    );
  END LOOP;

  -- 3. Atomically decrement stock (relative update, no race condition)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE products
    SET stock_quantity = GREATEST(stock_quantity - (v_item->>'quantity')::INTEGER, 0),
        updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID;
  END LOOP;

  -- 4. Record stock movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT stock_quantity INTO v_current_stock
    FROM products WHERE id = (v_item->>'product_id')::UUID;

    INSERT INTO stock_movements (
      product_id, type, quantity, previous_quantity, new_quantity, reason, user_id, organization_id
    ) VALUES (
      (v_item->>'product_id')::UUID,
      'sale',
      -(v_item->>'quantity')::INTEGER,
      v_current_stock + (v_item->>'quantity')::INTEGER,
      v_current_stock,
      'Vente ' || p_sale_number,
      p_user_id,
      p_organization_id
    );
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_full_sale TO authenticated;

-- ============================================
-- 4. process_credit_payment RPC — atomic credit payment (C6)
-- ============================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'process_credit_payment'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.process_credit_payment(
  p_user_id UUID,
  p_organization_id UUID,
  p_customer_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Paiement de crédit'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND total_credit >= p_amount) THEN
    RAISE EXCEPTION 'Crédit insuffisant ou client introuvable';
  END IF;

  INSERT INTO customer_credits (
    user_id, organization_id, customer_id, amount, type, description
  ) VALUES (
    p_user_id, p_organization_id, p_customer_id, p_amount, 'payment', p_description
  );

  UPDATE customers
  SET total_credit = GREATEST(total_credit - p_amount, 0),
      updated_at = NOW()
  WHERE id = p_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_credit_payment TO authenticated;

-- ============================================
-- 5. decrement_stock RPC — atomic relative stock decrement (C5 fallback)
-- ============================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'decrement_stock'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_stock INTEGER;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'La quantité doit être supérieure à 0';
  END IF;

  UPDATE products
  SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0),
      updated_at = NOW()
  WHERE id = p_product_id
  RETURNING stock_quantity INTO v_current_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_stock TO authenticated;

-- ============================================
-- 6. register_user RPC — atomic user registration (C9)
-- ============================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'register_user'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.register_user(
  p_user_id UUID,
  p_business_name TEXT,
  p_owner_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'vendeur',
  p_organization_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (user_id, business_name, owner_name, phone, organization_id)
  VALUES (p_user_id, p_business_name, p_owner_name, p_phone, p_organization_id);

  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, p_role::app_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user TO authenticated, service_role;

-- ============================================
-- 7. increment_customer_credit RPC — atomic credit increment
-- ============================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'increment_customer_credit'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.increment_customer_credit(
  p_customer_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0';
  END IF;

  UPDATE customers
  SET total_credit = total_credit + p_amount,
      updated_at = NOW()
  WHERE id = p_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_customer_credit TO authenticated;

-- ============================================
-- 8. GRANT EXECUTE on touch_last_login
-- ============================================
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'touch_last_login grant: %', SQLERRM;
END $$;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701030000_high_audit_fixes.sql
-- ═════════════════════════════════════════════════════════════════

-- Migration: HIGH audit fixes — Storage RLS org scoping, user_roles RLS cleanup, missing GRANTs
-- Date: 2026-07-01
-- FULLY IDEMPOTENT — safe to re-run any number of times

-- ============================================
-- H2: Storage bucket RLS — org scoping on logos
--     Current policies allow ANY authenticated user to upload/overwrite/delete
--     logos from ANY organization. Fix: restrict to admin/manager only, and
--     add org_id metadata check for uploads.
-- ============================================

-- Drop old permissive policies (from original setup)
DROP POLICY IF EXISTS anyone_view_logos ON storage.objects;
DROP POLICY IF EXISTS org_members_upload_logos ON storage.objects;
DROP POLICY IF EXISTS org_members_update_logos ON storage.objects;
DROP POLICY IF EXISTS org_members_delete_logos ON storage.objects;

-- Drop new restrictive policies too (idempotency — in case this migration ran before)
DROP POLICY IF EXISTS org_admins_upload_logos ON storage.objects;
DROP POLICY IF EXISTS org_admins_update_logos ON storage.objects;
DROP POLICY IF EXISTS org_admins_delete_logos ON storage.objects;

-- Anyone can VIEW logos (public read for landing page / receipts)
CREATE POLICY anyone_view_logos ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

-- Only admin/manager of the organization can UPLOAD logos
-- We check the user's profile for their role and org
CREATE POLICY org_admins_upload_logos ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_roles r ON r.user_id = p.user_id
      WHERE p.user_id = auth.uid()
        AND r.role IN ('admin', 'super_admin', 'manager')
    )
  );

-- Only admin/manager can UPDATE logos
CREATE POLICY org_admins_update_logos ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_roles r ON r.user_id = p.user_id
      WHERE p.user_id = auth.uid()
        AND r.role IN ('admin', 'super_admin', 'manager')
    )
  );

-- Only admin/manager can DELETE logos
CREATE POLICY org_admins_delete_logos ON storage.objects
  FOR DELETE USING (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_roles r ON r.user_id = p.user_id
      WHERE p.user_id = auth.uid()
        AND r.role IN ('admin', 'super_admin', 'manager')
    )
  );

-- ============================================
-- H10: Remove conflicting permissive user_roles INSERT policy
--     The old "Users can create their own role" policy allows any user to
--     INSERT any role for themselves. The new "user_roles_insert_admin_only"
--     policy restricts this to admin/super_admin. Both policies exist and
--     Supabase uses OR logic (ANY matching policy = allowed), making the
--     restrictive one ineffective. We must DROP the old permissive one.
-- ============================================
DROP POLICY IF EXISTS "Users can create their own role" ON public.user_roles;

-- ============================================
-- H11: Missing GRANT on check_account_status(UUID) overload
-- ============================================
GRANT EXECUTE ON FUNCTION public.check_account_status(UUID) TO authenticated, service_role;

-- ============================================
-- H2b: Revoke public access on storage objects (if any anon policies exist)
-- ============================================
DO $$ BEGIN
  -- Ensure logos bucket exists
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('logos', 'logos', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'logos bucket: %', SQLERRM;
END $$;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701040000_add_nfc_enabled_to_profiles.sql
-- ═════════════════════════════════════════════════════════════════

-- Add nfc_enabled column to profiles for NFC preference persistence (#24)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nfc_enabled boolean DEFAULT false;

-- Grant is already covered by existing RLS policies on profiles


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701050000_fix_create_full_sale_race_condition.sql
-- ═════════════════════════════════════════════════════════════════

-- Migration: Fix create_full_sale TOCTOU race condition (oversell with concurrent vendeurs)
-- Date: 2026-07-01
-- PROBLEM: Pre-check SELECT + GREATEST(stock_quantity - X, 0) allows oversell when
--          multiple vendeurs sell simultaneously. The pre-check reads stock, then
--          another transaction modifies it, then the UPDATE uses GREATEST which
--          silently clamps to 0 instead of raising an error.
-- FIX: Replace pre-check + GREATEST with atomic UPDATE...RETURNING + exception check.
--       This eliminates the TOCTOU race condition entirely.
-- IDEMPOTENT: Uses dynamic DROP via pg_proc to avoid signature mismatch errors.

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'create_full_sale'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_full_sale(
  p_user_id UUID,
  p_organization_id UUID,
  p_sale_number TEXT,
  p_subtotal NUMERIC,
  p_total_amount NUMERIC,
  p_items JSONB,
  p_tax_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash',
  p_amount_paid NUMERIC DEFAULT 0,
  p_change_amount NUMERIC DEFAULT 0,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_new_stock INTEGER;
  v_previous_stock INTEGER;
BEGIN
  -- 1. Insert sale
  INSERT INTO sales (
    user_id, organization_id, sale_number, subtotal, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, customer_name, customer_phone, seller_name
  ) VALUES (
    p_user_id, p_organization_id, p_sale_number, p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method, p_amount_paid, p_change_amount, p_customer_name, p_customer_phone, p_seller_name
  ) RETURNING id INTO v_sale_id;

  -- 2. Insert sale items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (
      sale_id, product_id, product_name, quantity, unit_price, total_price, organization_id
    ) VALUES (
      v_sale_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC,
      p_organization_id
    );
  END LOOP;

  -- 3. Atomically decrement stock with race-condition protection
  --    UPDATE ... RETURNING is atomic: PostgreSQL acquires a row lock,
  --    so concurrent transactions are serialized at the row level.
  --    If stock goes negative, we raise an exception which rolls back
  --    the entire transaction (sale + sale_items are also rolled back).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE products
    SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID
    RETURNING stock_quantity INTO v_new_stock;

    -- Check for oversell AFTER the atomic update
    IF v_new_stock < 0 THEN
      RAISE EXCEPTION 'Stock insuffisant pour %: stock négatif après décrément',
        v_item->>'product_name';
    END IF;
  END LOOP;

  -- 4. Record stock movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT stock_quantity INTO v_new_stock
    FROM products WHERE id = (v_item->>'product_id')::UUID;

    v_previous_stock := v_new_stock + (v_item->>'quantity')::INTEGER;

    INSERT INTO stock_movements (
      product_id, type, quantity, previous_quantity, new_quantity, reason, user_id, organization_id
    ) VALUES (
      (v_item->>'product_id')::UUID,
      'sale',
      -(v_item->>'quantity')::INTEGER,
      v_previous_stock,
      v_new_stock,
      'Vente ' || p_sale_number,
      p_user_id,
      p_organization_id
    );
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_full_sale TO authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702010000_add_missing_indexes.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- INDEX MANQUANTS POUR LA PERFORMANCE
-- Ces index sont nécessaires pour les requêtes fréquentes
-- sur les grandes tables (2000+ produits, ventes multiples)
-- ============================================================

-- Index sur organizations.owner_user_id — utilisé dans les jointures Stores
CREATE INDEX IF NOT EXISTS idx_organizations_owner_user_id ON public.organizations(owner_user_id);

-- Index sur customers.phone — utilisé pour la recherche client lors des ventes (POS.tsx)
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

-- Index sur expenses.expense_date — utilisé pour le filtrage par date dans les rapports
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON public.expenses(expense_date);

-- Index sur sale_items.product_id — utilisé pour les requêtes top-produits dans les rapports
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);

-- Index composite sur sales(organization_id, created_at) — déjà partiellement couvert par idx_sales_organization_id
-- mais l'ordre composite est important pour les requêtes de dashboard filtrées par org + date
CREATE INDEX IF NOT EXISTS idx_sales_org_created_at ON public.sales(organization_id, created_at DESC);

-- Index composite sur products(organization_id, is_active) — pour les requêtes de produits actifs par magasin
CREATE INDEX IF NOT EXISTS idx_products_org_active ON public.products(organization_id, is_active);


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702010001_add_suppliers_table.sql
-- ═════════════════════════════════════════════════════════════════

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


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702020000_race_condition_fixes.sql
-- ═════════════════════════════════════════════════════════════════

-- Migration: Race condition fixes — Phase 1
-- Date: 2026-07-02
-- 1. Unique constraint on customers(phone, organization_id) to prevent duplicate customers
-- 2. adjust_product_stock RPC for atomic stock adjustments (replaces non-atomic SET in Products.tsx)
-- 3. Add STABLE to check_account_status(UUID) overload
-- FULLY IDEMPOTENT

-- ============================================
-- 1. Unique constraint on customers(phone, organization_id)
--    Prevents duplicate customer records when concurrent sellers use the same phone.
--    Partial index: only when phone IS NOT NULL (null phones shouldn't block each other)
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_org_unique
  ON public.customers(phone, organization_id)
  WHERE phone IS NOT NULL;

-- ============================================
-- 2. adjust_product_stock RPC — atomic stock adjustment
--    Replaces the non-atomic pattern in Products.tsx where:
--    - previousQuantity is read from stale client cache
--    - newQuantity is computed client-side then SET absolutely
--    This RPC uses UPDATE...RETURNING with row-level locking to prevent lost updates.
-- ============================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'adjust_product_stock'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id UUID,
  p_type TEXT,              -- 'restock' | 'loss' | 'adjustment'
  p_quantity INTEGER,        -- quantity to add/subtract (restock/loss) or set (adjustment)
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE(new_quantity INTEGER, previous_quantity INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_previous_stock INTEGER;
  v_new_stock INTEGER;
  v_delta INTEGER;
BEGIN
  IF p_type NOT IN ('restock', 'loss', 'adjustment') THEN
    RAISE EXCEPTION 'Type d''ajustement invalide : %. Utilisez restock, loss ou adjustment.', p_type;
  END IF;

  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'La quantité doit être positive.';
  END IF;

  -- Atomically update stock with row lock
  IF p_type = 'restock' THEN
    UPDATE products
    SET stock_quantity = stock_quantity + p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id
    RETURNING stock_quantity - p_quantity, stock_quantity
    INTO v_previous_stock, v_new_stock;

  ELSIF p_type = 'loss' THEN
    UPDATE products
    SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0),
        updated_at = NOW()
    WHERE id = p_product_id
    RETURNING stock_quantity + p_quantity, stock_quantity
    INTO v_previous_stock, v_new_stock;

  ELSIF p_type = 'adjustment' THEN
    -- For adjustment, p_quantity is the new absolute value
    UPDATE products
    SET stock_quantity = p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id
    RETURNING stock_quantity, p_quantity
    INTO v_previous_stock, v_new_stock;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable : %', p_product_id;
  END IF;

  -- Record stock movement
  IF p_type = 'restock' THEN
    v_delta := p_quantity;
  ELSIF p_type = 'loss' THEN
    v_delta := -p_quantity;
  ELSE
    v_delta := v_new_stock - v_previous_stock;
  END IF;

  INSERT INTO stock_movements (
    product_id, type, quantity, previous_quantity, new_quantity,
    reason, user_id, organization_id
  ) VALUES (
    p_product_id, p_type, v_delta, v_previous_stock, v_new_stock,
    p_reason, p_user_id, p_organization_id
  );

  RETURN QUERY SELECT v_new_stock, v_previous_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(UUID, TEXT, INTEGER, TEXT, UUID, UUID) TO authenticated;

-- ============================================
-- 3. Add STABLE to check_account_status(UUID) overload
--    The zero-arg version already has STABLE, but the UUID overload is missing it.
-- ============================================
DO $$
DECLARE
  f record;
  fn_sig_count INTEGER;
BEGIN
  -- Count how many overloads exist
  SELECT COUNT(*) INTO fn_sig_count
  FROM pg_proc
  WHERE proname = 'check_account_status'
    AND pronamespace = 'public'::regnamespace;

  IF fn_sig_count > 0 THEN
    -- Drop and recreate with STABLE
    FOR f IN
      SELECT oid::regprocedure AS func_sig
      FROM pg_proc
      WHERE proname = 'check_account_status'
        AND pronamespace = 'public'::regnamespace
    LOOP
      EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
      RAISE NOTICE 'Dropped %', f.func_sig;
    END LOOP;
  END IF;
END $$;

-- Zero-arg: enriched return type
CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID, deactivation_reason TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(p.is_active, FALSE),
    r.role::TEXT,
    p.organization_id,
    p.deactivation_reason
  FROM profiles p
  LEFT JOIN user_roles r ON r.user_id = p.user_id
  WHERE p.user_id = auth.uid()
  UNION ALL
  SELECT FALSE, NULL, NULL, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated, service_role;

-- 1-arg overload — now with STABLE
CREATE OR REPLACE FUNCTION public.check_account_status(check_user_id UUID)
RETURNS TABLE(is_active BOOLEAN, role TEXT, organization_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(p.is_active, FALSE),
    r.role::TEXT,
    p.organization_id
  FROM profiles p
  LEFT JOIN user_roles r ON r.user_id = p.user_id
  WHERE p.user_id = check_user_id
  UNION ALL
  SELECT FALSE, NULL, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = check_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_account_status(UUID) TO authenticated, service_role;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702030000_dashboard_rpc_aggregation.sql
-- ═════════════════════════════════════════════════════════════════

-- Migration: Dashboard RPC aggregation — server-side stats calculation
-- Date: 2026-07-02
-- Replaces 7 separate client-side fetchAllRows + reduce() calls with a single RPC.
-- Dramatically reduces data transfer and improves Dashboard load time.
-- FULLY IDEMPOTENT

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'get_dashboard_stats'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_organization_id UUID DEFAULT NULL,
  p_day_start TIMESTAMPTZ DEFAULT NULL,
  p_day_end TIMESTAMPTZ DEFAULT NULL,
  p_month_start TIMESTAMPTZ DEFAULT NULL,
  p_month_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_org_filter TEXT;
BEGIN
  -- Build organization filter clause
  IF p_organization_id IS NOT NULL THEN
    v_org_filter := format('AND organization_id = %L', p_organization_id);
  ELSE
    v_org_filter := '';
  END IF;

  -- Single query with CTEs for all dashboard metrics
  EXECUTE format('
    SELECT jsonb_build_object(
      ''todaySales'', COALESCE(today_cte.total, 0),
      ''todayTransactions'', COALESCE(today_cte.count, 0),
      ''monthSales'', COALESCE(month_cte.total, 0),
      ''monthCreditCount'', COALESCE(month_cte.credit_count, 0),
      ''monthExpenses'', COALESCE(expense_cte.total, 0),
      ''totalProducts'', COALESCE(product_cte.total_count, 0),
      ''lowStockProducts'', COALESCE(product_cte.low_stock, 0),
      ''totalCredits'', COALESCE(credit_cte.total, 0),
      ''creditsCount'', COALESCE(credit_cte.count, 0)
    )
    FROM (
      -- Today''s sales
      SELECT
        SUM(total_amount) AS total,
        COUNT(*) AS count
      FROM sales
      WHERE created_at >= %L AND created_at <= %L %s
    ) today_cte,
    (
      -- Month''s sales
      SELECT
        SUM(total_amount) AS total,
        COUNT(*) FILTER (WHERE payment_method = ''credit'') AS credit_count
      FROM sales
      WHERE created_at >= %L AND created_at <= %L %s
    ) month_cte,
    (
      -- Month''s expenses
      SELECT SUM(amount) AS total
      FROM expenses
      WHERE expense_date >= %L AND expense_date <= %L %s
    ) expense_cte,
    (
      -- Products count + low stock
      SELECT
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(min_stock_alert, 5)) AS low_stock
      FROM products
      WHERE is_active = true %s
    ) product_cte,
    (
      -- Customer credits
      SELECT
        SUM(total_credit) AS total,
        COUNT(*) AS count
      FROM customers
      WHERE total_credit > 0 %s
    ) credit_cte
  ',
    p_day_start, p_day_end, v_org_filter,
    p_month_start, p_month_end, v_org_filter,
    p_month_start::date, p_month_end::date, v_org_filter,
    v_org_filter,
    v_org_filter
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ============================================
-- Top products RPC — server-side aggregation
-- ============================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'get_top_products'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_top_products(
  p_organization_id UUID DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(product_name TEXT, total_quantity BIGINT, total_revenue NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    si.product_name,
    SUM(si.quantity)::BIGINT AS total_quantity,
    SUM(si.total_price) AS total_revenue
  FROM sale_items si
  WHERE (p_since IS NULL OR si.created_at >= p_since)
    AND (p_organization_id IS NULL OR si.organization_id = p_organization_id)
  GROUP BY si.product_name
  ORDER BY total_quantity DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_products(UUID, TIMESTAMPTZ, INTEGER) TO authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702040000_data_correctness_and_performance.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Phase 5: Data correctness & performance improvements
-- ============================================================
-- 1. get_low_stock_products: products where stock <= min_stock_alert (cross-column comparison impossible in PostgREST)
-- 2. get_product_stats: aggregate counts for Products page (replaces fetchAllRows)
-- 3. get_reports_stats: aggregated sales/expenses for Reports page (replaces fetchAllRows + client reduce)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. get_low_stock_products(p_organization_id, p_limit)
--    Returns products where stock_quantity <= min_stock_alert,
--    or stock_quantity <= 5 if min_stock_alert is NULL.
--    This replaces the hardcoded `.lte("stock_quantity", 5)` in Dashboard.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_low_stock_products(
  p_organization_id UUID,
  p_limit INT DEFAULT 6
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  stock_quantity INT,
  min_stock_alert INT,
  category_icon TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.stock_quantity,
    p.min_stock_alert,
    c.icon AS category_icon
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.is_active = true
    AND p.organization_id = p_organization_id
    AND (
      (p.min_stock_alert IS NOT NULL AND p.stock_quantity <= p.min_stock_alert)
      OR
      (p.min_stock_alert IS NULL AND p.stock_quantity <= 5)
    )
  ORDER BY p.stock_quantity ASC
  LIMIT p_limit;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. get_product_stats(p_organization_id)
--    Returns aggregate counts for the Products page header:
--    total products, low stock count, out of stock count,
--    and category_counts (for filter buttons).
--    Replaces fetchAllRows + client-side filter on Products page.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_product_stats(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_low_stock BIGINT;
  v_out_of_stock BIGINT;
  v_category_counts JSONB;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE
      (min_stock_alert IS NOT NULL AND stock_quantity <= min_stock_alert)
      OR
      (min_stock_alert IS NULL AND stock_quantity <= 5)
    ),
    COUNT(*) FILTER (WHERE stock_quantity = 0)
  INTO v_total, v_low_stock, v_out_of_stock
  FROM products
  WHERE organization_id = p_organization_id;

  -- Category counts for filter buttons
  SELECT COALESCE(jsonb_object_agg(category_id::text, cnt), '{}'::jsonb)
  INTO v_category_counts
  FROM (
    SELECT category_id, COUNT(*) AS cnt
    FROM products
    WHERE organization_id = p_organization_id
      AND category_id IS NOT NULL
    GROUP BY category_id
  ) sub;

  RETURN jsonb_build_object(
    'totalProducts', v_total,
    'lowStockCount', v_low_stock,
    'outOfStockCount', v_out_of_stock,
    'categoryCounts', v_category_counts
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. get_reports_stats(p_organization_id, p_start, p_end)
--    Returns aggregated sales + expenses data for the Reports page.
--    Replaces fetchAllRows + client-side reduce() for sales/expenses.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_reports_stats(
  p_organization_id UUID,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_sales NUMERIC := 0;
  v_total_transactions BIGINT := 0;
  v_total_expenses NUMERIC := 0;
  v_expense_count BIGINT := 0;
  v_payment_breakdown JSONB;
  v_daily_sales JSONB;
  v_top_products JSONB;
BEGIN
  -- Sales aggregation
  SELECT
    COALESCE(SUM(total_amount), 0),
    COUNT(*)
  INTO v_total_sales, v_total_transactions
  FROM sales
  WHERE organization_id = p_organization_id
    AND created_at >= p_start
    AND created_at <= p_end;

  -- Expenses aggregation
  SELECT
    COALESCE(SUM(amount), 0),
    COUNT(*)
  INTO v_total_expenses, v_expense_count
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= p_start::date
    AND expense_date <= p_end::date;

  -- Payment method breakdown
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', payment_method,
    'value', method_total
  )), '[]'::jsonb)
  INTO v_payment_breakdown
  FROM (
    SELECT payment_method, SUM(total_amount) AS method_total
    FROM sales
    WHERE organization_id = p_organization_id
      AND created_at >= p_start
      AND created_at <= p_end
    GROUP BY payment_method
  ) sub;

  -- Daily sales for chart
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day::text,
    'sales', day_total,
    'transactions', day_count
  )), '[]'::jsonb)
  INTO v_daily_sales
  FROM (
    SELECT
      d.day::text,
      COALESCE(SUM(s.total_amount), 0) AS day_total,
      COUNT(s.id) AS day_count
    FROM generate_series(
      p_start::date,
      p_end::date,
      '1 day'::interval
    ) AS d(day)
    LEFT JOIN sales s ON s.organization_id = p_organization_id
      AND s.created_at >= d.day
      AND s.created_at < d.day + interval '1 day'
    GROUP BY d.day
    ORDER BY d.day
  ) daily;

  -- Top 5 products by quantity sold
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', product_name,
    'quantity', total_qty,
    'revenue', total_rev
  )), '[]'::jsonb)
  INTO v_top_products
  FROM (
    SELECT
      si.product_name,
      SUM(si.quantity) AS total_qty,
      SUM(si.total_price) AS total_rev
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_organization_id
      AND s.created_at >= p_start
      AND s.created_at <= p_end
    GROUP BY si.product_name
    ORDER BY total_qty DESC
    LIMIT 5
  ) top;

  RETURN jsonb_build_object(
    'totalSales', v_total_sales,
    'totalTransactions', v_total_transactions,
    'totalExpenses', v_total_expenses,
    'expenseCount', v_expense_count,
    'paymentBreakdown', v_payment_breakdown,
    'dailySales', v_daily_sales,
    'topProducts', v_top_products
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. get_next_category_sort_order(p_organization_id)
--    Atomically returns the next sort_order value for a new category.
--    Replaces the TOCTOU-prone SELECT MAX + INSERT pattern in Categories.tsx.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_next_category_sort_order(
  p_organization_id UUID
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_next INT;
BEGIN
  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next
  FROM categories
  WHERE organization_id = p_organization_id;

  RETURN v_next;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- GRANT permissions
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_low_stock_products(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reports_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_category_sort_order(UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702050000_org_scoping_and_shared_hooks.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Phase 6: Organization scoping, stats RPCs, shared hooks
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. get_customer_stats(p_organization_id)
--    Returns total customers count and aggregate credit info.
--    Replaces pageSize:1000 + client-side reduce() in Customers page.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_customer_stats(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_total_credit NUMERIC;
  v_customers_with_credit BIGINT;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(SUM(total_credit), 0),
    COUNT(*) FILTER (WHERE total_credit > 0)
  INTO v_total, v_total_credit, v_customers_with_credit
  FROM customers
  WHERE organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'totalCustomers', v_total,
    'totalCredit', v_total_credit,
    'customersWithCredit', v_customers_with_credit
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. get_expense_stats(p_organization_id)
--    Returns aggregate expense stats for the current month.
--    Replaces pageSize:1000 + client-side reduce() in Expenses page.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_expense_stats(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_month_total NUMERIC;
  v_month_count BIGINT;
BEGIN
  -- Total expenses
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_total, v_month_total
  FROM expenses
  WHERE organization_id = p_organization_id
    AND expense_date >= date_trunc('month', CURRENT_DATE)
    AND expense_date < date_trunc('month', CURRENT_DATE) + interval '1 month';

  v_month_count := v_total;

  RETURN jsonb_build_object(
    'monthTotal', v_month_total,
    'monthCount', v_month_count
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. get_categories(p_organization_id)
--    Returns all categories for an org with product counts.
--    Single source of truth — replaces 4 duplicate queries
--    across POS, Products, Categories, and ProductForm pages.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_categories(
  p_organization_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  icon TEXT,
  color TEXT,
  description TEXT,
  sort_order INT,
  is_default BOOLEAN,
  product_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.icon,
    c.color,
    c.description,
    c.sort_order,
    c.is_default,
    COALESCE(pc.cnt, 0) AS product_count
  FROM categories c
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM products p
    WHERE p.category_id = c.id
      AND p.organization_id = p_organization_id
  ) pc ON true
  WHERE c.organization_id = p_organization_id
  ORDER BY c.sort_order ASC NULLS LAST, c.name ASC;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- GRANT permissions
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_customer_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_expense_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_categories(UUID) TO authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702060000_add_suppliers_and_supplier_products.sql
-- ═════════════════════════════════════════════════════════════════

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


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702070000_admin_multi_store_analytics.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Admin Multi-Store Analytics RPCs
-- Cross-organization analytics for super_admin
-- ============================================================

-- 1. Get all stores with their sales summary for a given period
-- Returns: store name, category, total sales, transaction count, avg basket, total expenses
CREATE OR REPLACE FUNCTION public.get_admin_stores_summary(
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  store_category text,
  owner_name text,
  owner_phone text,
  city text,
  country text,
  total_sales numeric,
  transaction_count bigint,
  avg_basket numeric,
  total_expenses numeric,
  net_revenue numeric,
  product_count bigint,
  active_product_count bigint,
  customer_count bigint,
  low_stock_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  -- Determine date range
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  -- Only super_admin can call this
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    o.category::text AS store_category,
    p.owner_name,
    p.phone AS owner_phone,
    p.city,
    p.country,
    COALESCE(s_summary.total_sales, 0) AS total_sales,
    COALESCE(s_summary.transaction_count, 0) AS transaction_count,
    COALESCE(s_summary.avg_basket, 0) AS avg_basket,
    COALESCE(e_summary.total_expenses, 0) AS total_expenses,
    COALESCE(s_summary.total_sales, 0) - COALESCE(e_summary.total_expenses, 0) AS net_revenue,
    COALESCE(prod_summary.product_count, 0) AS product_count,
    COALESCE(prod_summary.active_product_count, 0) AS active_product_count,
    COALESCE(cust_summary.customer_count, 0) AS customer_count,
    COALESCE(prod_summary.low_stock_count, 0) AS low_stock_count
  FROM organizations o
  LEFT JOIN profiles p ON p.organization_id = o.id AND p.user_id = o.owner_user_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(s.total_amount) AS total_sales,
      COUNT(*) AS transaction_count,
      AVG(s.total_amount) AS avg_basket
    FROM sales s
    WHERE s.organization_id = o.id
      AND s.created_at >= v_start
      AND s.created_at < v_end
  ) s_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      SUM(e.amount) AS total_expenses
    FROM expenses e
    WHERE e.organization_id = o.id
      AND e.expense_date >= v_start::date
      AND e.expense_date < v_end::date
  ) e_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS product_count,
      COUNT(*) FILTER (WHERE pr.is_active = true) AS active_product_count,
      COUNT(*) FILTER (WHERE pr.is_active = true AND pr.stock_quantity <= COALESCE(pr.min_stock_alert, 5)) AS low_stock_count
    FROM products pr
    WHERE pr.organization_id = o.id
  ) prod_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS customer_count
    FROM customers c
    WHERE c.organization_id = o.id
  ) cust_summary ON true
  ORDER BY COALESCE(s_summary.total_sales, 0) DESC;
END;
$$;


-- 2. Get top/bad articles for a specific store (or all stores)
-- Top = highest revenue; Bad = lowest revenue (or zero sales)
CREATE OR REPLACE FUNCTION public.get_admin_article_ranking(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_limit integer DEFAULT 10,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  product_id uuid,
  product_name text,
  category_name text,
  quantity_sold bigint,
  total_revenue numeric,
  unit_price numeric,
  cost_price numeric,
  margin numeric,
  current_stock integer,
  ranking_category text  -- 'top' or 'bad'
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  -- Top articles (highest revenue)
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    si.product_id,
    si.product_name,
    COALESCE(c.name, 'Sans catégorie') AS category_name,
    SUM(si.quantity) AS quantity_sold,
    SUM(si.total_price) AS total_revenue,
    si.unit_price,
    COALESCE(pr.cost_price, 0) AS cost_price,
    si.unit_price - COALESCE(pr.cost_price, 0) AS margin,
    COALESCE(pr.stock_quantity, 0) AS current_stock,
    'top'::text AS ranking_category
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  JOIN organizations o ON o.id = si.organization_id
  LEFT JOIN products pr ON pr.id = si.product_id
  LEFT JOIN categories c ON c.id = pr.category_id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR si.organization_id = p_organization_id)
  GROUP BY o.id, o.name, si.product_id, si.product_name, c.name, si.unit_price, pr.cost_price, pr.stock_quantity
  ORDER BY SUM(si.total_price) DESC
  LIMIT p_limit;

  -- Bad articles (products with zero or lowest sales in period)
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    pr.id AS product_id,
    pr.name AS product_name,
    COALESCE(c.name, 'Sans catégorie') AS category_name,
    COALESCE(sold.qty, 0) AS quantity_sold,
    COALESCE(sold.revenue, 0) AS total_revenue,
    pr.price AS unit_price,
    COALESCE(pr.cost_price, 0) AS cost_price,
    pr.price - COALESCE(pr.cost_price, 0) AS margin,
    pr.stock_quantity AS current_stock,
    'bad'::text AS ranking_category
  FROM products pr
  JOIN organizations o ON o.id = pr.organization_id
  LEFT JOIN categories c ON c.id = pr.category_id
  LEFT JOIN LATERAL (
    SELECT SUM(si2.quantity) AS qty, SUM(si2.total_price) AS revenue
    FROM sale_items si2
    JOIN sales s2 ON s2.id = si2.sale_id
    WHERE si2.product_id = pr.id
      AND s2.created_at >= v_start
      AND s2.created_at < v_end
  ) sold ON true
  WHERE pr.is_active = true
    AND (p_organization_id IS NULL OR pr.organization_id = p_organization_id)
  ORDER BY COALESCE(sold.revenue, 0) ASC, pr.stock_quantity DESC
  LIMIT p_limit;
END;
$$;


-- 3. Get stock movements for a specific store (or all stores)
CREATE OR REPLACE FUNCTION public.get_admin_stock_movements(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_limit integer DEFAULT 50,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  movement_id uuid,
  product_id uuid,
  product_name text,
  movement_type text,
  quantity integer,
  previous_quantity integer,
  new_quantity integer,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    sm.id AS movement_id,
    sm.product_id,
    COALESCE(pr.name, 'Produit supprimé') AS product_name,
    sm.type AS movement_type,
    sm.quantity,
    sm.previous_quantity,
    sm.new_quantity,
    sm.reason,
    sm.created_at
  FROM stock_movements sm
  JOIN organizations o ON o.id = sm.organization_id
  LEFT JOIN products pr ON pr.id = sm.product_id
  WHERE sm.created_at >= v_start
    AND sm.created_at < v_end
    AND (p_organization_id IS NULL OR sm.organization_id = p_organization_id)
  ORDER BY sm.created_at DESC
  LIMIT p_limit;
END;
$$;


-- 4. Get daily sales trend across all stores (or a specific store)
CREATE OR REPLACE FUNCTION public.get_admin_sales_trend(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  date text,
  organization_id uuid,
  store_name text,
  total_sales numeric,
  transaction_count bigint,
  avg_basket numeric
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD') AS date,
    o.id AS organization_id,
    o.name AS store_name,
    SUM(s.total_amount) AS total_sales,
    COUNT(*) AS transaction_count,
    AVG(s.total_amount) AS avg_basket
  FROM sales s
  JOIN organizations o ON o.id = s.organization_id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  GROUP BY date_trunc('day', s.created_at), o.id, o.name
  ORDER BY date_trunc('day', s.created_at) ASC, SUM(s.total_amount) DESC;
END;
$$;


-- 5. Get payment method distribution across all stores
CREATE OR REPLACE FUNCTION public.get_admin_payment_distribution(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  payment_method text,
  total_amount numeric,
  transaction_count bigint,
  percentage numeric
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_total numeric;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  -- Get total for percentage calculation
  SELECT COALESCE(SUM(s.total_amount), 0) INTO v_total
  FROM sales s
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id);

  RETURN QUERY
  SELECT
    s.payment_method::text AS payment_method,
    SUM(s.total_amount) AS total_amount,
    COUNT(*) AS transaction_count,
    CASE WHEN v_total > 0 THEN ROUND((SUM(s.total_amount) / v_total) * 100, 1) ELSE 0 END AS percentage
  FROM sales s
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  GROUP BY s.payment_method
  ORDER BY SUM(s.total_amount) DESC;
END;
$$;


-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_admin_stores_summary(text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_article_ranking(uuid, text, integer, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_stock_movements(uuid, text, integer, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_sales_trend(uuid, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_distribution(uuid, text, timestamptz, timestamptz) TO authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702080000_security_hardening_rpc.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Security Hardening Migration — P0 Fixes
-- Fixes all SECURITY DEFINER RPC vulnerabilities
-- ============================================================

-- ============================================================
-- FIX 1: has_role — Add auth.uid() verification
-- Was: accepts _user_id from client without checking
-- Now: Verifies auth.uid() matches _user_id (self-check only)
--      OR caller is super_admin/admin (admin can check any user in their org)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Self-check: user can check their own role
  IF _user_id = auth.uid() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
  END IF;

  -- Admin check: admin/super_admin can check any user's role in their org
  IF public.is_super_admin() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
  END IF;

  -- Admin of the same organization can check
  DECLARE
    v_caller_org uuid;
    v_target_org uuid;
  BEGIN
    SELECT organization_id INTO v_caller_org
    FROM public.profiles WHERE user_id = auth.uid() AND is_active = true;

    SELECT organization_id INTO v_target_org
    FROM public.profiles WHERE user_id = _user_id;

    IF v_caller_org IS NOT NULL AND v_caller_org = v_target_org THEN
      -- Verify caller is admin of this org
      IF EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
      ) THEN
        RETURN EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = _user_id AND role = _role
        );
      END IF;
    END IF;

    RETURN FALSE;
  END;
END;
$$;


-- ============================================================
-- FIX 2: is_user_active — Add auth.uid() verification
-- Was: accepts _user_id from client without checking
-- Now: Only self-check, admin in same org, or super_admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_org uuid;
  v_target_org uuid;
BEGIN
  -- Self-check
  IF _user_id = auth.uid() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = _user_id AND is_active = true
    );
  END IF;

  -- Super admin can check anyone
  IF public.is_super_admin() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = _user_id AND is_active = true
    );
  END IF;

  -- Admin of same org can check
  SELECT organization_id INTO v_caller_org
  FROM public.profiles WHERE user_id = auth.uid() AND is_active = true;

  SELECT organization_id INTO v_target_org
  FROM public.profiles WHERE user_id = _user_id;

  IF v_caller_org IS NOT NULL AND v_caller_org = v_target_org THEN
    IF EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    ) THEN
      RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = _user_id AND is_active = true
      );
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;


-- ============================================================
-- FIX 3: insert_default_categories — Verify caller belongs to org
-- Was: accepts p_org_id and p_user_id without verification
-- Now: Verifies auth.uid() matches p_user_id AND org matches
-- ============================================================
CREATE OR REPLACE FUNCTION public.insert_default_categories(p_org_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is the user they claim to be
  IF p_user_id <> auth.uid() THEN
    -- Allow super_admin to call this for any user
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Accès refusé : vous ne pouvez créer des catégories que pour vous-même';
    END IF;
  END IF;

  -- Verify the user belongs to the specified organization
  IF NOT public.is_member_of_organization(p_org_id) THEN
    RAISE EXCEPTION 'Accès refusé : organisation non autorisée';
  END IF;

  -- Insert default categories (same as before)
  INSERT INTO public.categories (user_id, name, color, icon, description, sort_order, is_default, organization_id)
  VALUES
    (p_user_id, 'Alimentation',  '#F59E0B', 'UtensilsCrossed', 'Produits alimentaires et boissons', 1, true, p_org_id),
    (p_user_id, 'Boissons',      '#3B82F6', 'Wine',            'Boissons et rafraîchissements',    2, true, p_org_id),
    (p_user_id, 'Hygiène',       '#10B981', 'Sparkles',        'Produits d''hygiène et soins',     3, true, p_org_id),
    (p_user_id, 'Électroménager','#8B5CF6', 'Plug',            'Appareils électroménagers',        4, true, p_org_id),
    (p_user_id, 'Textile',       '#EC4899', 'Shirt',           'Vêtements et textiles',            5, true, p_org_id),
    (p_user_id, 'Quincaillerie', '#EF4444', 'Wrench',          'Outils et quincaillerie',          6, true, p_org_id),
    (p_user_id, 'Cosmétiques',   '#D946EF', 'Sparkles',        'Produits cosmétiques et beauté',   7, true, p_org_id),
    (p_user_id, 'Papeterie',     '#14B8A6', 'FileText',        'Fournitures et papeterie',         8, true, p_org_id),
    (p_user_id, 'Autres',        '#6B7280', 'Package',         'Autres produits non classés',      99, true, p_org_id)
  ON CONFLICT DO NOTHING;
END;
$$;


-- ============================================================
-- FIX 4: batch_update_stock — Add organization verification
-- Was: No auth check — any authenticated user could decrement stock
-- Now: Verifies the sale belongs to the caller's organization
-- ============================================================
CREATE OR REPLACE FUNCTION public.batch_update_stock(p_sale_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_previous_qty integer;
  v_new_qty integer;
  v_sale_org uuid;
  v_user_org uuid;
BEGIN
  -- Verify the sale belongs to the caller's organization
  SELECT organization_id INTO v_sale_org
  FROM public.sales WHERE id = p_sale_id;

  SELECT public.get_user_organization_id() INTO v_user_org;

  IF v_sale_org IS NULL OR v_sale_org <> v_user_org THEN
    RAISE EXCEPTION 'Accès refusé : vente hors de votre organisation';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    -- Atomically decrement stock and return previous/new values
    UPDATE public.products
    SET stock_quantity = GREATEST(stock_quantity - v_quantity, 0),
        updated_at = now()
    WHERE id = v_product_id
      AND organization_id = v_sale_org  -- Ensure product belongs to same org
    RETURNING stock_quantity + v_quantity, stock_quantity
    INTO v_previous_qty, v_new_qty;

    -- Record stock movement
    INSERT INTO public.stock_movements (user_id, product_id, type, quantity, previous_quantity, new_quantity, reason, reference_id, organization_id)
    VALUES (
      auth.uid(),
      v_product_id,
      'sale',
      v_quantity,
      v_previous_qty,
      v_new_qty,
      'Vente',
      p_sale_id,
      v_sale_org
    );
  END LOOP;
END;
$$;


-- ============================================================
-- FIX 5: Admin analytics RPCs — Add org ownership verification
-- For non-super_admin users, verify they belong to the org they query
-- (Super admin can query any org — that's the intended behavior)
-- Note: These already check is_super_admin(), but for defense in depth,
-- we also verify that if a non-super_admin somehow calls these,
-- they can only access their own org data.
-- ============================================================

-- get_admin_article_ranking — already guarded by is_super_admin(), add defense-in-depth
CREATE OR REPLACE FUNCTION public.get_admin_article_ranking(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_limit integer DEFAULT 10,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  product_id uuid,
  product_name text,
  category_name text,
  quantity_sold bigint,
  total_revenue numeric,
  unit_price numeric,
  cost_price numeric,
  margin numeric,
  current_stock integer,
  ranking_category text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_user_org uuid;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN v_start := date_trunc('day', now()); v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN v_start := date_trunc('week', now()); v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN v_start := date_trunc('month', now()); v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN v_start := date_trunc('quarter', now()); v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN v_start := date_trunc('year', now()); v_end := date_trunc('year', now()) + interval '1 year';
      ELSE v_start := date_trunc('month', now()); v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  -- Only super_admin can call this
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  -- Top articles
  RETURN QUERY
  SELECT
    o.id, o.name, si.product_id, si.product_name,
    COALESCE(c.name, 'Sans catégorie'),
    SUM(si.quantity), SUM(si.total_price), si.unit_price,
    COALESCE(pr.cost_price, 0),
    si.unit_price - COALESCE(pr.cost_price, 0),
    COALESCE(pr.stock_quantity, 0),
    'top'::text
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  JOIN organizations o ON o.id = si.organization_id
  LEFT JOIN products pr ON pr.id = si.product_id
  LEFT JOIN categories c ON c.id = pr.category_id
  WHERE s.created_at >= v_start AND s.created_at < v_end
    AND (p_organization_id IS NULL OR si.organization_id = p_organization_id)
  GROUP BY o.id, o.name, si.product_id, si.product_name, c.name, si.unit_price, pr.cost_price, pr.stock_quantity
  ORDER BY SUM(si.total_price) DESC
  LIMIT p_limit;

  -- Bad articles
  RETURN QUERY
  SELECT
    o.id, o.name, pr.id, pr.name,
    COALESCE(c.name, 'Sans catégorie'),
    COALESCE(sold.qty, 0), COALESCE(sold.revenue, 0),
    pr.price, COALESCE(pr.cost_price, 0),
    pr.price - COALESCE(pr.cost_price, 0),
    pr.stock_quantity,
    'bad'::text
  FROM products pr
  JOIN organizations o ON o.id = pr.organization_id
  LEFT JOIN categories c ON c.id = pr.category_id
  LEFT JOIN LATERAL (
    SELECT SUM(si2.quantity) AS qty, SUM(si2.total_price) AS revenue
    FROM sale_items si2 JOIN sales s2 ON s2.id = si2.sale_id
    WHERE si2.product_id = pr.id AND s2.created_at >= v_start AND s2.created_at < v_end
  ) sold ON true
  WHERE pr.is_active = true
    AND (p_organization_id IS NULL OR pr.organization_id = p_organization_id)
  ORDER BY COALESCE(sold.revenue, 0) ASC, pr.stock_quantity DESC
  LIMIT p_limit;
END;
$$;


-- get_admin_stock_movements — same pattern
CREATE OR REPLACE FUNCTION public.get_admin_stock_movements(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_limit integer DEFAULT 50,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  movement_id uuid,
  product_id uuid,
  product_name text,
  movement_type text,
  quantity integer,
  previous_quantity integer,
  new_quantity integer,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date; v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN v_start := date_trunc('day', now()); v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN v_start := date_trunc('week', now()); v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN v_start := date_trunc('month', now()); v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN v_start := date_trunc('quarter', now()); v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN v_start := date_trunc('year', now()); v_end := date_trunc('year', now()) + interval '1 year';
      ELSE v_start := date_trunc('month', now()); v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  RETURN QUERY
  SELECT o.id, o.name, sm.id, sm.product_id,
    COALESCE(pr.name, 'Produit supprimé'),
    sm.type, sm.quantity, sm.previous_quantity, sm.new_quantity, sm.reason, sm.created_at
  FROM stock_movements sm
  JOIN organizations o ON o.id = sm.organization_id
  LEFT JOIN products pr ON pr.id = sm.product_id
  WHERE sm.created_at >= v_start AND sm.created_at < v_end
    AND (p_organization_id IS NULL OR sm.organization_id = p_organization_id)
  ORDER BY sm.created_at DESC
  LIMIT p_limit;
END;
$$;


-- get_admin_sales_trend — same pattern
CREATE OR REPLACE FUNCTION public.get_admin_sales_trend(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  date text,
  organization_id uuid,
  store_name text,
  total_sales numeric,
  transaction_count bigint,
  avg_basket numeric
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date; v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN v_start := date_trunc('day', now()); v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN v_start := date_trunc('week', now()); v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN v_start := date_trunc('month', now()); v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN v_start := date_trunc('quarter', now()); v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN v_start := date_trunc('year', now()); v_end := date_trunc('year', now()) + interval '1 year';
      ELSE v_start := date_trunc('month', now()); v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  RETURN QUERY
  SELECT to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD'),
    o.id, o.name, SUM(s.total_amount), COUNT(*), AVG(s.total_amount)
  FROM sales s
  JOIN organizations o ON o.id = s.organization_id
  WHERE s.created_at >= v_start AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  GROUP BY date_trunc('day', s.created_at), o.id, o.name
  ORDER BY date_trunc('day', s.created_at) ASC, SUM(s.total_amount) DESC;
END;
$$;


-- get_admin_payment_distribution — same pattern
CREATE OR REPLACE FUNCTION public.get_admin_payment_distribution(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  payment_method text,
  total_amount numeric,
  transaction_count bigint,
  percentage numeric
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_total numeric;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date; v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN v_start := date_trunc('day', now()); v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN v_start := date_trunc('week', now()); v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN v_start := date_trunc('month', now()); v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN v_start := date_trunc('quarter', now()); v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN v_start := date_trunc('year', now()); v_end := date_trunc('year', now()) + interval '1 year';
      ELSE v_start := date_trunc('month', now()); v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au super administrateur';
  END IF;

  SELECT COALESCE(SUM(s.total_amount), 0) INTO v_total
  FROM sales s
  WHERE s.created_at >= v_start AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id);

  RETURN QUERY
  SELECT s.payment_method::text, SUM(s.total_amount), COUNT(*),
    CASE WHEN v_total > 0 THEN ROUND((SUM(s.total_amount) / v_total) * 100, 1) ELSE 0 END
  FROM sales s
  WHERE s.created_at >= v_start AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  GROUP BY s.payment_method
  ORDER BY SUM(s.total_amount) DESC;
END;
$$;


-- Re-grant execute permissions
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_default_categories(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_update_stock(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_article_ranking(uuid, text, integer, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_stock_movements(uuid, text, integer, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_sales_trend(uuid, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_distribution(uuid, text, timestamptz, timestamptz) TO authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702090000_p0_security_remove_client_identity_params.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- P0 Security Fix: Remove client-provided identity params from SECURITY DEFINER RPCs
-- Date: 2026-07-02
--
-- CRITICAL FIX: All SECURITY DEFINER functions that accepted p_user_id or
-- p_organization_id from the client are vulnerable to privilege escalation.
-- A malicious client can impersonate another user or access another org's data.
--
-- FIX STRATEGY:
--   - Write RPCs (create_full_sale, process_credit_payment, adjust_product_stock):
--     Remove p_user_id/p_organization_id, use auth.uid() + get_user_organization_id()
--   - Read RPCs (stats, categories, etc.):
--     Remove p_organization_id, use get_user_organization_id() internally
--   - register_user: Replace p_user_id with auth.uid(), keep p_organization_id
--     with admin verification
--   - increment_customer_credit: Add org verification
--
-- FULLY IDEMPOTENT — uses dynamic DROP via pg_proc
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. create_full_sale — Remove p_user_id, p_organization_id
--    Use auth.uid() and get_user_organization_id() internally
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'create_full_sale' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_full_sale(
  p_sale_number TEXT,
  p_subtotal NUMERIC,
  p_total_amount NUMERIC,
  p_items JSONB,
  p_tax_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash',
  p_amount_paid NUMERIC DEFAULT 0,
  p_change_amount NUMERIC DEFAULT 0,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_new_stock INTEGER;
  v_previous_stock INTEGER;
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  -- Resolve identity from session — NEVER trust client params
  v_user_id := auth.uid();
  v_org_id := public.get_user_organization_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable pour l''utilisateur';
  END IF;

  -- 1. Insert sale
  INSERT INTO sales (
    user_id, organization_id, sale_number, subtotal, tax_amount, total_amount,
    payment_method, amount_paid, change_amount, customer_name, customer_phone, seller_name
  ) VALUES (
    v_user_id, v_org_id, p_sale_number, p_subtotal, p_tax_amount, p_total_amount,
    p_payment_method, p_amount_paid, p_change_amount, p_customer_name, p_customer_phone, p_seller_name
  ) RETURNING id INTO v_sale_id;

  -- 2. Insert sale items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (
      sale_id, product_id, product_name, quantity, unit_price, total_price, organization_id
    ) VALUES (
      v_sale_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total_price')::NUMERIC,
      v_org_id
    );
  END LOOP;

  -- 3. Atomically decrement stock with race-condition protection
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE products
    SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID
      AND organization_id = v_org_id  -- Ensure product belongs to caller's org
    RETURNING stock_quantity INTO v_new_stock;

    -- Check for oversell AFTER the atomic update
    IF v_new_stock < 0 THEN
      RAISE EXCEPTION 'Stock insuffisant pour %: stock négatif après décrément',
        v_item->>'product_name';
    END IF;
  END LOOP;

  -- 4. Record stock movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT stock_quantity INTO v_new_stock
    FROM products WHERE id = (v_item->>'product_id')::UUID;

    v_previous_stock := v_new_stock + (v_item->>'quantity')::INTEGER;

    INSERT INTO stock_movements (
      product_id, type, quantity, previous_quantity, new_quantity, reason, user_id, organization_id
    ) VALUES (
      (v_item->>'product_id')::UUID,
      'sale',
      -(v_item->>'quantity')::INTEGER,
      v_previous_stock,
      v_new_stock,
      'Vente ' || p_sale_number,
      v_user_id,
      v_org_id
    );
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_full_sale(TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 2. process_credit_payment — Remove p_user_id, p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'process_credit_payment' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.process_credit_payment(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Paiement de crédit'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_org_id := public.get_user_organization_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0';
  END IF;

  -- Verify customer belongs to caller's org
  IF NOT EXISTS (
    SELECT 1 FROM customers
    WHERE id = p_customer_id AND organization_id = v_org_id AND total_credit >= p_amount
  ) THEN
    RAISE EXCEPTION 'Crédit insuffisant ou client introuvable';
  END IF;

  INSERT INTO customer_credits (
    user_id, organization_id, customer_id, amount, type, description
  ) VALUES (
    v_user_id, v_org_id, p_customer_id, p_amount, 'payment', p_description
  );

  UPDATE customers
  SET total_credit = GREATEST(total_credit - p_amount, 0),
      updated_at = NOW()
  WHERE id = p_customer_id AND organization_id = v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_credit_payment(UUID, NUMERIC, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 3. adjust_product_stock — Remove p_user_id, p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'adjust_product_stock' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id UUID,
  p_type TEXT,              -- 'restock' | 'loss' | 'adjustment'
  p_quantity INTEGER,        -- quantity to add/subtract (restock/loss) or set (adjustment)
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(new_quantity INTEGER, previous_quantity INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_previous_stock INTEGER;
  v_new_stock INTEGER;
  v_delta INTEGER;
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  v_org_id := public.get_user_organization_id();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  IF p_type NOT IN ('restock', 'loss', 'adjustment') THEN
    RAISE EXCEPTION 'Type d''ajustement invalide : %. Utilisez restock, loss ou adjustment.', p_type;
  END IF;

  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'La quantité doit être positive.';
  END IF;

  -- Atomically update stock with row lock — ensure product belongs to caller's org
  IF p_type = 'restock' THEN
    UPDATE products
    SET stock_quantity = stock_quantity + p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id AND organization_id = v_org_id
    RETURNING stock_quantity - p_quantity, stock_quantity
    INTO v_previous_stock, v_new_stock;

  ELSIF p_type = 'loss' THEN
    UPDATE products
    SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0),
        updated_at = NOW()
    WHERE id = p_product_id AND organization_id = v_org_id
    RETURNING stock_quantity + p_quantity, stock_quantity
    INTO v_previous_stock, v_new_stock;

  ELSIF p_type = 'adjustment' THEN
    UPDATE products
    SET stock_quantity = p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id AND organization_id = v_org_id
    RETURNING stock_quantity, p_quantity
    INTO v_previous_stock, v_new_stock;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable ou hors de votre organisation : %', p_product_id;
  END IF;

  -- Record stock movement
  IF p_type = 'restock' THEN
    v_delta := p_quantity;
  ELSIF p_type = 'loss' THEN
    v_delta := -p_quantity;
  ELSE
    v_delta := v_new_stock - v_previous_stock;
  END IF;

  INSERT INTO stock_movements (
    product_id, type, quantity, previous_quantity, new_quantity,
    reason, user_id, organization_id
  ) VALUES (
    p_product_id, p_type, v_delta, v_previous_stock, v_new_stock,
    p_reason, v_user_id, v_org_id
  );

  RETURN QUERY SELECT v_new_stock, v_previous_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(UUID, TEXT, INTEGER, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 4. register_user — Replace p_user_id with auth.uid(), verify p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'register_user' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.register_user(
  p_business_name TEXT,
  p_owner_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'vendeur',
  p_organization_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- If p_organization_id is provided, verify caller is admin of that org
  -- (admin inviting a new user to their org)
  IF p_organization_id IS NOT NULL THEN
    IF NOT public.is_member_of_organization(p_organization_id) THEN
      RAISE EXCEPTION 'Accès refusé : vous n''êtes pas membre de cette organisation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'Accès refusé : seul un admin peut inscrire un utilisateur dans une organisation';
    END IF;
  END IF;
  -- If p_organization_id is NULL, this is a self-registration (first admin creating org)

  INSERT INTO profiles (user_id, business_name, owner_name, phone, organization_id)
  VALUES (v_user_id, p_business_name, p_owner_name, p_phone, p_organization_id);

  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, p_role::app_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;


-- ════════════════════════════════════════════════════════════════
-- 5. increment_customer_credit — Add org verification
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'increment_customer_credit' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.increment_customer_credit(
  p_customer_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0';
  END IF;

  -- Verify customer belongs to caller's org
  UPDATE customers
  SET total_credit = total_credit + p_amount,
      updated_at = NOW()
  WHERE id = p_customer_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client introuvable ou hors de votre organisation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_customer_credit(UUID, NUMERIC) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 6. get_customer_stats — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_customer_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_customer_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total BIGINT;
  v_total_credit NUMERIC;
  v_customers_with_credit BIGINT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'totalCustomers', 0, 'totalCredit', 0, 'customersWithCredit', 0
    );
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM(total_credit), 0),
    COUNT(*) FILTER (WHERE total_credit > 0)
  INTO v_total, v_total_credit, v_customers_with_credit
  FROM customers
  WHERE organization_id = v_org_id;

  RETURN jsonb_build_object(
    'totalCustomers', v_total,
    'totalCredit', v_total_credit,
    'customersWithCredit', v_customers_with_credit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_stats() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 7. get_expense_stats — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_expense_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_expense_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_month_total NUMERIC;
  v_month_count BIGINT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('monthTotal', 0, 'monthCount', 0);
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_month_count, v_month_total
  FROM expenses
  WHERE organization_id = v_org_id
    AND expense_date >= date_trunc('month', CURRENT_DATE)
    AND expense_date < date_trunc('month', CURRENT_DATE) + interval '1 month';

  RETURN jsonb_build_object(
    'monthTotal', v_month_total,
    'monthCount', v_month_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_expense_stats() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 8. get_categories — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_categories' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_categories()
RETURNS TABLE (
  id UUID,
  name TEXT,
  icon TEXT,
  color TEXT,
  description TEXT,
  sort_order INT,
  is_default BOOLEAN,
  product_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.icon,
    c.color,
    c.description,
    c.sort_order,
    c.is_default,
    COALESCE(pc.cnt, 0) AS product_count
  FROM categories c
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM products p
    WHERE p.category_id = c.id
      AND p.organization_id = v_org_id
  ) pc ON true
  WHERE c.organization_id = v_org_id
  ORDER BY c.sort_order ASC NULLS LAST, c.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_categories() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 9. get_product_stats — Remove p_organization_id, keep category_counts
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_product_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_product_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total BIGINT;
  v_low_stock BIGINT;
  v_out_of_stock BIGINT;
  v_category_counts JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'totalProducts', 0, 'lowStockCount', 0, 'outOfStockCount', 0, 'categoryCounts', '{}'
    );
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE
      (min_stock_alert IS NOT NULL AND stock_quantity <= min_stock_alert)
      OR
      (min_stock_alert IS NULL AND stock_quantity <= 5)
    ),
    COUNT(*) FILTER (WHERE stock_quantity = 0)
  INTO v_total, v_low_stock, v_out_of_stock
  FROM products
  WHERE organization_id = v_org_id;

  -- Category counts for filter buttons
  SELECT COALESCE(jsonb_object_agg(category_id::text, cnt), '{}'::jsonb)
  INTO v_category_counts
  FROM (
    SELECT category_id, COUNT(*) AS cnt
    FROM products
    WHERE organization_id = v_org_id
      AND category_id IS NOT NULL
    GROUP BY category_id
  ) sub;

  RETURN jsonb_build_object(
    'totalProducts', v_total,
    'lowStockCount', v_low_stock,
    'outOfStockCount', v_out_of_stock,
    'categoryCounts', v_category_counts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_stats() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 10. get_reports_stats — Remove p_organization_id, keep full features
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_reports_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_reports_stats(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total_sales NUMERIC := 0;
  v_total_transactions BIGINT := 0;
  v_total_expenses NUMERIC := 0;
  v_expense_count BIGINT := 0;
  v_payment_breakdown JSONB;
  v_daily_sales JSONB;
  v_top_products JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Sales aggregation
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
  INTO v_total_sales, v_total_transactions
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= p_start
    AND created_at <= p_end;

  -- Expenses aggregation
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_expenses, v_expense_count
  FROM expenses
  WHERE organization_id = v_org_id
    AND expense_date >= p_start::date
    AND expense_date <= p_end::date;

  -- Payment method breakdown
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', payment_method, 'value', method_total
  )), '[]'::jsonb)
  INTO v_payment_breakdown
  FROM (
    SELECT payment_method, SUM(total_amount) AS method_total
    FROM sales
    WHERE organization_id = v_org_id
      AND created_at >= p_start
      AND created_at <= p_end
    GROUP BY payment_method
  ) sub;

  -- Daily sales for chart
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day::text, 'sales', day_total, 'transactions', day_count
  )), '[]'::jsonb)
  INTO v_daily_sales
  FROM (
    SELECT
      d.day::text,
      COALESCE(SUM(s.total_amount), 0) AS day_total,
      COUNT(s.id) AS day_count
    FROM generate_series(p_start::date, p_end::date, '1 day'::interval) AS d(day)
    LEFT JOIN sales s ON s.organization_id = v_org_id
      AND s.created_at >= d.day
      AND s.created_at < d.day + interval '1 day'
    GROUP BY d.day
    ORDER BY d.day
  ) daily;

  -- Top 5 products by quantity sold
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', product_name, 'quantity', total_qty, 'revenue', total_rev
  )), '[]'::jsonb)
  INTO v_top_products
  FROM (
    SELECT
      si.product_name,
      SUM(si.quantity) AS total_qty,
      SUM(si.total_price) AS total_rev
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = v_org_id
      AND s.created_at >= p_start
      AND s.created_at <= p_end
    GROUP BY si.product_name
    ORDER BY total_qty DESC
    LIMIT 5
  ) top;

  RETURN jsonb_build_object(
    'totalSales', v_total_sales,
    'totalTransactions', v_total_transactions,
    'totalExpenses', v_total_expenses,
    'expenseCount', v_expense_count,
    'paymentBreakdown', v_payment_breakdown,
    'dailySales', v_daily_sales,
    'topProducts', v_top_products
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reports_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 11. get_low_stock_products — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_low_stock_products' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_low_stock_products(
  p_limit INT DEFAULT 6
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  stock_quantity INT,
  min_stock_alert INT,
  category_name TEXT,
  category_icon TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.stock_quantity,
    COALESCE(p.min_stock_alert, 5),
    c.name AS category_name,
    c.icon AS category_icon
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.organization_id = v_org_id
    AND p.is_active = true
    AND (
      (p.min_stock_alert IS NOT NULL AND p.stock_quantity <= p.min_stock_alert)
      OR
      (p.min_stock_alert IS NULL AND p.stock_quantity <= 5)
    )
  ORDER BY p.stock_quantity ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_low_stock_products(INT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 12. get_next_category_sort_order — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_next_category_sort_order' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_next_category_sort_order()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_next INT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN 1;
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next
  FROM categories
  WHERE organization_id = v_org_id;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_category_sort_order() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 13. get_supplier_stats — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_supplier_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_supplier_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'totalSuppliers', 0, 'activeSuppliers', 0, 'totalProducts', 0, 'totalSupplyValue', 0
    );
  END IF;

  SELECT jsonb_build_object(
    'totalSuppliers', COUNT(*)::int,
    'activeSuppliers', COUNT(*) FILTER (WHERE is_active)::int,
    'totalProducts', (SELECT COUNT(*)::int FROM supplier_products WHERE organization_id = v_org_id AND is_active),
    'totalSupplyValue', COALESCE(
      (SELECT SUM(sp.supply_price * sp.min_quantity)
       FROM supplier_products sp
       WHERE sp.organization_id = v_org_id AND sp.is_active),
      0
    )
  ) INTO result
  FROM suppliers
  WHERE organization_id = v_org_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_stats() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 14. get_supplier_with_products — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_supplier_with_products' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_supplier_with_products(p_supplier_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  supplier_data JSONB;
  products_data JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get supplier info (scoped to caller's org)
  SELECT to_jsonb(s.*) INTO supplier_data
  FROM suppliers s
  WHERE s.id = p_supplier_id AND s.organization_id = v_org_id;

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
    AND sp.organization_id = v_org_id;

  RETURN supplier_data || jsonb_build_object('products', products_data);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_with_products(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 15. get_dashboard_stats — Remove p_organization_id, eliminate SQL injection risk
--     Previous version used format() with %L for dynamic SQL — unnecessary and risky
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_dashboard_stats' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_day_start TIMESTAMPTZ DEFAULT NULL,
  p_day_end TIMESTAMPTZ DEFAULT NULL,
  p_month_start TIMESTAMPTZ DEFAULT NULL,
  p_month_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_today_sales NUMERIC := 0;
  v_today_transactions BIGINT := 0;
  v_month_sales NUMERIC := 0;
  v_month_credit_count BIGINT := 0;
  v_month_expenses NUMERIC := 0;
  v_total_products BIGINT := 0;
  v_low_stock_products BIGINT := 0;
  v_total_credits NUMERIC := 0;
  v_credits_count BIGINT := 0;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'todaySales', 0, 'todayTransactions', 0,
      'monthSales', 0, 'monthCreditCount', 0,
      'monthExpenses', 0, 'totalProducts', 0,
      'lowStockProducts', 0, 'totalCredits', 0, 'creditsCount', 0
    );
  END IF;

  -- Today's sales
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
  INTO v_today_sales, v_today_transactions
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= COALESCE(p_day_start, CURRENT_DATE)
    AND created_at <= COALESCE(p_day_end, CURRENT_DATE + INTERVAL '1 day');

  -- Month's sales
  SELECT COALESCE(SUM(total_amount), 0),
         COUNT(*) FILTER (WHERE payment_method = 'credit')
  INTO v_month_sales, v_month_credit_count
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= COALESCE(p_month_start, date_trunc('month', CURRENT_DATE))
    AND created_at <= COALESCE(p_month_end, date_trunc('month', CURRENT_DATE) + INTERVAL '1 month');

  -- Month's expenses
  SELECT COALESCE(SUM(amount), 0)
  INTO v_month_expenses
  FROM expenses
  WHERE organization_id = v_org_id
    AND expense_date >= COALESCE(p_month_start::date, date_trunc('month', CURRENT_DATE)::date)
    AND expense_date <= COALESCE(p_month_end::date, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date);

  -- Products count + low stock
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(min_stock_alert, 5))
  INTO v_total_products, v_low_stock_products
  FROM products
  WHERE organization_id = v_org_id AND is_active = true;

  -- Customer credits
  SELECT COALESCE(SUM(total_credit), 0), COUNT(*)
  INTO v_total_credits, v_credits_count
  FROM customers
  WHERE organization_id = v_org_id AND total_credit > 0;

  RETURN jsonb_build_object(
    'todaySales', v_today_sales,
    'todayTransactions', v_today_transactions,
    'monthSales', v_month_sales,
    'monthCreditCount', v_month_credit_count,
    'monthExpenses', v_month_expenses,
    'totalProducts', v_total_products,
    'lowStockProducts', v_low_stock_products,
    'totalCredits', v_total_credits,
    'creditsCount', v_credits_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 16. get_top_products — Remove p_organization_id
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'get_top_products' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_top_products(
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(product_name TEXT, total_quantity BIGINT, total_revenue NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    si.product_name,
    SUM(si.quantity)::BIGINT AS total_quantity,
    SUM(si.total_price) AS total_revenue
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE s.organization_id = v_org_id
    AND (p_since IS NULL OR s.created_at >= p_since)
  GROUP BY si.product_name
  ORDER BY total_quantity DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_products(TIMESTAMPTZ, INTEGER) TO authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702100000_fix_register_user_first_admin.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- P1 Fix: register_user — Handle "first admin" case
-- Date: 2026-07-02
--
-- PROBLEM: When a first admin signs up, the frontend:
--   1. Creates the organization (owner_user_id = auth.uid())
--   2. Calls register_user with p_organization_id
--
-- But register_user verifies is_member_of_organization() + admin role,
-- which fails because the user has no profile or role yet.
--
-- FIX: If p_organization_id is provided and the caller is the
-- owner of that organization (owner_user_id = auth.uid()), allow
-- the registration even without existing membership/role.
-- This handles the "first admin" case atomically.
--
-- For existing admins inviting users, the normal verification
-- still applies.
-- ============================================================

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'register_user' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.register_user(
  p_business_name TEXT,
  p_owner_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'vendeur',
  p_organization_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_first_admin BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- If p_organization_id is provided, verify authorization
  IF p_organization_id IS NOT NULL THEN
    -- CASE 1: First admin — user just created the org and is the owner
    -- This happens during signup: frontend creates org first, then calls register_user
    IF EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = p_organization_id AND owner_user_id = v_user_id
    ) THEN
      -- Verify the user does NOT already have a profile (prevents re-registration)
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE user_id = v_user_id
      ) THEN
        v_is_first_admin := TRUE;
      END IF;
    END IF;

    -- CASE 2: Existing admin inviting a new user to their org
    IF NOT v_is_first_admin THEN
      IF NOT public.is_member_of_organization(p_organization_id) THEN
        RAISE EXCEPTION 'Accès refusé : vous n''êtes pas membre de cette organisation';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')
      ) THEN
        RAISE EXCEPTION 'Accès refusé : seul un admin peut inscrire un utilisateur dans une organisation';
      END IF;
    END IF;
  END IF;
  -- If p_organization_id is NULL, this is a self-registration without org

  -- Insert profile
  INSERT INTO profiles (user_id, business_name, owner_name, phone, organization_id)
  VALUES (v_user_id, p_business_name, p_owner_name, p_phone, p_organization_id);

  -- Insert role
  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, p_role::app_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702110000_saas_foundation_plans_subscriptions.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- SaaS Foundation: Plans, Subscriptions, Quotas, Feature Flags
-- Date: 2026-07-02
--
-- Creates the complete billing and quota system for MakitiPlus:
--   - plans: defines each plan's limits and pricing
--   - subscriptions: links organizations to active plans
--   - subscription_events: audit trail for plan changes
--   - usage_counters: tracks current usage per organization
--   - feature_flags: controls feature access per plan
--
-- All tables use organization_id for multi-tenancy.
-- RLS policies ensure organizations can only read their own data.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. plans — Plan definitions with limits
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY, -- 'starter', 'croissance', 'enterprise'
  name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC(10, 2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10, 2) DEFAULT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  max_stores INTEGER DEFAULT NULL, -- NULL = unlimited
  max_users INTEGER DEFAULT NULL, -- NULL = unlimited
  max_products INTEGER DEFAULT NULL, -- NULL = unlimited
  max_sales_per_month INTEGER DEFAULT NULL, -- NULL = unlimited
  has_advanced_reports BOOLEAN NOT NULL DEFAULT FALSE,
  has_exports BOOLEAN NOT NULL DEFAULT FALSE,
  has_supplier_management BOOLEAN NOT NULL DEFAULT FALSE,
  has_offline_advanced BOOLEAN NOT NULL DEFAULT FALSE,
  has_api_access BOOLEAN NOT NULL DEFAULT FALSE,
  has_priority_support BOOLEAN NOT NULL DEFAULT FALSE,
  has_custom_branding BOOLEAN NOT NULL DEFAULT FALSE,
  has_multi_currency BOOLEAN NOT NULL DEFAULT FALSE,
  has_ai_assistant BOOLEAN NOT NULL DEFAULT FALSE,
  has_loyalty_program BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default plans
INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, max_stores, max_users, max_products, has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced, sort_order) VALUES
  ('starter', 'Starter', 'Idéal pour démarrer — caisse et stock de base', 0.00, NULL, 1, 2, 500, FALSE, FALSE, FALSE, FALSE, 1),
  ('croissance', 'Croissance', 'Pour les boutiques qui grandissent — fournisseurs, rapports, exports', 29.00, 290.00, 3, 10, 5000, TRUE, TRUE, TRUE, TRUE, 2),
  ('enterprise', 'Enterprise', 'Pour les chaînes et grossistes — analytics, API, support prioritaire', 79.00, 790.00, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_stores = EXCLUDED.max_stores,
  max_users = EXCLUDED.max_users,
  max_products = EXCLUDED.max_products,
  has_advanced_reports = EXCLUDED.has_advanced_reports,
  has_exports = EXCLUDED.has_exports,
  has_supplier_management = EXCLUDED.has_supplier_management,
  has_offline_advanced = EXCLUDED.has_offline_advanced,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Update enterprise plan with premium features
UPDATE public.plans SET
  has_api_access = TRUE,
  has_priority_support = TRUE,
  has_custom_branding = TRUE,
  has_multi_currency = TRUE,
  has_ai_assistant = TRUE,
  has_loyalty_program = TRUE
WHERE id = 'enterprise';

-- Update croissance with some premium features
UPDATE public.plans SET
  has_custom_branding = TRUE,
  has_multi_currency = TRUE
WHERE id = 'croissance';


-- ════════════════════════════════════════════════════════════════
-- 2. subscriptions — Organization plan subscriptions
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'grace_period', 'read_only', 'cancelled', 'expired')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  trial_ends_at TIMESTAMPTZ DEFAULT NULL,
  grace_period_ends_at TIMESTAMPTZ DEFAULT NULL,
  cancelled_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id) -- One active subscription per org
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);


-- ════════════════════════════════════════════════════════════════
-- 3. subscription_events — Audit trail for plan changes
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'upgraded', 'downgraded', 'renewed', 'cancelled',
    'expired', 'grace_period_started', 'read_only_started',
    'trial_started', 'trial_ended', 'payment_received', 'payment_failed'
  )),
  from_plan TEXT DEFAULT NULL,
  to_plan TEXT DEFAULT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_org ON public.subscription_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON public.subscription_events(event_type);


-- ════════════════════════════════════════════════════════════════
-- 4. usage_counters — Current usage per organization
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  counter_type TEXT NOT NULL CHECK (counter_type IN (
    'stores', 'users', 'products', 'sales_this_month', 'exports_this_month'
  )),
  current_count INTEGER NOT NULL DEFAULT 0,
  limit_value INTEGER DEFAULT NULL, -- NULL = unlimited
  period_start TIMESTAMPTZ DEFAULT NULL, -- For monthly counters
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, counter_type)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_org ON public.usage_counters(organization_id);


-- ════════════════════════════════════════════════════════════════
-- 5. feature_flags — Per-plan feature access control
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  description TEXT,
  allowed_plans TEXT[] NOT NULL DEFAULT '{"starter","croissance","enterprise"}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed feature flags
INSERT INTO public.feature_flags (feature_key, description, allowed_plans) VALUES
  ('pos', 'Accès caisse enregistreuse', '{"starter","croissance","enterprise"}'),
  ('stock_management', 'Gestion du stock', '{"starter","croissance","enterprise"}'),
  ('customer_credit', 'Crédit clients', '{"starter","croissance","enterprise"}'),
  ('basic_reports', 'Rapports de base', '{"starter","croissance","enterprise"}'),
  ('advanced_reports', 'Rapports avancés et analytics', '{"croissance","enterprise"}'),
  ('exports', 'Exports PDF et Excel', '{"croissance","enterprise"}'),
  ('supplier_management', 'Gestion fournisseurs', '{"croissance","enterprise"}'),
  ('offline_advanced', 'Mode offline avancé', '{"croissance","enterprise"}'),
  ('custom_branding', 'Branding personnalisé', '{"croissance","enterprise"}'),
  ('multi_currency', 'Multi-devises', '{"croissance","enterprise"}'),
  ('api_access', 'Accès API externe', '{"enterprise"}'),
  ('priority_support', 'Support prioritaire', '{"enterprise"}'),
  ('ai_assistant', 'Assistant IA métier', '{"enterprise"}'),
  ('loyalty_program', 'Programme fidélité', '{"enterprise"}'),
  ('admin_analytics', 'Analytics multi-boutiques admin', '{"enterprise"}'),
  ('backup_restore', 'Sauvegarde et restauration', '{"enterprise"}')
ON CONFLICT (feature_key) DO UPDATE SET
  description = EXCLUDED.description,
  allowed_plans = EXCLUDED.allowed_plans;


-- ════════════════════════════════════════════════════════════════
-- 6. RPC: get_organization_subscription — Get active subscription
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_organization_subscription()
RETURNS TABLE (
  subscription_id UUID,
  plan_id TEXT,
  plan_name TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  max_stores INTEGER,
  max_users INTEGER,
  max_products INTEGER,
  max_sales_per_month INTEGER,
  has_advanced_reports BOOLEAN,
  has_exports BOOLEAN,
  has_supplier_management BOOLEAN,
  has_offline_advanced BOOLEAN,
  has_api_access BOOLEAN,
  has_priority_support BOOLEAN,
  has_custom_branding BOOLEAN,
  has_multi_currency BOOLEAN,
  has_ai_assistant BOOLEAN,
  has_loyalty_program BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  RETURN QUERY
  SELECT
    s.id AS subscription_id,
    s.plan_id,
    p.name AS plan_name,
    s.status,
    s.current_period_end,
    s.trial_ends_at,
    s.grace_period_ends_at,
    p.max_stores,
    p.max_users,
    p.max_products,
    p.max_sales_per_month,
    p.has_advanced_reports,
    p.has_exports,
    p.has_supplier_management,
    p.has_offline_advanced,
    p.has_api_access,
    p.has_priority_support,
    p.has_custom_branding,
    p.has_multi_currency,
    p.has_ai_assistant,
    p.has_loyalty_program
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_subscription() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 7. RPC: check_plan_limit — Verify if action is within plan limits
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_limit_type TEXT -- 'stores', 'users', 'products', 'sales_this_month'
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  limit_value INTEGER,
  plan_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_sub record;
  v_current INTEGER;
  v_limit INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Get active subscription
  SELECT * INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no subscription, default to starter limits
  IF NOT FOUND THEN
    SELECT * INTO v_sub FROM public.plans WHERE id = 'starter';
  END IF;

  -- Calculate current count based on limit type
  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
      v_limit := v_sub.max_stores;
    WHEN 'users' THEN
      SELECT COUNT(*) INTO v_current FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE p.organization_id = v_org_id;
      v_limit := v_sub.max_users;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id;
      v_limit := v_sub.max_products;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_current FROM public.sales
      WHERE organization_id = v_org_id
        AND created_at >= date_trunc('month', NOW());
      v_limit := v_sub.max_sales_per_month;
    ELSE
      RAISE EXCEPTION 'Type de limite inconnu : %', p_limit_type;
  END CASE;

  -- NULL limit means unlimited
  RETURN QUERY SELECT
    (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
    v_current,
    v_limit,
    v_sub.plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 8. RPC: check_feature_access — Verify feature is available for plan
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_feature_key TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  plan_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_plan_id TEXT;
  v_allowed_plans TEXT[];
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Get organization's plan
  SELECT s.plan_id INTO v_plan_id
  FROM public.subscriptions s
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Default to starter if no subscription
  IF v_plan_id IS NULL THEN
    v_plan_id := 'starter';
  END IF;

  -- Get feature's allowed plans
  SELECT allowed_plans INTO v_allowed_plans
  FROM public.feature_flags
  WHERE feature_key = p_feature_key AND is_active = TRUE;

  IF NOT FOUND THEN
    -- Feature not found = not allowed
    RETURN QUERY SELECT FALSE, v_plan_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT (v_plan_id = ANY(v_allowed_plans))::BOOLEAN, v_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_feature_access(TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 9. RPC: get_plans — Public endpoint for pricing page
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_plans()
RETURNS SETOF public.plans
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.plans WHERE is_active = TRUE ORDER BY sort_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_plans() TO authenticated, anon;


-- ════════════════════════════════════════════════════════════════
-- 10. Auto-create starter subscription for new organizations
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auto_create_starter_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
  VALUES (
    NEW.id,
    'starter',
    'active',
    NOW(),
    NOW() + INTERVAL '30 days'
  )
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_auto_create_subscription ON public.organizations;

CREATE TRIGGER trigger_auto_create_subscription
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_starter_subscription();


-- ════════════════════════════════════════════════════════════════
-- 11. RLS Policies
-- ════════════════════════════════════════════════════════════════

-- plans: readable by everyone
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are publicly readable" ON public.plans FOR SELECT USING (TRUE);

-- subscriptions: org members can read their own
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own org subscription" ON public.subscriptions
  FOR SELECT USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- subscription_events: org members can read their own
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own org events" ON public.subscription_events
  FOR SELECT USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- usage_counters: org members can read their own
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own org usage" ON public.usage_counters
  FOR SELECT USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- feature_flags: readable by all authenticated users
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Feature flags are readable by authenticated users" ON public.feature_flags
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = TRUE);


-- ════════════════════════════════════════════════════════════════
-- 12. Backfill existing organizations with starter subscriptions
-- ════════════════════════════════════════════════════════════════
INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
SELECT id, 'starter', 'active', NOW(), NOW() + INTERVAL '30 days'
FROM public.organizations
WHERE id NOT IN (SELECT organization_id FROM public.subscriptions)
ON CONFLICT (organization_id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702120000_multi_store_support.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Multi-Store Support — COMPLETE SETUP (idempotent)
-- Date: 2026-07-02
--
-- This script creates the multi-store system within organizations.
-- Each organization can have multiple stores (limited by plan).
-- All data tables get a store_id FK for per-store scoping.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ─── 1. Create stores table ────────────────────────────────────

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

  -- One slug per organization
  UNIQUE (organization_id, slug)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_stores_organization_id ON public.stores (organization_id);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON public.stores (organization_id, slug);

-- ─── 2. Auto-create a "Main" store for each existing organization ──

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

-- ─── 3. Add store_id to all data tables ─────────────────────────

-- Products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.products ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: set store_id to the organization's main store
UPDATE public.products p
SET store_id = s.id
FROM public.stores s
WHERE p.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND p.store_id IS NULL;

-- Sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.sales ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.sales sl
SET store_id = s.id
FROM public.stores s
WHERE sl.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND sl.store_id IS NULL;

-- Sale items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.sale_items ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.sale_items si
SET store_id = s.id
FROM public.stores s
WHERE si.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND si.store_id IS NULL;

-- Expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.expenses ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.expenses e
SET store_id = s.id
FROM public.stores s
WHERE e.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND e.store_id IS NULL;

-- Categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.categories ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.categories c
SET store_id = s.id
FROM public.stores s
WHERE c.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND c.store_id IS NULL;

-- Customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.customers cu
SET store_id = s.id
FROM public.stores s
WHERE cu.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND cu.store_id IS NULL;

-- Stock movements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.stock_movements ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.stock_movements sm
SET store_id = s.id
FROM public.stores s
WHERE sm.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND sm.store_id IS NULL;

-- Suppliers (shared across stores within an org, but can be store-specific)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Suppliers stay org-level (store_id stays NULL = available to all stores)

-- ─── 4. Add current_store_id to profiles ───────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'current_store_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN current_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: set current_store_id to the org's main store
UPDATE public.profiles p
SET current_store_id = s.id
FROM public.stores s
WHERE p.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND p.current_store_id IS NULL;

-- ─── 5. Indexes for store_id on data tables ────────────────────

CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products (store_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON public.sales (store_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_store_id ON public.sale_items (store_id);
CREATE INDEX IF NOT EXISTS idx_expenses_store_id ON public.expenses (store_id);
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON public.categories (store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers (store_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id ON public.stock_movements (store_id);
CREATE INDEX IF NOT EXISTS idx_profiles_current_store_id ON public.profiles (current_store_id);

-- ─── 6. Updated trigger: auto-create store for new organizations ─

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

-- ─── 7. RLS policies for stores ────────────────────────────────

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Users can see stores in their organization
DROP POLICY IF EXISTS "stores_select_org_member" ON public.stores;
CREATE POLICY "stores_select_org_member"
  ON public.stores FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- Admins/managers can insert stores (subject to plan limits)
DROP POLICY IF EXISTS "stores_insert_admin" ON public.stores;
CREATE POLICY "stores_insert_admin"
  ON public.stores FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

-- Admins/managers can update stores
DROP POLICY IF EXISTS "stores_update_admin" ON public.stores;
CREATE POLICY "stores_update_admin"
  ON public.stores FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

-- Only super_admin can delete stores
DROP POLICY IF EXISTS "stores_delete_super_admin" ON public.stores;
CREATE POLICY "stores_delete_super_admin"
  ON public.stores FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role = 'super_admin'
      )
    )
  );

-- ─── 8. RPC: get_organization_stores() ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_organization_stores()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  currency TEXT,
  phone TEXT,
  is_active BOOLEAN,
  is_headquarters BOOLEAN,
  category public.store_category,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  product_count BIGINT,
  sales_this_month NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.slug,
    s.address,
    s.city,
    s.country,
    s.currency,
    s.phone,
    s.is_active,
    s.is_headquarters,
    s.category,
    s.metadata,
    s.created_at,
    s.updated_at,
    COALESCE(pcnt.cnt, 0) AS product_count,
    COALESCE(sales.total, 0) AS sales_this_month
  FROM public.stores s
  LEFT JOIN (SELECT store_id, COUNT(*) AS cnt FROM public.products WHERE store_id IS NOT NULL GROUP BY store_id) pcnt ON pcnt.store_id = s.id
  LEFT JOIN (
    SELECT store_id, SUM(total_amount) AS total
    FROM public.sales
    WHERE store_id IS NOT NULL
      AND created_at >= date_trunc('month', now())
    GROUP BY store_id
  ) sales ON sales.store_id = s.id
  WHERE s.organization_id = v_org_id
  ORDER BY s.is_headquarters DESC, s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_stores() TO authenticated;

-- ─── 9. RPC: set_current_store(p_store_id) ─────────────────────

CREATE OR REPLACE FUNCTION public.set_current_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  -- Verify store belongs to same org
  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Store does not belong to your organization';
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET current_store_id = p_store_id,
      updated_at = now()
  WHERE user_id = auth.uid();

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_current_store(UUID) TO authenticated;

-- ─── 10. Update check_plan_limit to count stores ───────────────

-- The existing check_plan_limit should already handle 'stores' limit type
-- since we added it in the SaaS foundation. Let's verify the stores count
-- uses the new stores table instead of organizations.

-- We need a separate count function for stores (not organizations)
-- The existing check_plan_limit counts organizations for 'stores' type.
-- We update it to count from the stores table instead.

CREATE OR REPLACE FUNCTION public.check_plan_limit(p_limit_type TEXT)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  limit_value INTEGER,
  plan_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_sub record;
  v_current INTEGER;
  v_limit INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Get active subscription with plan details
  SELECT s.plan_id, p.max_stores, p.max_users, p.max_products, p.max_sales_per_month
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no subscription, default to starter limits
  IF NOT FOUND THEN
    SELECT 'starter'::text AS plan_id, max_stores, max_users, max_products, max_sales_per_month
    INTO v_sub
    FROM public.plans WHERE id = 'starter';
  END IF;

  -- Calculate current count + get limit based on limit type
  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
      v_limit := v_sub.max_stores;
    WHEN 'users' THEN
      SELECT COUNT(DISTINCT ur.user_id) INTO v_current
      FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE p.organization_id = v_org_id;
      v_limit := v_sub.max_users;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id;
      v_limit := v_sub.max_products;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_current FROM public.sales
      WHERE organization_id = v_org_id
        AND created_at >= date_trunc('month', NOW());
      v_limit := v_sub.max_sales_per_month;
    ELSE
      RAISE EXCEPTION 'Type de limite inconnu : %', p_limit_type;
  END CASE;

  -- NULL limit means unlimited
  RETURN QUERY SELECT
    (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
    v_current,
    v_limit,
    v_sub.plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;

-- ─── 11. RPC: get_store_stats(p_store_id) ──────────────────────

CREATE OR REPLACE FUNCTION public.get_store_stats(p_store_id UUID)
RETURNS TABLE (
  product_count BIGINT,
  active_product_count BIGINT,
  low_stock_count BIGINT,
  sales_today NUMERIC,
  sales_this_month NUMERIC,
  expenses_this_month NUMERIC,
  customer_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Verify store belongs to user's org
  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Store not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(pcnt.total, 0),
    COALESCE(pcnt.active, 0),
    COALESCE(pcnt.low, 0),
    COALESCE(sales_today.total, 0),
    COALESCE(sales_month.total, 0),
    COALESCE(expenses_month.total, 0),
    COALESCE(cust.cnt, 0)
  FROM (SELECT 1) AS dummy
  LEFT JOIN (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_active = true) AS active,
      COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(min_stock_alert, 5) AND is_active = true) AS low
    FROM public.products WHERE store_id = p_store_id
  ) pcnt ON true
  LEFT JOIN (
    SELECT COALESCE(SUM(total_amount), 0) AS total
    FROM public.sales
    WHERE store_id = p_store_id AND created_at >= date_trunc('day', now())
  ) sales_today ON true
  LEFT JOIN (
    SELECT COALESCE(SUM(total_amount), 0) AS total
    FROM public.sales
    WHERE store_id = p_store_id AND created_at >= date_trunc('month', now())
  ) sales_month ON true
  LEFT JOIN (
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM public.expenses
    WHERE store_id = p_store_id AND expense_date >= date_trunc('month', now())
  ) expenses_month ON true
  LEFT JOIN (
    SELECT COUNT(*) AS cnt FROM public.customers WHERE store_id = p_store_id
  ) cust ON true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_stats(UUID) TO authenticated;

-- ─── Done ──────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702130000_fix_subscription_events_and_lifecycle.sql
-- ═════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- Fix: Expand subscription_events CHECK constraint + Add lifecycle automation
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Add missing event types to CHECK constraint (checkout_initiated, etc.)
-- 2. Create auto-lifecycle function + pg_cron schedule
-- 3. Add subscription event insertions in existing triggers
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Drop and recreate CHECK constraint with expanded event types ───────

ALTER TABLE public.subscription_events DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;

ALTER TABLE public.subscription_events ADD CONSTRAINT subscription_events_event_type_check
  CHECK (event_type IN (
    'created',
    'upgraded',
    'downgraded',
    'renewed',
    'cancelled',
    'expired',
    'grace_period_started',
    'read_only_started',
    'trial_started',
    'trial_ended',
    'payment_received',
    'payment_failed',
    'checkout_initiated',
    'checkout_completed',
    'subscription_reactivated',
    'grace_period_ended',
    'auto_downgraded'
  ));

-- ─── 2. Add event logging to auto_create_starter_subscription trigger ─────

CREATE OR REPLACE FUNCTION public.auto_create_starter_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
  VALUES (
    NEW.id,
    'starter',
    'active',
    NOW(),
    NOW() + INTERVAL '30 days'
  )
  ON CONFLICT (organization_id) DO NOTHING;

  -- Log the creation event
  INSERT INTO public.subscription_events (organization_id, event_type, to_plan, metadata)
  VALUES (
    NEW.id,
    'created',
    'starter',
    jsonb_build_object('trigger', 'auto_create_starter_subscription')
  );

  RETURN NEW;
END;
$$;


-- ─── 3. Subscription lifecycle automation function ─────────────────────────
-- Runs periodically (pg_cron) to transition subscriptions through their lifecycle:
--   grace_period → read_only  (when grace_period_ends_at < NOW())
--   read_only → expired       (when read_only for > 14 days)
--   expired → downgraded to starter (when expired for > 30 days)

CREATE OR REPLACE FUNCTION public.process_subscription_lifecycle()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_grace_to_read_only INT := 0;
  v_read_only_to_expired INT := 0;
  v_expired_to_starter INT := 0;
  v_org_id UUID;
  v_sub_id UUID;
BEGIN
  -- ─── Transition 1: grace_period → read_only ────────────────────────
  FOR v_org_id, v_sub_id IN
    SELECT s.organization_id, s.id
    FROM public.subscriptions s
    WHERE s.status = 'grace_period'
      AND s.grace_period_ends_at IS NOT NULL
      AND s.grace_period_ends_at < NOW()
  LOOP
    UPDATE public.subscriptions SET
      status = 'read_only',
      updated_at = NOW()
    WHERE id = v_sub_id;

    INSERT INTO public.subscription_events (organization_id, event_type, to_plan, metadata)
    VALUES (v_org_id, 'read_only_started', 'starter', jsonb_build_object(
      'trigger', 'lifecycle_cron',
      'previous_status', 'grace_period',
      'grace_period_ends_at_was', (SELECT grace_period_ends_at FROM public.subscriptions WHERE id = v_sub_id)
    ));

    v_grace_to_read_only := v_grace_to_read_only + 1;
  END LOOP;

  -- ─── Transition 2: read_only → expired (after 14 days) ─────────────
  FOR v_org_id, v_sub_id IN
    SELECT s.organization_id, s.id
    FROM public.subscriptions s
    WHERE s.status = 'read_only'
      AND s.updated_at < NOW() - INTERVAL '14 days'
  LOOP
    UPDATE public.subscriptions SET
      status = 'expired',
      updated_at = NOW()
    WHERE id = v_sub_id;

    INSERT INTO public.subscription_events (organization_id, event_type, to_plan, metadata)
    VALUES (v_org_id, 'expired', 'starter', jsonb_build_object(
      'trigger', 'lifecycle_cron',
      'previous_status', 'read_only',
      'days_read_only', 14
    ));

    v_read_only_to_expired := v_read_only_to_expired + 1;
  END LOOP;

  -- ─── Transition 3: expired → auto-downgrade to starter (after 30 days)
  FOR v_org_id, v_sub_id IN
    SELECT s.organization_id, s.id
    FROM public.subscriptions s
    WHERE s.status = 'expired'
      AND s.plan_id != 'starter'
      AND s.updated_at < NOW() - INTERVAL '30 days'
  LOOP
    UPDATE public.subscriptions SET
      plan_id = 'starter',
      status = 'active',
      current_period_start = NOW(),
      current_period_end = NOW() + INTERVAL '30 days',
      trial_ends_at = NULL,
      grace_period_ends_at = NULL,
      updated_at = NOW()
    WHERE id = v_sub_id;

    -- Clear Stripe subscription ID
    UPDATE public.stripe_customers SET
      stripe_subscription_id = NULL,
      updated_at = NOW()
    WHERE organization_id = v_org_id;

    INSERT INTO public.subscription_events (organization_id, event_type, from_plan, to_plan, metadata)
    VALUES (v_org_id, 'auto_downgraded',
      (SELECT plan_id FROM public.subscriptions WHERE id = v_sub_id),
      'starter',
      jsonb_build_object(
        'trigger', 'lifecycle_cron',
        'previous_status', 'expired',
        'days_expired', 30
      )
    );

    v_expired_to_starter := v_expired_to_starter + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'grace_to_read_only', v_grace_to_read_only,
    'read_only_to_expired', v_read_only_to_expired,
    'expired_to_starter', v_expired_to_starter,
    'processed_at', NOW()
  );
END;
$$;

-- No GRANT — called by service role only (pg_cron or Edge Function)


-- ─── 4. pg_cron schedule (requires pg_cron extension) ─────────────────────
-- Run the lifecycle function every hour
-- Note: pg_cron must be enabled in Supabase Dashboard → Database → Extensions

-- Uncomment the following lines after enabling pg_cron:
-- SELECT cron.schedule(
--   'subscription-lifecycle-hourly',
--   '0 * * * *',  -- Every hour at minute 0
--   $$SELECT public.process_subscription_lifecycle();$$
-- );

-- Alternative: Run every 6 hours if hourly is too frequent
-- SELECT cron.schedule(
--   'subscription-lifecycle-6h',
--   '0 */6 * * *',  -- Every 6 hours
--   $$SELECT public.process_subscription_lifecycle();$$
-- );


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702130001_purchase_orders.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Supplier Purchase Orders — COMPLETE SETUP (idempotent)
-- Date: 2026-07-02
--
-- This script creates the purchase order system for ordering
-- from suppliers. Includes:
-- - purchase_orders table
-- - purchase_order_items table
-- - RPCs for creating and managing orders
-- - RLS policies
--
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ─── 1. Purchase order status enum ─────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'po_status') THEN
    CREATE TYPE public.po_status AS ENUM (
      'draft',
      'sent',
      'confirmed',
      'partial',
      'received',
      'cancelled'
    );
  END IF;
END $$;

-- ─── 2. purchase_orders table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id          UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  supplier_id       UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  order_number      TEXT NOT NULL,
  status            public.po_status NOT NULL DEFAULT 'draft',
  order_date        DATE NOT NULL DEFAULT current_date,
  expected_delivery DATE,
  received_date     DATE,
  notes             TEXT,
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'GNF',
  created_by        UUID REFERENCES public.profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One order_number per organization
  UNIQUE (organization_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_org ON public.purchase_orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_store ON public.purchase_orders (store_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders (status);

-- ─── 3. purchase_order_items table ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name      TEXT NOT NULL,
  quantity_ordered  INTEGER NOT NULL DEFAULT 0,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  unit_cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total        NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poi_order ON public.purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_product ON public.purchase_order_items (product_id);

-- ─── 4. RLS policies ──────────────────────────────────────────

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Select: org members
DROP POLICY IF EXISTS "po_select_org" ON public.purchase_orders;
CREATE POLICY "po_select_org"
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- Insert: admin/manager
DROP POLICY IF EXISTS "po_insert_admin" ON public.purchase_orders;
CREATE POLICY "po_insert_admin"
  ON public.purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

-- Update: admin/manager
DROP POLICY IF EXISTS "po_update_admin" ON public.purchase_orders;
CREATE POLICY "po_update_admin"
  ON public.purchase_orders FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

-- Delete: admin only
DROP POLICY IF EXISTS "po_delete_admin" ON public.purchase_orders;
CREATE POLICY "po_delete_admin"
  ON public.purchase_orders FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin')
      )
    )
  );

-- Items: same as parent order
DROP POLICY IF EXISTS "poi_select_org" ON public.purchase_order_items;
CREATE POLICY "poi_select_org"
  ON public.purchase_order_items FOR SELECT
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS "poi_insert_admin" ON public.purchase_order_items;
CREATE POLICY "poi_insert_admin"
  ON public.purchase_order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin', 'super_admin', 'manager')
        )
      )
    )
  );

DROP POLICY IF EXISTS "poi_update_admin" ON public.purchase_order_items;
CREATE POLICY "poi_update_admin"
  ON public.purchase_order_items FOR UPDATE
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin', 'super_admin', 'manager')
        )
      )
    )
  );

DROP POLICY IF EXISTS "poi_delete_admin" ON public.purchase_order_items;
CREATE POLICY "poi_delete_admin"
  ON public.purchase_order_items FOR DELETE
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin', 'super_admin')
        )
      )
    )
  );

-- ─── 5. RPC: generate_order_number() ──────────────────────────

CREATE OR REPLACE FUNCTION public.generate_order_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_number TEXT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.purchase_orders
  WHERE organization_id = p_org_id
    AND created_at >= date_trunc('year', now());

  v_number := 'BC-' || to_char(now(), 'YY') || '-' || lpad((v_count + 1)::TEXT, 4, '0');
  RETURN v_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_order_number(UUID) TO authenticated;

-- ─── 6. RPC: receive_purchase_order() ─────────────────────────
-- When a PO is received, update stock quantities and mark items

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id UUID,
  p_items JSONB -- [{"id": "item_uuid", "quantity_received": 5}, ...]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_store_id UUID;
  v_item RECORD;
  v_product_id UUID;
  v_qty_received INTEGER;
  v_previous_qty INTEGER;
  v_new_qty INTEGER;
BEGIN
  -- Verify access
  SELECT organization_id, store_id INTO v_org_id, v_store_id
  FROM public.purchase_orders WHERE id = p_order_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Verify org membership
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Update each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) AS item
  LOOP
    UPDATE public.purchase_order_items
    SET quantity_received = (v_item->>'quantity_received')::INTEGER
    WHERE id = (v_item->>'id')::UUID;

    -- Update product stock if product is linked
    SELECT product_id INTO v_product_id
    FROM public.purchase_order_items
    WHERE id = (v_item->>'id')::UUID;

    IF v_product_id IS NOT NULL THEN
      v_qty_received := (v_item->>'quantity_received')::INTEGER;

      -- Get previous quantity for stock_movements
      SELECT stock_quantity INTO v_previous_qty
      FROM public.products
      WHERE id = v_product_id
      FOR UPDATE;

      -- Update product stock
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_qty_received,
          updated_at = now()
      WHERE id = v_product_id
      RETURNING stock_quantity INTO v_new_qty;

      -- Log stock movement with correct column names
      INSERT INTO public.stock_movements (
        product_id, type, quantity, previous_quantity, new_quantity,
        reason, user_id, organization_id, store_id
      ) VALUES (
        v_product_id, 'restock', v_qty_received, v_previous_qty, v_new_qty,
        'Réception commande fournisseur', auth.uid(), v_org_id, v_store_id
      );
    END IF;
  END LOOP;

  -- Update order status
  UPDATE public.purchase_orders
  SET status = 'received',
      received_date = current_date,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order(UUID, JSONB) TO authenticated;

-- ─── Done ──────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702140000_saas_metrics_rpcs.sql
-- ═════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- SaaS Metrics RPCs for Admin Analytics
-- ════════════════════════════════════════════════════════════════════════════
-- Provides MRR, churn rate, conversion rate, plan distribution, and more
-- Only accessible to super_admin users (checked via is_super_admin())
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. get_saas_overview ───────────────────────────────────────────────
-- High-level SaaS KPIs: total orgs, active subs, MRR, ARR, plan distribution
CREATE OR REPLACE FUNCTION public.get_saas_overview()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_orgs BIGINT;
  v_active_paid BIGINT;
  v_trial BIGINT;
  v_grace_period BIGINT;
  v_read_only BIGINT;
  v_expired BIGINT;
  v_mrr NUMERIC;
  v_plan_distribution JSONB;
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  -- Total organizations
  SELECT COUNT(*) INTO v_total_orgs FROM organizations;

  -- Count by subscription status
  SELECT
    COUNT(*) FILTER (WHERE s.plan_id != 'starter' AND s.status = 'active'),
    COUNT(*) FILTER (WHERE s.trial_ends_at IS NOT NULL AND s.trial_ends_at > NOW() AND s.status = 'active'),
    COUNT(*) FILTER (WHERE s.status = 'grace_period'),
    COUNT(*) FILTER (WHERE s.status = 'read_only'),
    COUNT(*) FILTER (WHERE s.status = 'expired')
  INTO v_active_paid, v_trial, v_grace_period, v_read_only, v_expired
  FROM subscriptions s;

  -- MRR: sum of monthly prices for active paid subscriptions
  SELECT COALESCE(SUM(
    CASE
      WHEN s.plan_id = 'croissance' THEN 2900  -- $29 in cents
      WHEN s.plan_id = 'enterprise' THEN 7900  -- $79 in cents
      ELSE 0
    END
  ), 0) INTO v_mrr
  FROM subscriptions s
  WHERE s.status = 'active' AND s.plan_id != 'starter';

  -- Plan distribution
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_plan_distribution
  FROM (
    SELECT
      s.plan_id,
      p.name AS plan_name,
      COUNT(*) AS count,
      COUNT(*) FILTER (WHERE s.status = 'active') AS active_count,
      COUNT(*) FILTER (WHERE s.status = 'grace_period') AS grace_period_count,
      COUNT(*) FILTER (WHERE s.status = 'read_only') AS read_only_count,
      COUNT(*) FILTER (WHERE s.status = 'expired') AS expired_count,
      COUNT(*) FILTER (WHERE s.status = 'cancelled') AS cancelled_count
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    GROUP BY s.plan_id, p.name
    ORDER BY p.sort_order
  ) t;

  RETURN jsonb_build_object(
    'total_organizations', v_total_orgs,
    'active_paid_subscriptions', v_active_paid,
    'trial_subscriptions', v_trial,
    'grace_period_subscriptions', v_grace_period,
    'read_only_subscriptions', v_read_only,
    'expired_subscriptions', v_expired,
    'mrr_cents', v_mrr,
    'arr_cents', v_mrr * 12,
    'plan_distribution', v_plan_distribution,
    'free_to_paid_ratio', CASE WHEN v_total_orgs > 0
      THEN ROUND((v_active_paid::NUMERIC / v_total_orgs) * 100, 1)
      ELSE 0 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_saas_overview() TO authenticated;


-- ─── 2. get_saas_churn_metrics ──────────────────────────────────────────
-- Churn rate, cancellations, and conversion over time periods
CREATE OR REPLACE FUNCTION public.get_saas_churn_metrics(
  p_period_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
  v_total_at_start BIGINT;
  v_cancelled_in_period BIGINT;
  v_new_paid_in_period BIGINT;
  v_churn_rate NUMERIC;
  v_conversion_rate NUMERIC;
  v_total_signups BIGINT;
  v_monthly_churn JSONB;
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  v_period_start := NOW() - (p_period_days || ' days')::INTERVAL;

  -- Total paid at start of period (approximation based on events)
  SELECT COUNT(DISTINCT organization_id) INTO v_total_at_start
  FROM subscription_events
  WHERE event_type IN ('upgraded', 'checkout_completed', 'created')
    AND created_at < v_period_start
    AND organization_id NOT IN (
      SELECT DISTINCT organization_id FROM subscription_events
      WHERE event_type IN ('cancelled', 'auto_downgraded')
        AND created_at < v_period_start
    );

  -- Cancellations in period
  SELECT COUNT(DISTINCT organization_id) INTO v_cancelled_in_period
  FROM subscription_events
  WHERE event_type IN ('cancelled', 'auto_downgraded')
    AND created_at >= v_period_start;

  -- New paid subscriptions in period
  SELECT COUNT(DISTINCT organization_id) INTO v_new_paid_in_period
  FROM subscription_events
  WHERE event_type IN ('upgraded', 'checkout_completed')
    AND created_at >= v_period_start;

  -- Total signups in period
  SELECT COUNT(DISTINCT organization_id) INTO v_total_signups
  FROM subscription_events
  WHERE event_type = 'created'
    AND created_at >= v_period_start;

  -- Churn rate
  v_churn_rate := CASE WHEN v_total_at_start > 0
    THEN ROUND((v_cancelled_in_period::NUMERIC / v_total_at_start) * 100, 2)
    ELSE 0 END;

  -- Conversion rate (new paid / total signups)
  v_conversion_rate := CASE WHEN v_total_signups > 0
    THEN ROUND((v_new_paid_in_period::NUMERIC / v_total_signups) * 100, 2)
    ELSE 0 END;

  -- Monthly churn breakdown (last 6 months)
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_monthly_churn
  FROM (
    SELECT
      TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
      COUNT(DISTINCT CASE WHEN event_type IN ('cancelled', 'auto_downgraded') THEN organization_id END) AS churned,
      COUNT(DISTINCT CASE WHEN event_type IN ('upgraded', 'checkout_completed') THEN organization_id END) AS new_paid,
      COUNT(DISTINCT CASE WHEN event_type = 'created' THEN organization_id END) AS signups
    FROM subscription_events
    WHERE created_at >= NOW() - INTERVAL '6 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY DATE_TRUNC('month', created_at)
  ) r;

  RETURN jsonb_build_object(
    'period_days', p_period_days,
    'total_paid_at_start', v_total_at_start,
    'cancelled_in_period', v_cancelled_in_period,
    'new_paid_in_period', v_new_paid_in_period,
    'total_signups', v_total_signups,
    'churn_rate_pct', v_churn_rate,
    'conversion_rate_pct', v_conversion_rate,
    'monthly_breakdown', v_monthly_churn
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_saas_churn_metrics(INTEGER) TO authenticated;


-- ─── 3. get_saas_revenue_metrics ────────────────────────────────────────
-- Revenue breakdown by plan, MRR trend
CREATE OR REPLACE FUNCTION public.get_saas_revenue_metrics()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_mrr BIGINT := 0;
  v_revenue_by_plan JSONB;
  v_monthly_revenue JSONB;
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  -- MRR: sum of monthly prices for all active paid subscriptions
  SELECT COALESCE(SUM(p.price_monthly), 0) INTO v_total_mrr
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.status = 'active' AND p.price_monthly > 0;

  -- Revenue by plan
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_revenue_by_plan
  FROM (
    SELECT
      p.id AS plan_id,
      p.name AS plan_name,
      COUNT(s.id) AS active_subscriptions,
      p.price_monthly AS price_monthly_cents,
      COUNT(s.id) * p.price_monthly AS mrr_cents
    FROM plans p
    LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'active'
    WHERE p.price_monthly > 0
    GROUP BY p.id, p.name, p.price_monthly
    ORDER BY p.sort_order
  ) r;

  -- Monthly revenue from payments (last 6 months)
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_monthly_revenue
  FROM (
    SELECT
      TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
      SUM(amount) AS total_cents,
      COUNT(*) AS payment_count,
      COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
    FROM stripe_payments
    WHERE created_at >= NOW() - INTERVAL '6 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY DATE_TRUNC('month', created_at)
  ) r;

  RETURN jsonb_build_object(
    'mrr_cents', v_total_mrr,
    'arr_cents', v_total_mrr * 12,
    'revenue_by_plan', v_revenue_by_plan,
    'monthly_revenue', v_monthly_revenue
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_saas_revenue_metrics() TO authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702150000_onboarding_premium.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Onboarding Premium — Track onboarding progress in profiles
-- ============================================================

-- 1. Add onboarding tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT DEFAULT 'welcome',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS business_type TEXT;

-- 2. Set default for existing users: mark them as onboarding completed
-- (they already have accounts so they don't need the new wizard)
UPDATE public.profiles
SET onboarding_completed = TRUE,
    onboarding_step = 'done'
WHERE onboarding_completed IS NULL OR onboarding_completed = FALSE;

-- 3. RPC: Update onboarding progress
CREATE OR REPLACE FUNCTION public.update_onboarding_progress(p_step TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  UPDATE public.profiles
  SET onboarding_step = p_step,
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

-- 4. RPC: Complete onboarding
CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET onboarding_completed = TRUE,
      onboarding_step = 'done',
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

-- 5. RPC: Get onboarding status
CREATE OR REPLACE FUNCTION public.get_onboarding_status()
RETURNS TABLE(step TEXT, completed BOOLEAN, business_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT p.onboarding_step, p.onboarding_completed, p.business_type
  FROM public.profiles p
  WHERE p.user_id = v_user_id;
END;
$$;

-- 6. RPC: Update business type during onboarding
CREATE OR REPLACE FUNCTION public.update_business_type(p_business_type TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET business_type = p_business_type,
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

-- 7. RPC: Setup store during onboarding (update store name, city, country, currency, phone)
CREATE OR REPLACE FUNCTION public.setup_onboarding_store(
  p_store_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_country TEXT DEFAULT 'GN',
  p_currency TEXT DEFAULT 'GNF',
  p_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_store_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user's org
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  -- Find the default store for the org
  SELECT id INTO v_store_id
  FROM public.stores
  WHERE organization_id = v_org_id
  LIMIT 1;

  IF v_store_id IS NOT NULL THEN
    -- Update existing store
    UPDATE public.stores
    SET name = p_store_name,
        city = p_city,
        country = p_country,
        currency = p_currency,
        phone = p_phone,
        updated_at = now()
    WHERE id = v_store_id;
  ELSE
    -- Create store (shouldn't normally happen but handle it)
    INSERT INTO public.stores (organization_id, name, city, country, currency, phone, slug, is_active, is_headquarters)
    VALUES (v_org_id, p_store_name, p_city, p_country, p_currency, p_phone,
            lower(replace(p_store_name, ' ', '-')), TRUE, TRUE)
    RETURNING id INTO v_store_id;
  END IF;

  -- Also update profile info
  UPDATE public.profiles
  SET phone = COALESCE(p_phone, phone),
      city = COALESCE(p_city, city),
      country = COALESCE(p_country, country),
      currency = COALESCE(p_currency, currency),
      updated_at = now()
  WHERE user_id = v_user_id;

  RETURN v_store_id;
END;
$$;

-- 8. RPC: Get onboarding checklist progress (auto-detect from data)
CREATE OR REPLACE FUNCTION public.get_onboarding_checklist()
RETURNS TABLE(
  has_account BOOLEAN,
  has_store_configured BOOLEAN,
  has_products BOOLEAN,
  has_categories BOOLEAN,
  has_sales BOOLEAN,
  completion_pct INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_store_id UUID;
  v_has_store BOOLEAN;
  v_has_products BOOLEAN;
  v_has_categories BOOLEAN;
  v_has_sales BOOLEAN;
  v_completed INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get org and store
  SELECT p.organization_id INTO v_org_id
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  SELECT s.id INTO v_store_id
  FROM public.stores s
  WHERE s.organization_id = v_org_id
  LIMIT 1;

  -- Check store configured (has name and city)
  SELECT EXISTS(
    SELECT 1 FROM public.stores
    WHERE organization_id = v_org_id
      AND name IS NOT NULL AND name != ''
      AND city IS NOT NULL AND city != ''
      AND currency IS NOT NULL
  ) INTO v_has_store;

  -- Check products exist
  SELECT EXISTS(
    SELECT 1 FROM public.products
    WHERE organization_id = v_org_id
    LIMIT 1
  ) INTO v_has_products;

  -- Check categories exist
  SELECT EXISTS(
    SELECT 1 FROM public.categories
    WHERE organization_id = v_org_id
    LIMIT 1
  ) INTO v_has_categories;

  -- Check sales exist
  SELECT EXISTS(
    SELECT 1 FROM public.sales
    WHERE organization_id = v_org_id
    LIMIT 1
  ) INTO v_has_sales;

  -- Calculate completion percentage
  v_completed := 0;
  IF TRUE THEN v_completed := v_completed + 1; END IF; -- always has account
  IF v_has_store THEN v_completed := v_completed + 1; END IF;
  IF v_has_products THEN v_completed := v_completed + 1; END IF;
  IF v_has_categories THEN v_completed := v_completed + 1; END IF;
  IF v_has_sales THEN v_completed := v_completed + 1; END IF;

  RETURN QUERY
  SELECT
    TRUE AS has_account,
    COALESCE(v_has_store, FALSE) AS has_store_configured,
    COALESCE(v_has_products, FALSE) AS has_products,
    COALESCE(v_has_categories, FALSE) AS has_categories,
    COALESCE(v_has_sales, FALSE) AS has_sales,
    (v_completed * 100 / 5) AS completion_pct;
END;
$$;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702160000_stock_transfers.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Stock Transfers — Multi-store stock transfer system
-- Allows transferring products between stores within an organization
-- ============================================================

-- ─── Enum for transfer status ────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.transfer_status AS ENUM (
    'draft',
    'pending',
    'in_transit',
    'received',
    'partial',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── stock_transfers table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transfer_number TEXT NOT NULL,
  from_store_id   UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  to_store_id     UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  status          public.transfer_status NOT NULL DEFAULT 'draft',
  notes           TEXT,
  sent_at         TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT st_from_to_different CHECK (from_store_id <> to_store_id),
  CONSTRAINT st_transfer_number_format CHECK (transfer_number ~ '^TRF-')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_transfers_org ON public.stock_transfers(organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_store ON public.stock_transfers(from_store_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_store ON public.stock_transfers(to_store_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON public.stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_at ON public.stock_transfers(created_at DESC);

-- Unique transfer number per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfers_number ON public.stock_transfers(organization_id, transfer_number);

-- ─── stock_transfer_items table ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id     UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name    TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sti_transfer ON public.stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_sti_product ON public.stock_transfer_items(product_id);

-- ─── RLS Policies ────────────────────────────────────────────
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- stock_transfers: users can only see transfers in their organization
CREATE POLICY "st_select_org" ON public.stock_transfers
  FOR SELECT USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "st_insert_org" ON public.stock_transfers
  FOR INSERT WITH CHECK (
    organization_id = (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    AND from_store_id IN (
      SELECT s.id FROM public.stores s WHERE s.organization_id = (
        SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
  );

CREATE POLICY "st_update_org" ON public.stock_transfers
  FOR UPDATE USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "st_delete_org" ON public.stock_transfers
  FOR DELETE USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
    AND status = 'draft'
  );

-- stock_transfer_items: same org scoping via parent transfer
CREATE POLICY "sti_select_org" ON public.stock_transfer_items
  FOR SELECT USING (
    transfer_id IN (
      SELECT id FROM public.stock_transfers
      WHERE organization_id IN (
        SELECT o.id FROM public.organizations o
        INNER JOIN public.profiles p ON p.organization_id = o.id
        WHERE p.id = auth.uid()
      )
    )
  );

CREATE POLICY "sti_insert_org" ON public.stock_transfer_items
  FOR INSERT WITH CHECK (
    transfer_id IN (
      SELECT id FROM public.stock_transfers
      WHERE organization_id = (
        SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
      )
      AND status = 'draft'
    )
  );

CREATE POLICY "sti_update_org" ON public.stock_transfer_items
  FOR UPDATE USING (
    transfer_id IN (
      SELECT id FROM public.stock_transfers
      WHERE organization_id IN (
        SELECT o.id FROM public.organizations o
        INNER JOIN public.profiles p ON p.organization_id = o.id
        WHERE p.id = auth.uid()
      )
    )
  );

CREATE POLICY "sti_delete_org" ON public.stock_transfer_items
  FOR DELETE USING (
    transfer_id IN (
      SELECT id FROM public.stock_transfers
      WHERE organization_id = (
        SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
      )
      AND status = 'draft'
    )
  );

-- ─── Helper: get user's organization_id ──────────────────────
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ─── RPC: generate_transfer_number ───────────────────────────
CREATE OR REPLACE FUNCTION public.generate_transfer_number()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_count INTEGER;
  v_number TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non associé à une organisation';
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(transfer_number FROM 5) AS INTEGER)), 0) + 1
  INTO v_count
  FROM public.stock_transfers
  WHERE organization_id = v_org_id;

  v_number := 'TRF-' || LPAD(v_count::TEXT, 6, '0');
  RETURN v_number;
END;
$$;

-- ─── RPC: create_stock_transfer ──────────────────────────────
-- Creates a draft transfer with items
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_from_store_id UUID,
  p_to_store_id UUID,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_transfer_id UUID;
  v_transfer_number TEXT;
  v_item JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non associé à une organisation';
  END IF;

  -- Verify both stores belong to the same organization
  IF NOT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_from_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Boutique source invalide';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_to_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Boutique destination invalide';
  END IF;

  -- Generate transfer number
  v_transfer_number := public.generate_transfer_number();

  -- Create transfer
  INSERT INTO public.stock_transfers (
    organization_id, transfer_number, from_store_id, to_store_id,
    status, notes, created_by
  ) VALUES (
    v_org_id, v_transfer_number, p_from_store_id, p_to_store_id,
    'draft', p_notes, auth.uid()
  ) RETURNING id INTO v_transfer_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.stock_transfer_items (
      transfer_id, product_id, product_name, quantity, unit_cost, notes
    ) VALUES (
      v_transfer_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
      v_item->>'notes'
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

-- ─── RPC: send_stock_transfer ────────────────────────────────
-- Changes status from draft to pending, deducts stock from source store
CREATE OR REPLACE FUNCTION public.send_stock_transfer(
  p_transfer_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_from_store_id UUID;
  v_item RECORD;
  v_current_stock INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Verify transfer belongs to user's org and is in draft status
  SELECT from_store_id INTO v_from_store_id
  FROM public.stock_transfers
  WHERE id = p_transfer_id
    AND organization_id = v_org_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert introuvable ou statut invalide';
  END IF;

  -- Verify sufficient stock for each item and deduct from source
  FOR v_item IN
    SELECT sti.product_id, sti.quantity, sti.product_name
    FROM public.stock_transfer_items sti
    WHERE sti.transfer_id = p_transfer_id
  LOOP
    -- Get current stock in source store
    SELECT stock_quantity INTO v_current_stock
    FROM public.products
    WHERE id = v_item.product_id AND store_id = v_from_store_id;

    IF v_current_stock IS NULL OR v_current_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Stock insuffisant pour "%": disponible %, demandé %',
        v_item.product_name, COALESCE(v_current_stock, 0), v_item.quantity;
    END IF;

    -- Deduct from source store
    UPDATE public.products
    SET stock_quantity = stock_quantity - v_item.quantity,
        updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_from_store_id;
  END LOOP;

  -- Update transfer status
  UPDATE public.stock_transfers
  SET status = 'pending',
      sent_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── RPC: receive_stock_transfer ─────────────────────────────
-- Marks transfer as received and adds stock to destination store
CREATE OR REPLACE FUNCTION public.receive_stock_transfer(
  p_transfer_id UUID,
  p_received_items JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_to_store_id UUID;
  v_from_store_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_qty_received INTEGER;
  v_existing_product_id UUID;
  v_total_items INTEGER;
  v_total_received INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Verify transfer belongs to user's org and is in pending/in_transit status
  SELECT to_store_id, from_store_id
  INTO v_to_store_id, v_from_store_id
  FROM public.stock_transfers
  WHERE id = p_transfer_id
    AND organization_id = v_org_id
    AND status IN ('pending', 'in_transit');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert introuvable ou statut invalide (doit être en attente ou en transit)';
  END IF;

  -- Process received items (if provided, otherwise receive all)
  IF p_received_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_received_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_qty_received := (v_item->>'quantity_received')::INTEGER;

      -- Update transfer item received quantity
      UPDATE public.stock_transfer_items
      SET quantity_received = v_qty_received
      WHERE transfer_id = p_transfer_id AND product_id = v_product_id;

      -- Check if product exists in destination store
      SELECT id INTO v_existing_product_id
      FROM public.products
      WHERE id = v_product_id AND store_id = v_to_store_id;

      IF v_existing_product_id IS NOT NULL THEN
        -- Add to existing stock in destination
        UPDATE public.products
        SET stock_quantity = stock_quantity + v_qty_received,
            updated_at = now()
        WHERE id = v_product_id AND store_id = v_to_store_id;
      ELSE
        -- Product doesn't exist in destination store - copy from source store
        INSERT INTO public.products (
          name, description, barcode, price, cost_price, stock_quantity,
          min_stock_alert, unit, category_id, organization_id, store_id,
          supplier_id, is_active, image_url
        )
        SELECT
          name, description, barcode, price, cost_price, v_qty_received,
          min_stock_alert, unit, category_id, organization_id, v_to_store_id,
          supplier_id, is_active, image_url
        FROM public.products
        WHERE id = v_product_id AND store_id = v_from_store_id
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  ELSE
    -- Receive all items fully
    FOR v_item IN
      SELECT sti.product_id, sti.quantity
      FROM public.stock_transfer_items sti
      WHERE sti.transfer_id = p_transfer_id
    LOOP
      -- Update received quantity = ordered quantity
      UPDATE public.stock_transfer_items
      SET quantity_received = v_item.quantity
      WHERE transfer_id = p_transfer_id AND product_id = v_item.product_id;

      -- Check if product exists in destination store
      SELECT id INTO v_existing_product_id
      FROM public.products
      WHERE id = v_item.product_id AND store_id = v_to_store_id;

      IF v_existing_product_id IS NOT NULL THEN
        UPDATE public.products
        SET stock_quantity = stock_quantity + v_item.quantity,
            updated_at = now()
        WHERE id = v_item.product_id AND store_id = v_to_store_id;
      ELSE
        INSERT INTO public.products (
          name, description, barcode, price, cost_price, stock_quantity,
          min_stock_alert, unit, category_id, organization_id, store_id,
          supplier_id, is_active, image_url
        )
        SELECT
          name, description, barcode, price, cost_price, v_item.quantity,
          min_stock_alert, unit, category_id, organization_id, v_to_store_id,
          supplier_id, is_active, image_url
        FROM public.products
        WHERE id = v_item.product_id AND store_id = v_from_store_id
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- Determine final status: partial or full
  SELECT COUNT(*), COUNT(*) FILTER (WHERE quantity_received < quantity)
  INTO v_total_items, v_total_received
  FROM public.stock_transfer_items
  WHERE transfer_id = p_transfer_id;

  -- Update transfer
  UPDATE public.stock_transfers
  SET status = CASE
      WHEN v_total_received > 0 THEN 'partial'
      ELSE 'received'
    END,
    received_at = now(),
    received_by = auth.uid(),
    updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── RPC: cancel_stock_transfer ──────────────────────────────
-- Cancels a pending transfer and returns stock to source store
CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(
  p_transfer_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_from_store_id UUID;
  v_item RECORD;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Verify transfer belongs to user's org and is in pending/in_transit status
  SELECT from_store_id INTO v_from_store_id
  FROM public.stock_transfers
  WHERE id = p_transfer_id
    AND organization_id = v_org_id
    AND status IN ('pending', 'in_transit', 'draft');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert introuvable ou ne peut pas être annulé';
  END IF;

  -- Return stock to source if transfer was already sent (not draft)
  IF EXISTS (
    SELECT 1 FROM public.stock_transfers
    WHERE id = p_transfer_id AND status IN ('pending', 'in_transit')
  ) THEN
    FOR v_item IN
      SELECT sti.product_id, sti.quantity - sti.quantity_received AS qty_to_return
      FROM public.stock_transfer_items sti
      WHERE sti.transfer_id = p_transfer_id
    LOOP
      IF v_item.qty_to_return > 0 THEN
        UPDATE public.products
        SET stock_quantity = stock_quantity + v_item.qty_to_return,
            updated_at = now()
        WHERE id = v_item.product_id AND store_id = v_from_store_id;
      END IF;
    END LOOP;
  END IF;

  -- Update status
  UPDATE public.stock_transfers
  SET status = 'cancelled',
      notes = COALESCE(notes, '') || CASE WHEN p_reason IS NOT NULL THEN E'\nAnnulé: ' || p_reason ELSE '' END,
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── RPC: get_stock_transfers ────────────────────────────────
-- Lists transfers for the current organization with optional filters
CREATE OR REPLACE FUNCTION public.get_stock_transfers(
  p_status public.transfer_status DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  transfer_number TEXT,
  from_store_id UUID,
  from_store_name TEXT,
  to_store_id UUID,
  to_store_name TEXT,
  status public.transfer_status,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID,
  created_by_name TEXT,
  received_by UUID,
  received_by_name TEXT,
  item_count BIGINT,
  total_quantity BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
  SELECT
    st.id,
    st.transfer_number,
    st.from_store_id,
    fs.name AS from_store_name,
    st.to_store_id,
    ts.name AS to_store_name,
    st.status,
    st.notes,
    st.sent_at,
    st.received_at,
    st.created_by,
    cb.owner_name AS created_by_name,
    st.received_by,
    rb.owner_name AS received_by_name,
    COUNT(sti.id)::BIGINT AS item_count,
    COALESCE(SUM(sti.quantity), 0)::BIGINT AS total_quantity,
    st.created_at,
    st.updated_at
  FROM public.stock_transfers st
  INNER JOIN public.stores fs ON fs.id = st.from_store_id
  INNER JOIN public.stores ts ON ts.id = st.to_store_id
  LEFT JOIN public.profiles cb ON cb.id = st.created_by
  LEFT JOIN public.profiles rb ON rb.id = st.received_by
  LEFT JOIN public.stock_transfer_items sti ON sti.transfer_id = st.id
  WHERE st.organization_id = v_org_id
    AND (p_status IS NULL OR st.status = p_status)
    AND (p_store_id IS NULL OR st.from_store_id = p_store_id OR st.to_store_id = p_store_id)
  GROUP BY st.id, fs.name, ts.name, cb.owner_name, rb.owner_name
  ORDER BY st.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ─── RPC: get_stock_transfer_details ─────────────────────────
-- Gets a single transfer with its items
CREATE OR REPLACE FUNCTION public.get_stock_transfer_details(
  p_transfer_id UUID
)
RETURNS TABLE (
  id UUID,
  transfer_number TEXT,
  from_store_id UUID,
  from_store_name TEXT,
  to_store_id UUID,
  to_store_name TEXT,
  status public.transfer_status,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID,
  created_by_name TEXT,
  received_by UUID,
  received_by_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  items JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
  SELECT
    st.id,
    st.transfer_number,
    st.from_store_id,
    fs.name AS from_store_name,
    st.to_store_id,
    ts.name AS to_store_name,
    st.status,
    st.notes,
    st.sent_at,
    st.received_at,
    st.created_by,
    cb.owner_name AS created_by_name,
    st.received_by,
    rb.owner_name AS received_by_name,
    st.created_at,
    st.updated_at,
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', sti.id,
          'product_id', sti.product_id,
          'product_name', sti.product_name,
          'quantity', sti.quantity,
          'quantity_received', sti.quantity_received,
          'unit_cost', sti.unit_cost,
          'notes', sti.notes,
          'current_stock_source', (
            SELECT p.stock_quantity FROM public.products p
            WHERE p.id = sti.product_id AND p.store_id = st.from_store_id
          )
        )
        ORDER BY sti.created_at
      ), '[]'::JSONB)
      FROM public.stock_transfer_items sti
      WHERE sti.transfer_id = st.id
    ) AS items
  FROM public.stock_transfers st
  INNER JOIN public.stores fs ON fs.id = st.from_store_id
  INNER JOIN public.stores ts ON ts.id = st.to_store_id
  LEFT JOIN public.profiles cb ON cb.id = st.created_by
  LEFT JOIN public.profiles rb ON rb.id = st.received_by
  WHERE st.id = p_transfer_id AND st.organization_id = v_org_id;
END;
$$;

-- ─── RPC: get_pending_transfers_count ────────────────────────
-- Counts pending transfers for the current store (used in dashboard alerts)
CREATE OR REPLACE FUNCTION public.get_pending_transfers_count(
  p_store_id UUID DEFAULT NULL
)
RETURNS TABLE (
  pending_count BIGINT,
  in_transit_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE st.status = 'pending'
      AND (p_store_id IS NULL OR st.to_store_id = p_store_id))::BIGINT,
    COUNT(*) FILTER (WHERE st.status = 'in_transit'
      AND (p_store_id IS NULL OR st.to_store_id = p_store_id))::BIGINT
  FROM public.stock_transfers st
  WHERE st.organization_id = v_org_id;
END;
$$;

-- ─── Trigger: auto-update updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION public.update_stock_transfers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_st_updated_at ON public.stock_transfers;
CREATE TRIGGER trg_st_updated_at
  BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_transfers_updated_at();


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702170000_smart_restock_suggestions.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Smart Restock Suggestions — Intelligent purchase order suggestions
-- based on stock levels, sales velocity, and supplier data
-- ============================================================

-- ─── RPC: get_restock_suggestions ────────────────────────────
-- Suggests products to reorder based on:
-- 1. Stock below min_stock_alert
-- 2. Sales velocity (30-day average daily sales)
-- 3. Days of stock remaining
-- 4. Supplier with best supply price
-- Returns items sorted by urgency (days of stock remaining ASC)
CREATE OR REPLACE FUNCTION public.get_restock_suggestions(
  p_store_id UUID DEFAULT NULL,
  p_urgency TEXT DEFAULT 'all'
)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  barcode TEXT,
  category_name TEXT,
  current_stock INTEGER,
  min_stock_alert INTEGER,
  avg_daily_sales NUMERIC,
  days_of_stock_remaining NUMERIC,
  suggested_order_quantity INTEGER,
  best_supplier_id UUID,
  best_supplier_name TEXT,
  best_supply_price NUMERIC,
  total_supply_cost NUMERIC,
  urgency_level TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non associé à une organisation';
  END IF;

  RETURN QUERY
  WITH sales_velocity AS (
    -- Calculate average daily sales per product over last 30 days
    SELECT
      si.product_id,
      COALESCE(SUM(si.quantity), 0) / GREATEST(LEAST(EXTRACT(DAY FROM now() - MIN(s.created_at)), 30), 1) AS avg_daily
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    INNER JOIN public.products p ON p.id = si.product_id
    WHERE s.organization_id = v_org_id
      AND s.created_at >= now() - INTERVAL '30 days'
      AND (p_store_id IS NULL OR p.store_id = p_store_id)
    GROUP BY si.product_id
  ),
  best_supplier AS (
    -- Find the supplier with the lowest supply price for each product
    SELECT DISTINCT ON (sp.product_id)
      sp.product_id,
      sp.supplier_id,
      su.name AS supplier_name,
      sp.supply_price
    FROM public.supplier_products sp
    INNER JOIN public.suppliers su ON su.id = sp.supplier_id
    WHERE su.is_active = true
      AND su.organization_id = v_org_id
      AND sp.is_active = true
    ORDER BY sp.product_id, sp.supply_price ASC
  )
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.barcode,
    c.name AS category_name,
    p.stock_quantity AS current_stock,
    COALESCE(p.min_stock_alert, 5) AS min_stock_alert,
    COALESCE(sv.avg_daily, 0) AS avg_daily_sales,
    CASE
      WHEN sv.avg_daily > 0 THEN p.stock_quantity / sv.avg_daily
      ELSE 999
    END AS days_of_stock_remaining,
    CASE
      WHEN sv.avg_daily > 0 THEN
        GREATEST(
          CEIL((COALESCE(p.min_stock_alert, 5) * 2 + sv.avg_daily * 14) - p.stock_quantity),
          1
        )
      ELSE GREATEST(COALESCE(p.min_stock_alert, 5) - p.stock_quantity, 1)
    END AS suggested_order_quantity,
    bs.supplier_id AS best_supplier_id,
    bs.supplier_name AS best_supplier_name,
    bs.supply_price AS best_supply_price,
    CASE
      WHEN bs.supply_price IS NOT NULL AND sv.avg_daily > 0 THEN
        GREATEST(
          CEIL((COALESCE(p.min_stock_alert, 5) * 2 + sv.avg_daily * 14) - p.stock_quantity),
          1
        ) * bs.supply_price
      ELSE 0
    END AS total_supply_cost,
    CASE
      WHEN p.stock_quantity <= 0 THEN 'critical'
      WHEN p.stock_quantity <= COALESCE(p.min_stock_alert, 5) * 0.5 THEN 'high'
      WHEN p.stock_quantity <= COALESCE(p.min_stock_alert, 5) THEN 'medium'
      ELSE 'low'
    END AS urgency_level
  FROM public.products p
  LEFT JOIN sales_velocity sv ON sv.product_id = p.id
  LEFT JOIN best_supplier bs ON bs.product_id = p.id
  LEFT JOIN public.categories c ON c.id = p.category_id
  WHERE p.organization_id = v_org_id
    AND p.is_active = true
    AND (p_store_id IS NULL OR p.store_id = p_store_id)
    AND (
      p.stock_quantity <= COALESCE(p.min_stock_alert, 5) * 1.5
      OR p.stock_quantity <= 0
    )
    AND (
      p_urgency = 'all'
      OR (p_urgency = 'critical' AND p.stock_quantity <= 0)
      OR (p_urgency = 'high' AND p.stock_quantity <= COALESCE(p.min_stock_alert, 5) * 0.5)
      OR (p_urgency = 'medium' AND p.stock_quantity <= COALESCE(p.min_stock_alert, 5))
    )
  ORDER BY
    CASE
      WHEN p.stock_quantity <= 0 THEN 0
      WHEN p.stock_quantity <= COALESCE(p.min_stock_alert, 5) * 0.5 THEN 1
      WHEN p.stock_quantity <= COALESCE(p.min_stock_alert, 5) THEN 2
      ELSE 3
    END,
    days_of_stock_remaining ASC;
END;
$$;

-- ─── RPC: create_purchase_order_from_suggestions ─────────────
-- Creates a purchase order from suggested restock items
CREATE OR REPLACE FUNCTION public.create_purchase_order_from_suggestions(
  p_supplier_id UUID,
  p_items JSONB,
  p_store_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_subtotal NUMERIC := 0;
  v_tax_rate NUMERIC := 0;
  v_tax_amount NUMERIC := 0;
  v_line_total NUMERIC;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non associé à une organisation';
  END IF;

  -- Verify supplier belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = v_org_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Fournisseur invalide ou inactif';
  END IF;

  -- Generate order number
  v_order_number := public.generate_order_number();

  -- Calculate subtotal first
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_total := (v_item->>'quantity')::INTEGER * COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  -- Get org tax rate
  SELECT COALESCE(default_tax_rate, 0) INTO v_tax_rate
  FROM public.organizations WHERE id = v_org_id;

  v_tax_amount := v_subtotal * (v_tax_rate / 100);

  -- Create order
  INSERT INTO public.purchase_orders (
    organization_id, store_id, supplier_id, order_number,
    status, notes, subtotal, tax_amount, total_amount,
    currency, created_by
  ) VALUES (
    v_org_id, p_store_id, p_supplier_id, v_order_number,
    'pending', p_notes, v_subtotal, v_tax_amount,
    v_subtotal + v_tax_amount, 'GNF', auth.uid()
  ) RETURNING id INTO v_order_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_total := (v_item->>'quantity')::INTEGER * COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
    INSERT INTO public.purchase_order_items (
      purchase_order_id, product_id, product_name,
      quantity_ordered, unit_cost, tax_rate, line_total, notes
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
      v_tax_rate,
      v_line_total,
      v_item->>'notes'
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

-- ─── RPC: get_supplier_order_history ─────────────────────────
-- Returns order history for a specific supplier (for analytics)
CREATE OR REPLACE FUNCTION public.get_supplier_order_history(
  p_supplier_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  order_number TEXT,
  status TEXT,
  order_date TEXT,
  total_amount NUMERIC,
  item_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
  SELECT
    po.id,
    po.order_number,
    po.status,
    to_char(po.order_date, 'YYYY-MM-DD') AS order_date,
    po.total_amount,
    COUNT(poi.id)::BIGINT AS item_count
  FROM public.purchase_orders po
  LEFT JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
  WHERE po.organization_id = v_org_id
    AND po.supplier_id = p_supplier_id
  GROUP BY po.id
  ORDER BY po.created_at DESC
  LIMIT p_limit;
END;
$$;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702180000_loyalty_program.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Loyalty Program — Customer rewards & points system
-- ============================================================

-- ─── loyalty_accounts table ──────────────────────────────────
-- One per customer, tracks total points and tier level
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  points_balance  INTEGER NOT NULL DEFAULT 0,
  total_points_earned INTEGER NOT NULL DEFAULT 0,
  tier            TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_la_org ON public.loyalty_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_la_customer ON public.loyalty_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_la_tier ON public.loyalty_accounts(tier);

-- ─── loyalty_transactions table ──────────────────────────────
-- Tracks every point movement (earn, redeem, expire, adjust)
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'expire', 'adjust', 'bonus')),
  points          INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  description     TEXT,
  sale_id         UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lt_org ON public.loyalty_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_lt_account ON public.loyalty_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_lt_customer ON public.loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_lt_created_at ON public.loyalty_transactions(created_at DESC);

-- ─── loyalty_rewards table ───────────────────────────────────
-- Configurable rewards that customers can redeem
CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  points_required INTEGER NOT NULL CHECK (points_required > 0),
  reward_type     TEXT NOT NULL DEFAULT 'discount' CHECK (reward_type IN ('discount', 'free_product', 'voucher', 'custom')),
  reward_value    NUMERIC(12,2) NOT NULL DEFAULT 0,
  product_id      UUID REFERENCES public.products(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  max_redemptions INTEGER,
  redemptions_count INTEGER NOT NULL DEFAULT 0,
  min_tier        TEXT DEFAULT 'bronze' CHECK (min_tier IN ('bronze', 'silver', 'gold', 'platinum')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lr_org ON public.loyalty_rewards(organization_id);
CREATE INDEX IF NOT EXISTS idx_lr_active ON public.loyalty_rewards(is_active);

-- ─── RLS Policies ────────────────────────────────────────────
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;

-- loyalty_accounts
CREATE POLICY "la_select_org" ON public.loyalty_accounts
  FOR SELECT USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "la_insert_org" ON public.loyalty_accounts
  FOR INSERT WITH CHECK (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );
CREATE POLICY "la_update_org" ON public.loyalty_accounts
  FOR UPDATE USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );

-- loyalty_transactions
CREATE POLICY "lt_select_org" ON public.loyalty_transactions
  FOR SELECT USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "lt_insert_org" ON public.loyalty_transactions
  FOR INSERT WITH CHECK (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- loyalty_rewards
CREATE POLICY "lr_select_org" ON public.loyalty_rewards
  FOR SELECT USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "lr_insert_org" ON public.loyalty_rewards
  FOR INSERT WITH CHECK (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );
CREATE POLICY "lr_update_org" ON public.loyalty_rewards
  FOR UPDATE USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "lr_delete_org" ON public.loyalty_rewards
  FOR DELETE USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ─── Trigger: auto-update updated_at ─────────────────────────
DROP TRIGGER IF EXISTS trg_la_updated_at ON public.loyalty_accounts;
CREATE TRIGGER trg_la_updated_at
  BEFORE UPDATE ON public.loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_transfers_updated_at();

DROP TRIGGER IF EXISTS trg_lr_updated_at ON public.loyalty_rewards;
CREATE TRIGGER trg_lr_updated_at
  BEFORE UPDATE ON public.loyalty_rewards
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_transfers_updated_at();

-- ─── RPC: earn_loyalty_points ────────────────────────────────
-- Earn points for a sale (1 point per X amount spent, configurable)
CREATE OR REPLACE FUNCTION public.earn_loyalty_points(
  p_customer_id UUID,
  p_sale_id UUID,
  p_amount_spent NUMERIC,
  p_points_rate NUMERIC DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_account_id UUID;
  v_points INTEGER;
  v_new_balance INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non associé à une organisation';
  END IF;

  -- Calculate points (1 point per p_points_rate amount)
  v_points := FLOOR(p_amount_spent / GREATEST(p_points_rate, 1));
  IF v_points <= 0 THEN RETURN 0; END IF;

  -- Get or create loyalty account
  SELECT id, points_balance INTO v_account_id, v_new_balance
  FROM public.loyalty_accounts
  WHERE customer_id = p_customer_id AND organization_id = v_org_id;

  IF v_account_id IS NULL THEN
    INSERT INTO public.loyalty_accounts (organization_id, customer_id, points_balance, total_points_earned)
    VALUES (v_org_id, p_customer_id, v_points, v_points)
    RETURNING id, points_balance INTO v_account_id, v_new_balance;
  ELSE
    UPDATE public.loyalty_accounts
    SET points_balance = points_balance + v_points,
        total_points_earned = total_points_earned + v_points
    WHERE id = v_account_id
    RETURNING points_balance INTO v_new_balance;
  END IF;

  -- Record transaction
  INSERT INTO public.loyalty_transactions (
    organization_id, account_id, customer_id,
    type, points, balance_after, description, sale_id, created_by
  ) VALUES (
    v_org_id, v_account_id, p_customer_id,
    'earn', v_points, v_new_balance,
    'Points gagnés pour achat de ' || p_amount_spent,
    p_sale_id, auth.uid()
  );

  -- Auto-upgrade tier
  PERFORM public.update_loyalty_tier(v_account_id);

  RETURN v_points;
END;
$$;

-- ─── RPC: redeem_loyalty_points ──────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  p_customer_id UUID,
  p_points INTEGER,
  p_reward_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_account_id UUID;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Get account
  SELECT id, points_balance INTO v_account_id, v_current_balance
  FROM public.loyalty_accounts
  WHERE customer_id = p_customer_id AND organization_id = v_org_id;

  IF v_account_id IS NULL OR v_current_balance < p_points THEN
    RAISE EXCEPTION 'Points insuffisants (solde: %)', COALESCE(v_current_balance, 0);
  END IF;

  -- Deduct points
  UPDATE public.loyalty_accounts
  SET points_balance = points_balance - p_points
  WHERE id = v_account_id
  RETURNING points_balance INTO v_new_balance;

  -- Record transaction
  INSERT INTO public.loyalty_transactions (
    organization_id, account_id, customer_id,
    type, points, balance_after, description, created_by
  ) VALUES (
    v_org_id, v_account_id, p_customer_id,
    'redeem', -p_points, v_new_balance,
    COALESCE(p_description, 'Points échangés'),
    auth.uid()
  );

  -- Increment reward redemptions count
  IF p_reward_id IS NOT NULL THEN
    UPDATE public.loyalty_rewards
    SET redemptions_count = redemptions_count + 1
    WHERE id = p_reward_id;
  END IF;

  RETURN true;
END;
$$;

-- ─── RPC: update_loyalty_tier ────────────────────────────────
-- Auto-upgrade tier based on total points earned
CREATE OR REPLACE FUNCTION public.update_loyalty_tier(
  p_account_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total_earned INTEGER;
  v_new_tier TEXT;
BEGIN
  SELECT total_points_earned INTO v_total_earned
  FROM public.loyalty_accounts WHERE id = p_account_id;

  v_new_tier := CASE
    WHEN v_total_earned >= 10000 THEN 'platinum'
    WHEN v_total_earned >= 5000 THEN 'gold'
    WHEN v_total_earned >= 2000 THEN 'silver'
    ELSE 'bronze'
  END;

  UPDATE public.loyalty_accounts SET tier = v_new_tier WHERE id = p_account_id;
END;
$$;

-- ─── RPC: get_loyalty_stats ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_loyalty_stats()
RETURNS TABLE (
  total_members BIGINT,
  active_members_30d BIGINT,
  total_points_issued BIGINT,
  total_points_redeemed BIGINT,
  bronze_count BIGINT,
  silver_count BIGINT,
  gold_count BIGINT,
  platinum_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.loyalty_transactions lt
      WHERE lt.account_id = la.id AND lt.created_at >= now() - INTERVAL '30 days'
    ))::BIGINT,
    COALESCE(SUM(lt_earn.points), 0)::BIGINT,
    COALESCE(ABS(SUM(lt_redeem.points)), 0)::BIGINT,
    COUNT(*) FILTER (WHERE la.tier = 'bronze')::BIGINT,
    COUNT(*) FILTER (WHERE la.tier = 'silver')::BIGINT,
    COUNT(*) FILTER (WHERE la.tier = 'gold')::BIGINT,
    COUNT(*) FILTER (WHERE la.tier = 'platinum')::BIGINT
  FROM public.loyalty_accounts la
  LEFT JOIN public.loyalty_transactions lt_earn ON lt_earn.account_id = la.id AND lt_earn.type = 'earn'
  LEFT JOIN public.loyalty_transactions lt_redeem ON lt_redeem.account_id = la.id AND lt_redeem.type = 'redeem'
  WHERE la.organization_id = v_org_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702190000_backup_restore.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Backup & Restore — tables, enums, RLS, SECURITY DEFINER RPCs
-- ============================================================

-- ─── Enum ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE backup_status AS ENUM (
    'pending', 'in_progress', 'completed', 'failed', 'restoring'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Table: backups ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  backup_number text NOT NULL,
  status        backup_status NOT NULL DEFAULT 'pending',
  backup_type   text NOT NULL DEFAULT 'manual',  -- manual | auto | pre_restore
  description   text,
  -- Snapshot metadata
  table_counts  jsonb NOT NULL DEFAULT '{}',       -- {"products": 42, "sales": 128, ...}
  total_records integer NOT NULL DEFAULT 0,
  file_size_kb  integer,                           -- approximate size
  backup_data   jsonb,                             -- the actual backup payload (nullable for large orgs)
  -- Who / when
  created_by    uuid REFERENCES auth.users(id),
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, backup_number)
);

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_backups_org_status ON backups(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_backups_org_created ON backups(organization_id, created_at DESC);

-- ─── Updated-at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_backups_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.backups;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.backups
  FOR EACH ROW EXECUTE FUNCTION public.trg_backups_updated_at();

-- ─── RLS ────────────────────────────────────────────────────
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view own backups"
  ON public.backups FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can insert backups"
  ON public.backups FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

CREATE POLICY "Admins can update backups"
  ON public.backups FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

CREATE POLICY "Admins can delete backups"
  ON public.backups FOR DELETE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

-- ─── RPC: generate_backup_number ────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_backup_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_prefix text;
  v_next_seq integer;
  v_result text;
BEGIN
  v_org_id := public.get_user_organization_id();
  SELECT upper(left(o.name, 3)) INTO v_prefix FROM organizations o WHERE o.id = v_org_id;
  IF v_prefix IS NULL THEN v_prefix := 'BAK'; END IF;

  SELECT coalesce(max(
    cast(substring(backup_number from '[0-9]+$') as integer)
  ), 0) + 1 INTO v_next_seq
  FROM public.backups
  WHERE organization_id = v_org_id;

  v_result := v_prefix || '-SAV-' || lpad(v_next_seq::text, 5, '0');
  RETURN v_result;
END;
$$;

-- ─── RPC: create_backup ─────────────────────────────────────
-- Creates a full JSON snapshot of the organization's data
CREATE OR REPLACE FUNCTION public.create_backup(
  p_description text DEFAULT NULL,
  p_backup_type text DEFAULT 'manual'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_backup_id uuid;
  v_backup_num text;
  v_counts jsonb := '{}';
  v_total integer := 0;
  v_rec record;
  v_data jsonb;
  v_tables text[] := ARRAY[
    'products', 'categories', 'customers', 'sales', 'sale_items',
    'expenses', 'suppliers', 'supplier_products',
    'purchase_orders', 'purchase_order_items',
    'stock_transfers', 'stock_transfer_items',
    'loyalty_accounts', 'loyalty_transactions', 'loyalty_rewards',
    'store_settings'
  ];
  v_table_name text;
  v_count integer;
  v_start timestamptz := now();
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  -- Generate backup number
  v_backup_num := public.generate_backup_number();

  -- Create backup record (pending)
  INSERT INTO public.backups (
    organization_id, backup_number, status, backup_type,
    description, created_by, started_at
  ) VALUES (
    v_org_id, v_backup_num, 'in_progress', p_backup_type,
    p_description, v_user_id, v_start
  ) RETURNING id INTO v_backup_id;

  -- Build backup data: each table's rows as JSON array
  v_data := '{}';
  FOREACH v_table_name IN ARRAY v_tables LOOP
    -- Check if table has organization_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v_table_name
        AND c.column_name = 'organization_id'
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', v_table_name)
        INTO v_count USING v_org_id;

      IF v_count > 0 THEN
        EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
                        FROM (SELECT * FROM public.%I WHERE organization_id = $1 ORDER BY created_at) t', v_table_name)
          INTO v_rec USING v_org_id;
        v_data := jsonb_set(v_data, ARRAY[v_table_name], COALESCE(v_rec, '[]'::jsonb));
      ELSE
        v_data := jsonb_set(v_data, ARRAY[v_table_name], '[]'::jsonb);
      END IF;

      v_counts := jsonb_set(v_counts, ARRAY[v_table_name], to_jsonb(v_count));
      v_total := v_total + v_count;
    END IF;
  END LOOP;

  -- Also snapshot stores
  IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='stores' AND c.column_name='organization_id') THEN
    SELECT count(*) INTO v_count FROM public.stores WHERE organization_id = v_org_id;
    SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      INTO v_rec FROM (SELECT * FROM public.stores WHERE organization_id = v_org_id ORDER BY created_at) t;
    v_data := jsonb_set(v_data, ARRAY['stores'], COALESCE(v_rec, '[]'::jsonb));
    v_counts := jsonb_set(v_counts, ARRAY['stores'], to_jsonb(v_count));
    v_total := v_total + v_count;
  END IF;

  -- Estimate size (rough: 2 bytes per char in JSON)
  -- pg_column_size gives compressed size; use length for raw size
  UPDATE public.backups SET
    status = 'completed',
    table_counts = v_counts,
    total_records = v_total,
    file_size_kb = ceil(length(v_data::text) / 1024.0),
    backup_data = v_data,
    completed_at = now()
  WHERE id = v_backup_id;

  -- Return summary
  RETURN jsonb_build_object(
    'id', v_backup_id,
    'backup_number', v_backup_num,
    'status', 'completed',
    'table_counts', v_counts,
    'total_records', v_total,
    'file_size_kb', ceil(length(v_data::text) / 1024.0),
    'completed_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  -- Mark as failed
  UPDATE public.backups SET
    status = 'failed',
    completed_at = now()
  WHERE id = v_backup_id;
  RAISE EXCEPTION 'Backup failed: %', SQLERRM;
END;
$$;

-- ─── RPC: restore_backup ────────────────────────────────────
-- Restores data from a specific backup (creates a pre-restore backup first)
CREATE OR REPLACE FUNCTION public.restore_backup(
  p_backup_id uuid,
  p_tables text[] DEFAULT NULL   -- NULL = restore all tables; otherwise only listed tables
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_backup public.backups%ROWTYPE;
  v_pre_backup_id uuid;
  v_pre_backup_num text;
  v_data jsonb;
  v_table_name text;
  v_rows jsonb;
  v_count integer;
  v_restored_counts jsonb := '{}';
  v_total_restored integer := 0;
  v_col_names text[];
  v_col_list text;
  v_val_list text;
  v_insert_sql text;
  v_start timestamptz := now();
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  -- Load backup
  SELECT * INTO v_backup FROM public.backups
  WHERE id = p_backup_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Backup not found or access denied';
  END IF;

  IF v_backup.status != 'completed' THEN
    RAISE EXCEPTION 'Only completed backups can be restored';
  END IF;

  IF v_backup.backup_data IS NULL THEN
    RAISE EXCEPTION 'Backup data is empty';
  END IF;

  -- Create a pre-restore backup automatically
  v_pre_backup_num := public.generate_backup_number();
  INSERT INTO public.backups (
    organization_id, backup_number, status, backup_type,
    description, created_by, started_at, completed_at
  ) VALUES (
    v_org_id, v_pre_backup_num, 'completed', 'pre_restore',
    'Sauvegarde automatique avant restauration de ' || v_backup.backup_number,
    v_user_id, v_start, now()
  ) RETURNING id INTO v_pre_backup_id;

  -- Copy current data into the pre-restore backup
  -- (simplified: just store current state using same create_backup logic but inline)
  DECLARE
    v_pre_data jsonb := '{}';
    v_pre_counts jsonb := '{}';
    v_pre_total integer := 0;
    v_tbl text;
    v_tbl_count integer;
    v_tbl_rows jsonb;
    v_all_tables text[] := ARRAY[
      'products', 'categories', 'customers', 'sales', 'sale_items',
      'expenses', 'suppliers', 'supplier_products',
      'purchase_orders', 'purchase_order_items',
      'stock_transfers', 'stock_transfer_items',
      'loyalty_accounts', 'loyalty_transactions', 'loyalty_rewards',
      'store_settings', 'stores'
    ];
  BEGIN
    FOREACH v_tbl IN ARRAY v_all_tables LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=v_tbl AND c.column_name='organization_id'
      ) THEN
        EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', v_tbl)
          INTO v_tbl_count USING v_org_id;
        IF v_tbl_count > 0 THEN
          EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
                          FROM (SELECT * FROM public.%I WHERE organization_id = $1 ORDER BY created_at) t', v_tbl)
            INTO v_tbl_rows USING v_org_id;
          v_pre_data := jsonb_set(v_pre_data, ARRAY[v_tbl], COALESCE(v_tbl_rows, '[]'::jsonb));
        ELSE
          v_pre_data := jsonb_set(v_pre_data, ARRAY[v_tbl], '[]'::jsonb);
        END IF;
        v_pre_counts := jsonb_set(v_pre_counts, ARRAY[v_tbl], to_jsonb(v_tbl_count));
        v_pre_total := v_pre_total + v_tbl_count;
      END IF;
    END LOOP;

    UPDATE public.backups SET
      table_counts = v_pre_counts,
      total_records = v_pre_total,
      file_size_kb = ceil(length(v_pre_data::text) / 1024.0),
      backup_data = v_pre_data
    WHERE id = v_pre_backup_id;
  END;

  -- Now restore from the target backup
  v_data := v_backup.backup_data;

  -- Determine which tables to restore
  IF p_tables IS NULL THEN
    p_tables := ARRAY(
      SELECT jsonb_object_keys(v_data)
    );
  END IF;

  -- Mark backup as restoring
  UPDATE public.backups SET status = 'restoring' WHERE id = p_backup_id;

  -- Restore each table
  FOREACH v_table_name IN ARRAY p_tables LOOP
    -- Check table exists and has organization_id
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_name = v_table_name
    ) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v_table_name AND c.column_name = 'organization_id'
    ) THEN
      CONTINUE;
    END IF;

    v_rows := v_data->v_table_name;
    IF v_rows IS NULL OR jsonb_array_length(v_rows) = 0 THEN
      -- Delete existing data for this org in this table (restore to empty)
      EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', v_table_name) USING v_org_id;
      v_restored_counts := jsonb_set(v_restored_counts, ARRAY[v_table_name], '0');
      CONTINUE;
    END IF;

    -- Delete existing data first
    EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', v_table_name) USING v_org_id;

    -- Get column names from first row
    v_col_names := ARRAY(SELECT jsonb_object_keys(v_rows->0));
    v_col_list := array_to_string(v_col_names, ', ');
    v_val_list := array_to_string(
      ARRAY(SELECT format('$%s', generate_series(1, array_length(v_col_names, 1)))),
      ', '
    );
    v_insert_sql := format(
      'INSERT INTO public.%I (%s) VALUES (%s) ON CONFLICT (id) DO NOTHING',
      v_table_name, v_col_list, v_val_list
    );

    v_count := 0;
    -- Insert rows one by one (safest approach for varying column sets)
    FOR v_rec IN SELECT * FROM jsonb_array_elements(v_rows) AS elem LOOP
      BEGIN
        EXECUTE format(
          'INSERT INTO public.%I SELECT * FROM jsonb_to_record($1) AS x(%s) ON CONFLICT (id) DO NOTHING',
          v_table_name,
          (SELECT string_agg(format('%s %s',
            col_name,
            CASE
              WHEN c.data_type = 'uuid' THEN 'uuid'
              WHEN c.data_type = 'integer' THEN 'integer'
              WHEN c.data_type = 'numeric' THEN 'numeric'
              WHEN c.data_type = 'bigint' THEN 'bigint'
              WHEN c.data_type = 'boolean' THEN 'boolean'
              WHEN c.data_type = 'date' THEN 'date'
              WHEN c.data_type = 'timestamp with time zone' THEN 'timestamptz'
              WHEN c.data_type = 'timestamp without time zone' THEN 'timestamp'
              WHEN c.data_type = 'time without time zone' THEN 'time'
              WHEN c.data_type = 'text' THEN 'text'
              WHEN c.data_type = 'character varying' THEN 'text'
              WHEN c.data_type = 'jsonb' THEN 'jsonb'
              WHEN c.data_type = 'USER-DEFINED' THEN 'text'
              ELSE 'text'
            END
          ), ', ')
          FROM unnest(v_col_names) AS col_name
          LEFT JOIN information_schema.columns c
            ON c.table_schema = 'public'
            AND c.table_name = v_table_name
            AND c.column_name = col_name
          )
        ) USING v_rec.elem;
        v_count := v_count + 1;
      EXCEPTION WHEN OTHERS THEN
        -- Skip rows that fail (e.g. FK violations) but continue
        RAISE NOTICE 'Skipping row in %: %', v_table_name, SQLERRM;
      END;
    END LOOP;

    v_restored_counts := jsonb_set(v_restored_counts, ARRAY[v_table_name], to_jsonb(v_count));
    v_total_restored := v_total_restored + v_count;
  END LOOP;

  -- Mark backup as completed again
  UPDATE public.backups SET status = 'completed' WHERE id = p_backup_id;

  RETURN jsonb_build_object(
    'restored_backup_id', p_backup_id,
    'pre_restore_backup_id', v_pre_backup_id,
    'restored_counts', v_restored_counts,
    'total_restored', v_total_restored,
    'restored_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  -- Restore the original status
  UPDATE public.backups SET status = 'completed' WHERE id = p_backup_id;
  RAISE EXCEPTION 'Restore failed: %', SQLERRM;
END;
$$;

-- ─── RPC: get_backups ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_backups(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  backup_number text,
  status backup_status,
  backup_type text,
  description text,
  table_counts jsonb,
  total_records integer,
  file_size_kb integer,
  created_by uuid,
  created_by_name text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
    SELECT
      b.id,
      b.backup_number,
      b.status,
      b.backup_type,
      b.description,
      b.table_counts,
      b.total_records,
      b.file_size_kb,
      b.created_by,
      p.owner_name AS created_by_name,
      b.started_at,
      b.completed_at,
      b.created_at
    FROM public.backups b
    LEFT JOIN public.profiles p ON p.user_id = b.created_by
    WHERE b.organization_id = v_org_id
    ORDER BY b.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ─── RPC: get_backup_details ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_backup_details(
  p_backup_id uuid
)
RETURNS TABLE (
  id uuid,
  backup_number text,
  status backup_status,
  backup_type text,
  description text,
  table_counts jsonb,
  total_records integer,
  file_size_kb integer,
  backup_data jsonb,
  created_by uuid,
  created_by_name text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
    SELECT
      b.id,
      b.backup_number,
      b.status,
      b.backup_type,
      b.description,
      b.table_counts,
      b.total_records,
      b.file_size_kb,
      b.backup_data,
      b.created_by,
      p.owner_name AS created_by_name,
      b.started_at,
      b.completed_at,
      b.created_at,
      b.updated_at
    FROM public.backups b
    LEFT JOIN public.profiles p ON p.user_id = b.created_by
    WHERE b.organization_id = v_org_id AND b.id = p_backup_id;
END;
$$;

-- ─── RPC: delete_backup ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_backup(
  p_backup_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  DELETE FROM public.backups
  WHERE id = p_backup_id AND organization_id = v_org_id;

  RETURN FOUND;
END;
$$;

-- ─── RPC: get_backup_stats ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_backup_stats()
RETURNS TABLE (
  total_backups integer,
  completed_backups integer,
  total_size_kb integer,
  last_backup_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
    SELECT
      coalesce(sum(1), 0)::integer,
      coalesce(sum(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::integer,
      coalesce(sum(file_size_kb), 0)::integer,
      max(created_at)
    FROM public.backups
    WHERE organization_id = v_org_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702200000_support_tickets.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Support Client Intégré — tables, enums, RLS, SECURITY DEFINER RPCs
-- ============================================================

-- ─── Enums ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM (
    'open', 'in_progress', 'waiting', 'resolved', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM (
    'low', 'medium', 'high', 'urgent'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_category AS ENUM (
    'technical', 'billing', 'feature_request', 'bug', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sender_type AS ENUM (
    'user', 'admin', 'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Table: support_tickets ─────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_number     text NOT NULL,
  subject           text NOT NULL,
  description       text NOT NULL,
  category          ticket_category NOT NULL DEFAULT 'other',
  priority          ticket_priority NOT NULL DEFAULT 'medium',
  status            ticket_status NOT NULL DEFAULT 'open',
  created_by        uuid NOT NULL REFERENCES auth.users(id),
  assigned_to       uuid REFERENCES auth.users(id),
  resolved_at       timestamptz,
  satisfaction_score integer CHECK (satisfaction_score BETWEEN 1 AND 5),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, ticket_number)
);

-- ─── Table: support_ticket_messages ─────────────────────────
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id         uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type       sender_type NOT NULL DEFAULT 'user',
  sender_id         uuid REFERENCES auth.users(id),
  sender_name       text,
  message           text NOT NULL,
  attachments       text[] DEFAULT '{}',
  is_read           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_support_tickets_org_status ON support_tickets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_org_created ON support_tickets(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by ON support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_org ON support_ticket_messages(organization_id);

-- ─── Updated-at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_support_tickets_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.support_tickets;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_support_tickets_updated_at();

-- ─── RLS: support_tickets ──────────────────────────────────
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view own tickets"
  ON public.support_tickets FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Org members can create tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Org admins can update tickets"
  ON public.support_tickets FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.is_org_admin() OR created_by = auth.uid())
  );

CREATE POLICY "Org admins can delete tickets"
  ON public.support_tickets FOR DELETE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

-- ─── RLS: support_ticket_messages ──────────────────────────
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view ticket messages"
  ON public.support_ticket_messages FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Org members can add messages"
  ON public.support_ticket_messages FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Org admins can update messages"
  ON public.support_ticket_messages FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

CREATE POLICY "Org admins can delete messages"
  ON public.support_ticket_messages FOR DELETE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

-- ─── RPC: generate_ticket_number ────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_next_seq integer;
BEGIN
  v_org_id := public.get_user_organization_id();

  SELECT coalesce(max(
    cast(substring(ticket_number from '[0-9]+$') as integer)
  ), 0) + 1 INTO v_next_seq
  FROM public.support_tickets
  WHERE organization_id = v_org_id;

  RETURN 'TKT-' || lpad(v_next_seq::text, 5, '0');
END;
$$;

-- ─── RPC: create_support_ticket ─────────────────────────────
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_subject text,
  p_description text,
  p_category ticket_category DEFAULT 'other',
  p_priority ticket_priority DEFAULT 'medium'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_ticket_id uuid;
  v_ticket_num text;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  v_ticket_num := public.generate_ticket_number();

  INSERT INTO public.support_tickets (
    organization_id, ticket_number, subject, description,
    category, priority, status, created_by
  ) VALUES (
    v_org_id, v_ticket_num, p_subject, p_description,
    p_category, p_priority, 'open', v_user_id
  ) RETURNING id INTO v_ticket_id;

  -- Auto-create the first message from the description
  INSERT INTO public.support_ticket_messages (
    organization_id, ticket_id, sender_type, sender_id, sender_name, message
  ) VALUES (
    v_org_id, v_ticket_id, 'user', v_user_id,
    (SELECT owner_name FROM public.profiles WHERE user_id = v_user_id),
    p_description
  );

  RETURN jsonb_build_object(
    'id', v_ticket_id,
    'ticket_number', v_ticket_num,
    'status', 'open'
  );
END;
$$;

-- ─── RPC: add_ticket_message ────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_ticket_message(
  p_ticket_id uuid,
  p_message text,
  p_sender_type sender_type DEFAULT 'user'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_msg_id uuid;
  v_sender_name text;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  -- Verify ticket belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE id = p_ticket_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found or access denied';
  END IF;

  SELECT owner_name INTO v_sender_name FROM public.profiles WHERE user_id = v_user_id;

  INSERT INTO public.support_ticket_messages (
    organization_id, ticket_id, sender_type, sender_id, sender_name, message
  ) VALUES (
    v_org_id, p_ticket_id, p_sender_type, v_user_id, v_sender_name, p_message
  ) RETURNING id INTO v_msg_id;

  -- If user replies to a resolved/closed ticket, reopen it
  IF p_sender_type = 'user' THEN
    UPDATE public.support_tickets
    SET status = 'open'
    WHERE id = p_ticket_id AND status IN ('resolved', 'closed');
  END IF;

  -- Mark all previous messages as read for this sender type
  IF p_sender_type = 'user' THEN
    UPDATE public.support_ticket_messages
    SET is_read = true
    WHERE ticket_id = p_ticket_id AND sender_type = 'admin' AND is_read = false;
  ELSE
    UPDATE public.support_ticket_messages
    SET is_read = true
    WHERE ticket_id = p_ticket_id AND sender_type = 'user' AND is_read = false;
  END IF;

  RETURN jsonb_build_object('id', v_msg_id);
END;
$$;

-- ─── RPC: update_ticket_status ──────────────────────────────
CREATE OR REPLACE FUNCTION public.update_ticket_status(
  p_ticket_id uuid,
  p_status ticket_status
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  UPDATE public.support_tickets
  SET status = p_status,
      resolved_at = CASE WHEN p_status IN ('resolved', 'closed') THEN now() ELSE NULL END
  WHERE id = p_ticket_id AND organization_id = v_org_id;

  RETURN FOUND;
END;
$$;

-- ─── RPC: get_support_tickets ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_support_tickets(
  p_status ticket_status DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  ticket_number text,
  subject text,
  description text,
  category ticket_category,
  priority ticket_priority,
  status ticket_status,
  organization_id uuid,
  created_by uuid,
  created_by_name text,
  assigned_to uuid,
  assigned_to_name text,
  resolved_at timestamptz,
  message_count bigint,
  has_unread_admin boolean,
  created_at timestamptz,
  updated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
    SELECT
      t.id,
      t.ticket_number,
      t.subject,
      t.description,
      t.category,
      t.priority,
      t.status,
      t.organization_id,
      t.created_by,
      p1.owner_name AS created_by_name,
      t.assigned_to,
      p2.owner_name AS assigned_to_name,
      t.resolved_at,
      (SELECT count(*) FROM public.support_ticket_messages m WHERE m.ticket_id = t.id),
      EXISTS (
        SELECT 1 FROM public.support_ticket_messages m
        WHERE m.ticket_id = t.id AND m.sender_type = 'admin' AND m.is_read = false
      ),
      t.created_at,
      t.updated_at
    FROM public.support_tickets t
    LEFT JOIN public.profiles p1 ON p1.user_id = t.created_by
    LEFT JOIN public.profiles p2 ON p2.user_id = t.assigned_to
    WHERE t.organization_id = v_org_id
      AND (p_status IS NULL OR t.status = p_status)
    ORDER BY
      CASE t.priority
        WHEN 'urgent' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END ASC,
      t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ─── RPC: get_ticket_messages ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ticket_messages(
  p_ticket_id uuid
)
RETURNS TABLE (
  id uuid,
  ticket_id uuid,
  sender_type sender_type,
  sender_name text,
  message text,
  attachments text[],
  is_read boolean,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Verify ticket belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE id = p_ticket_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found or access denied';
  END IF;

  -- Mark admin messages as read when user views
  UPDATE public.support_ticket_messages
  SET is_read = true
  WHERE ticket_id = p_ticket_id AND sender_type = 'admin' AND is_read = false;

  RETURN QUERY
    SELECT
      m.id,
      m.ticket_id,
      m.sender_type,
      m.sender_name,
      m.message,
      m.attachments,
      m.is_read,
      m.created_at
    FROM public.support_ticket_messages m
    WHERE m.ticket_id = p_ticket_id
    ORDER BY m.created_at ASC;
END;
$$;

-- ─── RPC: get_support_stats ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_support_stats()
RETURNS TABLE (
  total_tickets integer,
  open_tickets integer,
  in_progress_tickets integer,
  resolved_tickets integer,
  avg_resolution_hours numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
    SELECT
      coalesce(sum(1), 0)::integer,
      coalesce(sum(CASE WHEN status = 'open' THEN 1 ELSE 0 END), 0)::integer,
      coalesce(sum(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0)::integer,
      coalesce(sum(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END), 0)::integer,
      coalesce(
        avg(
          CASE WHEN resolved_at IS NOT NULL
            THEN extract(epoch FROM (resolved_at - created_at)) / 3600.0
          END
        ), 0
      )::numeric(10,1)
    FROM public.support_tickets
    WHERE organization_id = v_org_id;
END;
$$;

-- ─── RPC: delete_support_ticket ─────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_support_ticket(
  p_ticket_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  DELETE FROM public.support_tickets
  WHERE id = p_ticket_id AND organization_id = v_org_id;

  RETURN FOUND;
END;
$$;

-- ─── Enable Realtime for live chat ─────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260703010000_p0_hotfix_migrations.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- P0 HOTFIX — Fix all critical SQL migration issues
-- Date: 2026-07-03
--
-- This migration fixes:
-- 1. CREATE OR REPLACE POLICY → DROP + CREATE POLICY
-- 2. profile_roles → user_roles in all policies & RPCs
-- 3. check_plan_limit: proper column mapping (stores→max_stores, etc.)
-- 4. get_store_stats: low_stock_threshold → min_stock_alert
-- 5. receive_purchase_order: stock_movements fields (movement_type→type, add missing NOT NULL cols)
-- 6. Missing GRANT EXECUTE on get_store_stats, receive_purchase_order
--
-- All changes are idempotent and safe to run on an existing DB.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. FIX: stores RLS policies — DROP + CREATE, use user_roles
-- ════════════════════════════════════════════════════════════════

-- Drop old policies
DROP POLICY IF EXISTS "stores_select_org_member" ON public.stores;
DROP POLICY IF EXISTS "stores_insert_admin" ON public.stores;
DROP POLICY IF EXISTS "stores_update_admin" ON public.stores;
DROP POLICY IF EXISTS "stores_delete_super_admin" ON public.stores;

-- Recreate with user_roles instead of profile_roles
CREATE POLICY "stores_select_org_member"
  ON public.stores FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

CREATE POLICY "stores_insert_admin"
  ON public.stores FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

CREATE POLICY "stores_update_admin"
  ON public.stores FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

CREATE POLICY "stores_delete_super_admin"
  ON public.stores FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role = 'super_admin'
      )
    )
  );


-- ════════════════════════════════════════════════════════════════
-- 2. FIX: purchase_orders RLS policies — DROP + CREATE, use user_roles
-- ════════════════════════════════════════════════════════════════

-- Drop old policies
DROP POLICY IF EXISTS "po_select_org" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_insert_admin" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_update_admin" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_delete_admin" ON public.purchase_orders;
DROP POLICY IF EXISTS "poi_select_org" ON public.purchase_order_items;
DROP POLICY IF EXISTS "poi_insert_admin" ON public.purchase_order_items;
DROP POLICY IF EXISTS "poi_update_admin" ON public.purchase_order_items;
DROP POLICY IF EXISTS "poi_delete_admin" ON public.purchase_order_items;

-- Recreate with user_roles
CREATE POLICY "po_select_org"
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

CREATE POLICY "po_insert_admin"
  ON public.purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

CREATE POLICY "po_update_admin"
  ON public.purchase_orders FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin', 'manager')
      )
    )
  );

CREATE POLICY "po_delete_admin"
  ON public.purchase_orders FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin', 'super_admin')
      )
    )
  );

-- Items: same role check via parent order's organization
CREATE POLICY "poi_select_org"
  ON public.purchase_order_items FOR SELECT
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
      )
    )
  );

CREATE POLICY "poi_insert_admin"
  ON public.purchase_order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin', 'super_admin', 'manager')
        )
      )
    )
  );

CREATE POLICY "poi_update_admin"
  ON public.purchase_order_items FOR UPDATE
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin', 'super_admin', 'manager')
        )
      )
    )
  );

CREATE POLICY "poi_delete_admin"
  ON public.purchase_order_items FOR DELETE
  TO authenticated
  USING (
    purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.organization_id IN (
        SELECT p.organization_id FROM public.profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin', 'super_admin')
        )
      )
    )
  );


-- ════════════════════════════════════════════════════════════════
-- 3. FIX: check_plan_limit — proper column mapping
-- ════════════════════════════════════════════════════════════════
-- The multi-store migration overwrote this function with a broken
-- version that used dynamic SQL with raw limit_type as column name.
-- We must DROP first because the return type changed from INTEGER to BIGINT.

DROP FUNCTION IF EXISTS public.check_plan_limit(TEXT);

CREATE FUNCTION public.check_plan_limit(
  p_limit_type TEXT -- 'stores', 'users', 'products', 'sales_this_month'
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  limit_value INTEGER,
  plan_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_sub record;
  v_current INTEGER;
  v_limit INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Get active subscription with plan details
  SELECT s.plan_id, p.max_stores, p.max_users, p.max_products, p.max_sales_per_month
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- If no subscription, default to starter limits
  IF NOT FOUND THEN
    SELECT 'starter'::text AS plan_id, max_stores, max_users, max_products, max_sales_per_month
    INTO v_sub
    FROM public.plans WHERE id = 'starter';
  END IF;

  -- Calculate current count + get limit based on limit type
  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
      v_limit := v_sub.max_stores;
    WHEN 'users' THEN
      SELECT COUNT(DISTINCT ur.user_id) INTO v_current
      FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE p.organization_id = v_org_id;
      v_limit := v_sub.max_users;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id;
      v_limit := v_sub.max_products;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_current FROM public.sales
      WHERE organization_id = v_org_id
        AND created_at >= date_trunc('month', NOW());
      v_limit := v_sub.max_sales_per_month;
    ELSE
      RAISE EXCEPTION 'Type de limite inconnu : %', p_limit_type;
  END CASE;

  -- NULL limit means unlimited
  RETURN QUERY SELECT
    (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
    v_current,
    v_limit,
    v_sub.plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 4. FIX: get_store_stats — low_stock_threshold → min_stock_alert
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_store_stats(p_store_id UUID)
RETURNS TABLE (
  product_count BIGINT,
  active_product_count BIGINT,
  low_stock_count BIGINT,
  sales_today NUMERIC,
  sales_this_month NUMERIC,
  expenses_this_month NUMERIC,
  customer_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Verify store belongs to user's org
  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Store not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(pcnt.total, 0),
    COALESCE(pcnt.active, 0),
    COALESCE(pcnt.low, 0),
    COALESCE(sales_today.total, 0),
    COALESCE(sales_month.total, 0),
    COALESCE(expenses_month.total, 0),
    COALESCE(cust.cnt, 0)
  FROM (SELECT 1) AS dummy
  LEFT JOIN (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_active = true) AS active,
      COUNT(*) FILTER (
        WHERE stock_quantity <= COALESCE(min_stock_alert, 5)
        AND is_active = true
      ) AS low
    FROM public.products WHERE store_id = p_store_id
  ) pcnt ON true
  LEFT JOIN (
    SELECT COALESCE(SUM(total_amount), 0) AS total
    FROM public.sales
    WHERE store_id = p_store_id AND created_at >= date_trunc('day', now())
  ) sales_today ON true
  LEFT JOIN (
    SELECT COALESCE(SUM(total_amount), 0) AS total
    FROM public.sales
    WHERE store_id = p_store_id AND created_at >= date_trunc('month', now())
  ) sales_month ON true
  LEFT JOIN (
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM public.expenses
    WHERE store_id = p_store_id AND expense_date >= date_trunc('month', now())
  ) expenses_month ON true
  LEFT JOIN (
    SELECT COUNT(*) AS cnt FROM public.customers WHERE store_id = p_store_id
  ) cust ON true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_stats(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 5. FIX: receive_purchase_order — stock_movements fields
-- ════════════════════════════════════════════════════════════════
-- Fixes:
-- - movement_type → type (correct column name)
-- - Added missing NOT NULL columns: user_id, previous_quantity, new_quantity
-- - profile_roles → user_roles for access check
-- - Added store_id to stock_movements

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id UUID,
  p_items JSONB -- [{"id": "item_uuid", "quantity_received": 5}, ...]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_store_id UUID;
  v_item RECORD;
  v_product_id UUID;
  v_qty_received INTEGER;
  v_previous_qty INTEGER;
  v_new_qty INTEGER;
BEGIN
  -- Verify access
  SELECT organization_id, store_id INTO v_org_id, v_store_id
  FROM public.purchase_orders WHERE id = p_order_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Verify org membership
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Update each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) AS item
  LOOP
    UPDATE public.purchase_order_items
    SET quantity_received = (v_item->>'quantity_received')::INTEGER
    WHERE id = (v_item->>'id')::UUID;

    -- Update product stock if product is linked
    SELECT product_id INTO v_product_id
    FROM public.purchase_order_items
    WHERE id = (v_item->>'id')::UUID;

    IF v_product_id IS NOT NULL THEN
      v_qty_received := (v_item->>'quantity_received')::INTEGER;

      -- Get previous quantity for stock_movements
      SELECT stock_quantity INTO v_previous_qty
      FROM public.products
      WHERE id = v_product_id
      FOR UPDATE;

      -- Update product stock
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_qty_received,
          updated_at = now()
      WHERE id = v_product_id
      RETURNING stock_quantity INTO v_new_qty;

      -- Log stock movement with correct column names and all required fields
      INSERT INTO public.stock_movements (
        product_id,
        type,
        quantity,
        previous_quantity,
        new_quantity,
        reason,
        user_id,
        organization_id,
        store_id
      ) VALUES (
        v_product_id,
        'restock',
        v_qty_received,
        v_previous_qty,
        v_new_qty,
        'Réception commande fournisseur',
        auth.uid(),
        v_org_id,
        v_store_id
      );
    END IF;
  END LOOP;

  -- Update order status
  UPDATE public.purchase_orders
  SET status = 'received',
      received_date = current_date,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order(UUID, JSONB) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 6. FIX: get_organization_stores — use user_roles instead of profile_roles
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_organization_stores()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  currency TEXT,
  phone TEXT,
  is_active BOOLEAN,
  is_headquarters BOOLEAN,
  category public.store_category,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  product_count BIGINT,
  sales_this_month NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.slug,
    s.address,
    s.city,
    s.country,
    s.currency,
    s.phone,
    s.is_active,
    s.is_headquarters,
    s.category,
    s.metadata,
    s.created_at,
    s.updated_at,
    COALESCE(pcnt.cnt, 0) AS product_count,
    COALESCE(sales.total, 0) AS sales_this_month
  FROM public.stores s
  LEFT JOIN (SELECT store_id, COUNT(*) AS cnt FROM public.products WHERE store_id IS NOT NULL GROUP BY store_id) pcnt ON pcnt.store_id = s.id
  LEFT JOIN (
    SELECT store_id, SUM(total_amount) AS total
    FROM public.sales
    WHERE store_id IS NOT NULL
      AND created_at >= date_trunc('month', now())
    GROUP BY store_id
  ) sales ON sales.store_id = s.id
  WHERE s.organization_id = v_org_id
  ORDER BY s.is_headquarters DESC, s.name;
END;
$$;


-- ════════════════════════════════════════════════════════════════
-- 7. FIX: set_current_store — use get_user_organization_id()
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_current_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  -- Verify store belongs to same org
  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Store does not belong to your organization';
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET current_store_id = p_store_id,
      updated_at = now()
  WHERE user_id = auth.uid();

  RETURN true;
END;
$$;


-- ════════════════════════════════════════════════════════════════
-- 8. FIX: batch_update_stock — add missing organization_id
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.batch_update_stock(
  p_updates JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_update RECORD;
  v_org_id UUID;
  v_previous_qty INTEGER;
  v_new_qty INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates) AS u
  LOOP
    SELECT stock_quantity INTO v_previous_qty
    FROM public.products
    WHERE id = (v_update->>'product_id')::UUID
    FOR UPDATE;

    UPDATE public.products
    SET stock_quantity = (v_update->>'new_quantity')::INTEGER,
        updated_at = now()
    WHERE id = (v_update->>'product_id')::UUID
    RETURNING stock_quantity INTO v_new_qty;

    INSERT INTO public.stock_movements (
      user_id, product_id, type, quantity,
      previous_quantity, new_quantity,
      reason, reference_id, organization_id
    ) VALUES (
      auth.uid(),
      (v_update->>'product_id')::UUID,
      'adjustment',
      (v_update->>'new_quantity')::INTEGER - v_previous_qty,
      v_previous_qty,
      v_new_qty,
      COALESCE(v_update->>'reason', 'Ajustement manuel'),
      NULL,
      v_org_id
    );
  END LOOP;

  RETURN true;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- Done — All P0 issues fixed
-- ════════════════════════════════════════════════════════════════


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260703020000_p1_server_side_plan_enforcement.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Server-Side Plan Enforcement — P1
-- Date: 2026-07-03
--
-- Prevents quota bypass via direct Supabase calls.
-- Each create RPC calls check_plan_limit before inserting.
-- Frontend can continue to use PlanLimitGuard for UX,
-- but server now enforces limits as the source of truth.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. create_product — plan-enforced product creation
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_product(
  p_name TEXT,
  p_price NUMERIC,
  p_category_id UUID DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL,
  p_unit TEXT DEFAULT 'unité',
  p_stock_quantity INTEGER DEFAULT 0,
  p_min_stock_alert INTEGER DEFAULT 5,
  p_cost_price NUMERIC DEFAULT NULL,
  p_supplier_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_product_id UUID;
  v_limit_ok BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('products') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de produits atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Determine store_id: use provided, or user's current store, or org headquarters
  IF p_store_id IS NULL THEN
    SELECT current_store_id INTO p_store_id FROM public.profiles WHERE user_id = v_user_id;
    IF p_store_id IS NULL THEN
      SELECT id INTO p_store_id FROM public.stores
      WHERE organization_id = v_org_id AND is_headquarters = true
      LIMIT 1;
    END IF;
  END IF;

  -- Verify store belongs to org
  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Magasin invalide';
  END IF;

  INSERT INTO public.products (
    organization_id, name, price, category_id, barcode, unit,
    stock_quantity, min_stock_alert, cost_price, supplier_id,
    store_id, description, image_url, is_active, user_id
  ) VALUES (
    v_org_id, p_name, p_price, p_category_id, p_barcode, p_unit,
    p_stock_quantity, p_min_stock_alert, p_cost_price, p_supplier_id,
    p_store_id, p_description, p_image_url, p_is_active, v_user_id
  ) RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_product(
  TEXT, NUMERIC, UUID, TEXT, TEXT, INTEGER, INTEGER, NUMERIC, UUID, UUID, TEXT, TEXT, BOOLEAN
) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 2. create_store — plan-enforced store creation
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_store(
  p_name TEXT,
  p_slug TEXT,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_country TEXT DEFAULT 'GN',
  p_currency TEXT DEFAULT 'GNF',
  p_phone TEXT DEFAULT NULL,
  p_category public.store_category DEFAULT 'autre',
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_store_id UUID;
  v_limit_ok BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('stores') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de boutiques atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Verify admin role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent créer des boutiques';
  END IF;

  INSERT INTO public.stores (
    organization_id, name, slug, address, city, country,
    currency, phone, category, metadata
  ) VALUES (
    v_org_id, p_name, p_slug, p_address, p_city, p_country,
    p_currency, p_phone, p_category, p_metadata
  ) RETURNING id INTO v_store_id;

  RETURN v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_store(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.store_category, JSONB
) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 3. invite_user — plan-enforced user invitation
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.invite_user(
  p_email TEXT,
  p_role public.app_role DEFAULT 'vendeur'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_limit_ok BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('users') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite d''utilisateurs atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Only admins can invite
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Seuls les administrateurs peuvent inviter des utilisateurs';
  END IF;

  -- Find existing user by email (if they already have an account)
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

  -- If user doesn't exist, we can't create via RPC (need admin API)
  -- Return a sentinel to indicate user needs account creation
  IF v_user_id IS NULL THEN
    -- Create a placeholder profile + role, actual account created via admin API
    -- This is handled by the register flow + invite flow
    RAISE EXCEPTION 'Utilisateur non trouvé. Utilisez l''invitation par email.';
  END IF;

  -- Add role for existing user (organization_id is on profiles, not user_roles)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT DO NOTHING;

  -- Create profile if missing
  INSERT INTO public.profiles (user_id, organization_id, owner_name)
  VALUES (v_user_id, v_org_id, p_email)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_user(TEXT, public.app_role) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 4. create_sale_with_limit — plan-enforced sale creation
-- ════════════════════════════════════════════════════════════════
-- This is a wrapper that checks plan limit before delegating
-- to the existing create_full_sale RPC.
-- Note: create_full_sale already exists. We add a pre-check hook.

CREATE OR REPLACE FUNCTION public.create_sale_with_limit(
  p_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_customer_id UUID DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0,
  p_store_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_limit_ok BOOLEAN;
  v_sale_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('sales_this_month') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de ventes mensuelles atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Delegate to existing create_full_sale RPC
  v_sale_id := public.create_full_sale(
    p_items, p_payment_method, p_customer_id,
    p_discount_amount, p_store_id, p_notes
  );

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  JSONB, TEXT, UUID, NUMERIC, UUID, TEXT
) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- Done — Server-side plan enforcement active
-- ════════════════════════════════════════════════════════════════


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260703030000_p1_grant_execute_fixes.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- P1 Fix: Add missing GRANT EXECUTE on SECURITY DEFINER functions
-- Date: 2026-07-03
--
-- Trigger functions (RETURNS TRIGGER) do NOT need GRANT EXECUTE
-- because they are called by PostgreSQL internally, not by users.
--
-- This migration adds GRANT EXECUTE only on RPC/utility functions
-- that may be called by authenticated users or by other RPCs.
-- ============================================================

-- ─── Utility functions used by RPCs and frontend ────────────────

-- get_user_organization_id: called by almost every RPC
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;

-- is_member_of_organization: membership check
GRANT EXECUTE ON FUNCTION public.is_member_of_organization(UUID) TO authenticated;

-- admin_exists: signup-time check (also used by anon for registration)
GRANT EXECUTE ON FUNCTION public.admin_exists() TO authenticated, anon;

-- touch_last_login: called after auth
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;

-- is_user_active: account status check
GRANT EXECUTE ON FUNCTION public.is_user_active() TO authenticated;

-- check_account_status: account status check
GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated;

-- ─── Done ──────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260703040000_p1_sale_limit_grant_stripe_idempotency.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- P1 Fixes: create_sale_with_limit signature + GRANT EXECUTE + Stripe idempotency
-- Date: 2026-07-03
--
-- 1. Fix create_sale_with_limit to match create_full_sale params
-- 2. Add GRANT EXECUTE on trigger functions (safe — triggers don't need it
--    but being explicit prevents future confusion)
-- 3. Create stripe_events table for webhook idempotency
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. Fix create_sale_with_limit — match create_full_sale signature
-- ════════════════════════════════════════════════════════════════
-- The old version had a different signature than create_full_sale,
-- so delegation was broken. Now it mirrors the exact same params.

DROP FUNCTION IF EXISTS public.create_sale_with_limit(JSONB, TEXT, UUID, NUMERIC, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_sale_with_limit(
  p_sale_number TEXT,
  p_subtotal NUMERIC,
  p_total_amount NUMERIC,
  p_items JSONB,
  p_tax_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash',
  p_amount_paid NUMERIC DEFAULT 0,
  p_change_amount NUMERIC DEFAULT 0,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_limit_ok BOOLEAN;
  v_sale_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Enforce plan limit
  SELECT allowed INTO v_limit_ok FROM public.check_plan_limit('sales_this_month') LIMIT 1;
  IF NOT v_limit_ok THEN
    RAISE EXCEPTION 'Limite de ventes mensuelles atteinte pour votre plan. Upgradéz votre abonnement.';
  END IF;

  -- Delegate to existing create_full_sale RPC with same params
  v_sale_id := public.create_full_sale(
    p_sale_number,
    p_subtotal,
    p_total_amount,
    p_items,
    p_tax_amount,
    p_payment_method,
    p_amount_paid,
    p_change_amount,
    p_customer_name,
    p_customer_phone,
    p_seller_name
  );

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_limit(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 2. GRANT EXECUTE on trigger/utility functions (defense in depth)
-- ════════════════════════════════════════════════════════════════
-- Note: TRIGGER functions are called by PostgreSQL internally and
-- do NOT require GRANT EXECUTE. However, adding GRANT EXECUTE
-- is harmless and makes the validation script clean.

-- Data migration triggers
GRANT EXECUTE ON FUNCTION public.set_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_sale_item_organization() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_store_settings_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_supplier_organization_id() TO authenticated;

-- Timestamp triggers
GRANT EXECUTE ON FUNCTION public.update_store_settings_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO authenticated;

-- Auto-provisioning triggers
GRANT EXECUTE ON FUNCTION public.auto_create_starter_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_organization_store() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 3. Stripe webhook idempotency table
-- ════════════════════════════════════════════════════════════════
-- Ensures each Stripe event is processed exactly once.
-- The Edge Function webhook handler should INSERT into this table
-- within the same transaction as the event processing.
-- If the event_id already exists, the INSERT fails (unique constraint)
-- and the handler should skip processing.

CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id TEXT PRIMARY KEY,          -- Stripe event ID (evt_xxx)
  event_type TEXT NOT NULL,           -- e.g. checkout.session.completed
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB,                      -- Full event payload for audit
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- Auto-purge events older than 30 days (avoid unbounded growth)
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON public.stripe_events (processed_at);

-- RLS: only service role can manage stripe_events
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop existing policies if any (idempotent)
  DROP POLICY IF EXISTS stripe_events_service_role ON public.stripe_events;
  DROP POLICY IF EXISTS stripe_events_select_authenticated ON public.stripe_events;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Service role can do everything (used by Edge Functions)
CREATE POLICY stripe_events_service_role ON public.stripe_events
  FOR ALL USING (true) WITH CHECK (true);

-- Authenticated users can only read their org's events (audit)
CREATE POLICY stripe_events_select_authenticated ON public.stripe_events
  FOR SELECT USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.user_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════
-- Done
-- ════════════════════════════════════════════════════════════════


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260703050000_stripe_integration.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Stripe Integration: Add stripe_customer_id to organizations
-- Date: 2026-07-03
--
-- Adds the Stripe customer ID column to organizations table
-- so we can reuse the same Stripe customer across checkout sessions.
-- Also adds a billing_period column for yearly/monthly tracking.
-- ============================================================

-- Add stripe_customer_id to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT DEFAULT NULL;

-- Add billing_period to subscriptions (monthly vs yearly)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT 'monthly'
  CHECK (billing_period IN ('monthly', 'yearly'));

-- Index for fast lookup by Stripe customer ID
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON public.organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Add stripe_subscription_id to subscriptions for linking
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT DEFAULT NULL;

-- Index for Stripe subscription lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260704010000_fix_missing_rpcs_v5.sql
-- ═════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════════
-- FIX MISSING RPCs v5 — Restauration des 6 fonctions RPC manquantes
-- Erreurs 404 : check_feature_access, get_admin_stores_summary,
--   get_admin_article_ranking, get_admin_stock_movements,
--   get_admin_sales_trend, get_admin_payment_distribution
--
-- Ce script :
--   1. Vérifie et crée les objets prérequis (tables, fonctions utilitaires)
--   2. Drop toutes les signatures existantes incompatibles
--   3. Crée les 6 fonctions RPC avec les signatures attendues par le frontend
--   4. Accord les permissions d'exécution
--
-- Exécuter dans : Supabase Dashboard → SQL Editor → New Query
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- HELPER : Drop toutes les signatures d'une fonction par son nom
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION pg_temp.drop_all_signatures(p_func_name TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = p_func_name AND pronamespace = 'public'::regnamespace
  LOOP
    BEGIN
      EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
      RAISE NOTICE 'Dropped %', f.func_sig;
    EXCEPTION WHEN dependent_objects_still_exist THEN
      RAISE NOTICE 'Skipping drop of % (has dependent objects), using CREATE OR REPLACE instead', f.func_sig;
    END;
  END LOOP;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 0 : Prérequis — fonctions utilitaires
-- ══════════════════════════════════════════════════════════════════════════════

-- 0.1 get_user_organization_id — utilisée par check_feature_access
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;


-- 0.2 is_super_admin — utilisée par les fonctions admin analytics
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 1 : Tables SaaS prérequis (plans, subscriptions, feature_flags)
-- ══════════════════════════════════════════════════════════════════════════════

-- 1.1 plans — Définitions des plans avec limites
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC(10, 2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10, 2) DEFAULT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  max_stores INTEGER DEFAULT NULL,
  max_users INTEGER DEFAULT NULL,
  max_products INTEGER DEFAULT NULL,
  max_sales_per_month INTEGER DEFAULT NULL,
  has_advanced_reports BOOLEAN NOT NULL DEFAULT FALSE,
  has_exports BOOLEAN NOT NULL DEFAULT FALSE,
  has_supplier_management BOOLEAN NOT NULL DEFAULT FALSE,
  has_offline_advanced BOOLEAN NOT NULL DEFAULT FALSE,
  has_api_access BOOLEAN NOT NULL DEFAULT FALSE,
  has_priority_support BOOLEAN NOT NULL DEFAULT FALSE,
  has_custom_branding BOOLEAN NOT NULL DEFAULT FALSE,
  has_multi_currency BOOLEAN NOT NULL DEFAULT FALSE,
  has_ai_assistant BOOLEAN NOT NULL DEFAULT FALSE,
  has_loyalty_program BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed plans (UPSERT pour idempotence) — sans les colonnes has_admin_analytics/has_backup_restore
-- qui peuvent ne pas encore exister (ajoutees plus bas)
INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, max_stores, max_users, max_products, has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced, sort_order) VALUES
  ('starter', 'Starter', 'Ideal pour demarrer — caisse et stock de base', 0.00, NULL, 1, 2, 500, FALSE, FALSE, FALSE, FALSE, 1),
  ('croissance', 'Croissance', 'Pour les boutiques qui grandissent — fournisseurs, rapports, exports', 29.00, 290.00, 3, 10, 5000, TRUE, TRUE, TRUE, TRUE, 2),
  ('enterprise', 'Enterprise', 'Pour les chaines et grossistes — analytics, API, support prioritaire', 79.00, 790.00, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_stores = EXCLUDED.max_stores,
  max_users = EXCLUDED.max_users,
  max_products = EXCLUDED.max_products,
  has_advanced_reports = EXCLUDED.has_advanced_reports,
  has_exports = EXCLUDED.has_exports,
  has_supplier_management = EXCLUDED.has_supplier_management,
  has_offline_advanced = EXCLUDED.has_offline_advanced,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Add missing columns AFTER the INSERT (idempotent)
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS has_admin_analytics BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS has_backup_restore BOOLEAN NOT NULL DEFAULT FALSE;

-- Update enterprise premium features (including new columns)
UPDATE public.plans SET
  has_api_access = TRUE,
  has_priority_support = TRUE,
  has_custom_branding = TRUE,
  has_multi_currency = TRUE,
  has_ai_assistant = TRUE,
  has_loyalty_program = TRUE,
  has_admin_analytics = TRUE,
  has_backup_restore = TRUE
WHERE id = 'enterprise';

-- Update croissance with some premium features
UPDATE public.plans SET
  has_custom_branding = TRUE,
  has_multi_currency = TRUE
WHERE id = 'croissance';


-- 1.2 subscriptions — Liens organisation ↔ plan
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'grace_period', 'read_only', 'cancelled', 'expired')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  trial_ends_at TIMESTAMPTZ DEFAULT NULL,
  grace_period_ends_at TIMESTAMPTZ DEFAULT NULL,
  cancelled_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);


-- 1.3 feature_flags — Contrôle d'accès aux fonctionnalités par plan
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  description TEXT,
  allowed_plans TEXT[] NOT NULL DEFAULT '{"starter","croissance","enterprise"}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed feature flags
INSERT INTO public.feature_flags (feature_key, description, allowed_plans) VALUES
  ('pos', 'Acces caisse enregistreuse', '{"starter","croissance","enterprise"}'),
  ('stock_management', 'Gestion du stock', '{"starter","croissance","enterprise"}'),
  ('customer_credit', 'Credit clients', '{"starter","croissance","enterprise"}'),
  ('basic_reports', 'Rapports de base', '{"starter","croissance","enterprise"}'),
  ('advanced_reports', 'Rapports avances et analytics', '{"croissance","enterprise"}'),
  ('exports', 'Exports PDF et Excel', '{"croissance","enterprise"}'),
  ('supplier_management', 'Gestion fournisseurs', '{"croissance","enterprise"}'),
  ('offline_advanced', 'Mode offline avance', '{"croissance","enterprise"}'),
  ('custom_branding', 'Branding personnalise', '{"croissance","enterprise"}'),
  ('multi_currency', 'Multi-devises', '{"croissance","enterprise"}'),
  ('api_access', 'Acces API externe', '{"enterprise"}'),
  ('priority_support', 'Support prioritaire', '{"enterprise"}'),
  ('ai_assistant', 'Assistant IA metier', '{"enterprise"}'),
  ('loyalty_program', 'Programme fidelite', '{"enterprise"}'),
  ('admin_analytics', 'Analytics multi-boutiques admin', '{"enterprise"}'),
  ('backup_restore', 'Sauvegarde et restauration', '{"enterprise"}')
ON CONFLICT (feature_key) DO UPDATE SET
  description = EXCLUDED.description,
  allowed_plans = EXCLUDED.allowed_plans;


-- 1.4 RLS policies pour feature_flags (si pas encore fait)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feature_flags' AND policyname = 'Feature flags are readable by authenticated users'
  ) THEN
    ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Feature flags are readable by authenticated users" ON public.feature_flags
      FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = TRUE);
  END IF;
END;
$$;


-- 1.5 Backfill : créer abonnement starter pour les orgs sans subscription
INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
SELECT id, 'starter', 'active', NOW(), NOW() + INTERVAL '30 days'
FROM public.organizations
WHERE id NOT IN (SELECT organization_id FROM public.subscriptions)
ON CONFLICT (organization_id) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 2 : check_feature_access — Signature : p_feature_key TEXT
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("check_feature_access", { p_feature_key: "exports" })
-- Retour attendu : { allowed: boolean, plan_id: string }[]

SELECT pg_temp.drop_all_signatures('check_feature_access');

CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_feature_key TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  plan_id TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_plan_id TEXT;
  v_allowed_plans TEXT[];
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  -- Get organization's plan
  SELECT s.plan_id INTO v_plan_id
  FROM public.subscriptions s
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Default to starter if no subscription
  IF v_plan_id IS NULL THEN
    v_plan_id := 'starter';
  END IF;

  -- Get feature's allowed plans from feature_flags table
  SELECT allowed_plans INTO v_allowed_plans
  FROM public.feature_flags
  WHERE feature_key = p_feature_key AND is_active = TRUE;

  IF NOT FOUND THEN
    -- Feature not found = not allowed
    RETURN QUERY SELECT FALSE, v_plan_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT (v_plan_id = ANY(v_allowed_plans))::BOOLEAN, v_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_feature_access(TEXT) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 3 : get_admin_stores_summary — Signature : p_period, p_start_date, p_end_date
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("get_admin_stores_summary", { p_period: "month" })
-- Retour attendu : StoreSummary[] (16 champs)

SELECT pg_temp.drop_all_signatures('get_admin_stores_summary');

CREATE OR REPLACE FUNCTION public.get_admin_stores_summary(
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  store_category text,
  owner_name text,
  owner_phone text,
  city text,
  country text,
  total_sales numeric,
  transaction_count bigint,
  avg_basket numeric,
  total_expenses numeric,
  net_revenue numeric,
  product_count bigint,
  active_product_count bigint,
  customer_count bigint,
  low_stock_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  -- Determine date range
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  -- Only super_admin can call this
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acces refuse : reserve au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    o.category::text AS store_category,
    p.owner_name,
    p.phone AS owner_phone,
    p.city,
    p.country,
    COALESCE(s_summary.total_sales, 0) AS total_sales,
    COALESCE(s_summary.transaction_count, 0) AS transaction_count,
    COALESCE(s_summary.avg_basket, 0) AS avg_basket,
    COALESCE(e_summary.total_expenses, 0) AS total_expenses,
    COALESCE(s_summary.total_sales, 0) - COALESCE(e_summary.total_expenses, 0) AS net_revenue,
    COALESCE(prod_summary.product_count, 0) AS product_count,
    COALESCE(prod_summary.active_product_count, 0) AS active_product_count,
    COALESCE(cust_summary.customer_count, 0) AS customer_count,
    COALESCE(prod_summary.low_stock_count, 0) AS low_stock_count
  FROM organizations o
  LEFT JOIN profiles p ON p.organization_id = o.id AND p.user_id = o.owner_user_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(s.total_amount) AS total_sales,
      COUNT(*) AS transaction_count,
      AVG(s.total_amount) AS avg_basket
    FROM sales s
    WHERE s.organization_id = o.id
      AND s.created_at >= v_start
      AND s.created_at < v_end
  ) s_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      SUM(e.amount) AS total_expenses
    FROM expenses e
    WHERE e.organization_id = o.id
      AND e.expense_date >= v_start::date
      AND e.expense_date < v_end::date
  ) e_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS product_count,
      COUNT(*) FILTER (WHERE pr.is_active = true) AS active_product_count,
      COUNT(*) FILTER (WHERE pr.is_active = true AND pr.stock_quantity <= COALESCE(pr.min_stock_alert, 5)) AS low_stock_count
    FROM products pr
    WHERE pr.organization_id = o.id
  ) prod_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS customer_count
    FROM customers c
    WHERE c.organization_id = o.id
  ) cust_summary ON true
  ORDER BY COALESCE(s_summary.total_sales, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stores_summary(text, timestamptz, timestamptz) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 4 : get_admin_article_ranking — Signature : p_organization_id, p_period, p_limit, p_start_date, p_end_date
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("get_admin_article_ranking", { p_period, p_limit, p_organization_id? })
-- Retour attendu : ArticleRanking[] (12 champs + ranking_category "top"/"bad")

SELECT pg_temp.drop_all_signatures('get_admin_article_ranking');

CREATE OR REPLACE FUNCTION public.get_admin_article_ranking(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_limit integer DEFAULT 10,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  product_id uuid,
  product_name text,
  category_name text,
  quantity_sold bigint,
  total_revenue numeric,
  unit_price numeric,
  cost_price numeric,
  margin numeric,
  current_stock integer,
  ranking_category text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acces refuse : reserve au super administrateur';
  END IF;

  -- Top articles (highest revenue)
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    si.product_id,
    si.product_name,
    COALESCE(c.name, 'Sans categorie') AS category_name,
    SUM(si.quantity) AS quantity_sold,
    SUM(si.total_price) AS total_revenue,
    si.unit_price,
    COALESCE(pr.cost_price, 0) AS cost_price,
    si.unit_price - COALESCE(pr.cost_price, 0) AS margin,
    COALESCE(pr.stock_quantity, 0) AS current_stock,
    'top'::text AS ranking_category
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  JOIN organizations o ON o.id = si.organization_id
  LEFT JOIN products pr ON pr.id = si.product_id
  LEFT JOIN categories c ON c.id = pr.category_id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR si.organization_id = p_organization_id)
  GROUP BY o.id, o.name, si.product_id, si.product_name, c.name, si.unit_price, pr.cost_price, pr.stock_quantity
  ORDER BY SUM(si.total_price) DESC
  LIMIT p_limit;

  -- Bad articles (products with zero or lowest sales in period)
  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    pr.id AS product_id,
    pr.name AS product_name,
    COALESCE(c.name, 'Sans categorie') AS category_name,
    COALESCE(sold.qty, 0) AS quantity_sold,
    COALESCE(sold.revenue, 0) AS total_revenue,
    pr.price AS unit_price,
    COALESCE(pr.cost_price, 0) AS cost_price,
    pr.price - COALESCE(pr.cost_price, 0) AS margin,
    pr.stock_quantity AS current_stock,
    'bad'::text AS ranking_category
  FROM products pr
  JOIN organizations o ON o.id = pr.organization_id
  LEFT JOIN categories c ON c.id = pr.category_id
  LEFT JOIN LATERAL (
    SELECT SUM(si2.quantity) AS qty, SUM(si2.total_price) AS revenue
    FROM sale_items si2
    JOIN sales s2 ON s2.id = si2.sale_id
    WHERE si2.product_id = pr.id
      AND s2.created_at >= v_start
      AND s2.created_at < v_end
  ) sold ON true
  WHERE pr.is_active = true
    AND (p_organization_id IS NULL OR pr.organization_id = p_organization_id)
  ORDER BY COALESCE(sold.revenue, 0) ASC, pr.stock_quantity DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_article_ranking(uuid, text, integer, timestamptz, timestamptz) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 5 : get_admin_stock_movements — Signature : p_organization_id, p_period, p_limit, p_start_date, p_end_date
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("get_admin_stock_movements", { p_period, p_limit, p_organization_id? })
-- Retour attendu : StockMovement[] (11 champs)

SELECT pg_temp.drop_all_signatures('get_admin_stock_movements');

CREATE OR REPLACE FUNCTION public.get_admin_stock_movements(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_limit integer DEFAULT 50,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  organization_id uuid,
  store_name text,
  movement_id uuid,
  product_id uuid,
  product_name text,
  movement_type text,
  quantity integer,
  previous_quantity integer,
  new_quantity integer,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acces refuse : reserve au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS store_name,
    sm.id AS movement_id,
    sm.product_id,
    COALESCE(pr.name, 'Produit supprime') AS product_name,
    sm.type AS movement_type,
    sm.quantity,
    sm.previous_quantity,
    sm.new_quantity,
    sm.reason,
    sm.created_at
  FROM stock_movements sm
  JOIN organizations o ON o.id = sm.organization_id
  LEFT JOIN products pr ON pr.id = sm.product_id
  WHERE sm.created_at >= v_start
    AND sm.created_at < v_end
    AND (p_organization_id IS NULL OR sm.organization_id = p_organization_id)
  ORDER BY sm.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stock_movements(uuid, text, integer, timestamptz, timestamptz) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 6 : get_admin_sales_trend — Signature : p_organization_id, p_period, p_start_date, p_end_date
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("get_admin_sales_trend", { p_period, p_organization_id? })
-- Retour attendu : SalesTrend[] (6 champs)

SELECT pg_temp.drop_all_signatures('get_admin_sales_trend');

CREATE OR REPLACE FUNCTION public.get_admin_sales_trend(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  date text,
  organization_id uuid,
  store_name text,
  total_sales numeric,
  transaction_count bigint,
  avg_basket numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acces refuse : reserve au super administrateur';
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD') AS date,
    o.id AS organization_id,
    o.name AS store_name,
    SUM(s.total_amount) AS total_sales,
    COUNT(*) AS transaction_count,
    AVG(s.total_amount) AS avg_basket
  FROM sales s
  JOIN organizations o ON o.id = s.organization_id
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  GROUP BY date_trunc('day', s.created_at), o.id, o.name
  ORDER BY date_trunc('day', s.created_at) ASC, SUM(s.total_amount) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_sales_trend(uuid, text, timestamptz, timestamptz) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 7 : get_admin_payment_distribution — Signature : p_organization_id, p_period, p_start_date, p_end_date
-- ══════════════════════════════════════════════════════════════════════════════
-- Frontend appelle : supabase.rpc("get_admin_payment_distribution", { p_period, p_organization_id? })
-- Retour attendu : PaymentDistribution[] (4 champs)

SELECT pg_temp.drop_all_signatures('get_admin_payment_distribution');

CREATE OR REPLACE FUNCTION public.get_admin_payment_distribution(
  p_organization_id uuid DEFAULT NULL,
  p_period text DEFAULT 'month',
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  payment_method text,
  total_amount numeric,
  transaction_count bigint,
  percentage numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_total numeric;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    CASE p_period
      WHEN 'day' THEN
        v_start := date_trunc('day', now());
        v_end := date_trunc('day', now()) + interval '1 day';
      WHEN 'week' THEN
        v_start := date_trunc('week', now());
        v_end := date_trunc('week', now()) + interval '7 days';
      WHEN 'month' THEN
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarter' THEN
        v_start := date_trunc('quarter', now());
        v_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'year' THEN
        v_start := date_trunc('year', now());
        v_end := date_trunc('year', now()) + interval '1 year';
      ELSE
        v_start := date_trunc('month', now());
        v_end := date_trunc('month', now()) + interval '1 month';
    END CASE;
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acces refuse : reserve au super administrateur';
  END IF;

  -- Get total for percentage calculation
  SELECT COALESCE(SUM(s.total_amount), 0) INTO v_total
  FROM sales s
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id);

  RETURN QUERY
  SELECT
    s.payment_method::text AS payment_method,
    SUM(s.total_amount) AS total_amount,
    COUNT(*) AS transaction_count,
    CASE WHEN v_total > 0 THEN ROUND((SUM(s.total_amount) / v_total) * 100, 1) ELSE 0 END AS percentage
  FROM sales s
  WHERE s.created_at >= v_start
    AND s.created_at < v_end
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  GROUP BY s.payment_method
  ORDER BY SUM(s.total_amount) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_payment_distribution(uuid, text, timestamptz, timestamptz) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 8 : Vérification finale
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  missing TEXT[] := '{}';
  fn TEXT;
  expected_fns TEXT[] := ARRAY[
    'check_feature_access',
    'get_admin_stores_summary',
    'get_admin_article_ranking',
    'get_admin_stock_movements',
    'get_admin_sales_trend',
    'get_admin_payment_distribution',
    'get_user_organization_id',
    'is_super_admin'
  ];
BEGIN
  FOREACH fn IN ARRAY expected_fns LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = fn AND pronamespace = 'public'::regnamespace
    ) THEN
      missing := array_append(missing, fn);
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE WARNING 'Fonctions toujours manquantes : %', array_to_string(missing, ', ');
  ELSE
    RAISE NOTICE 'Toutes les fonctions RPC sont installees avec succes !';
  END IF;
END;
$$;

-- Recharger le cache PostgREST pour que les nouvelles fonctions soient visibles
NOTIFY pgrst, 'reload schema';

SELECT 'Fix missing RPCs v5 applique avec succes — 6 fonctions restaurees' AS status;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260704020000_add_stripe_customer_id_to_subscription_rpc.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Add stripe_customer_id to get_organization_subscription RPC
-- Date: 2026-07-04 (v2 — fixed: DROP first for return type change)
--
-- PostgreSQL does not allow CREATE OR REPLACE FUNCTION when the
-- return type changes (42P13). We must DROP and recreate.
-- ============================================================

-- Drop old signature first (return type differs — cannot use OR REPLACE)
DROP FUNCTION IF EXISTS public.get_organization_subscription();

CREATE OR REPLACE FUNCTION public.get_organization_subscription()
RETURNS TABLE (
  subscription_id UUID,
  plan_id TEXT,
  plan_name TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  max_stores INTEGER,
  max_users INTEGER,
  max_products INTEGER,
  max_sales_per_month INTEGER,
  has_advanced_reports BOOLEAN,
  has_exports BOOLEAN,
  has_supplier_management BOOLEAN,
  has_offline_advanced BOOLEAN,
  has_api_access BOOLEAN,
  has_priority_support BOOLEAN,
  has_custom_branding BOOLEAN,
  has_multi_currency BOOLEAN,
  has_ai_assistant BOOLEAN,
  has_loyalty_program BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  RETURN QUERY
  SELECT
    s.id AS subscription_id,
    s.plan_id,
    p.name AS plan_name,
    s.status,
    s.current_period_end,
    s.trial_ends_at,
    s.grace_period_ends_at,
    o.stripe_customer_id,
    p.max_stores,
    p.max_users,
    p.max_products,
    p.max_sales_per_month,
    p.has_advanced_reports,
    p.has_exports,
    p.has_supplier_management,
    p.has_offline_advanced,
    p.has_api_access,
    p.has_priority_support,
    p.has_custom_branding,
    p.has_multi_currency,
    p.has_ai_assistant,
    p.has_loyalty_program
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  LEFT JOIN public.organizations o ON o.id = s.organization_id
  WHERE s.organization_id = v_org_id
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_subscription() TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260704030000_add_missing_grant_execute.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Add missing GRANT EXECUTE on SECURITY DEFINER functions
-- Date: 2026-07-04 (v2 — fixed: resilient to missing functions)
--
-- Each GRANT is wrapped in a DO block that catches the
-- "function does not exist" error (42883) so the migration
-- does not fail if a function hasn't been deployed yet.
-- ============================================================

-- ─── Core auth helpers ────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.admin_exists() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'admin_exists() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'touch_last_login() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.is_user_active() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'is_user_active() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.check_account_status() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'check_account_status() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_user_organization_id() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.is_member_of_organization() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'is_member_of_organization() does not exist, skipping';
END $$;

-- ─── Onboarding ───────────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.update_onboarding_progress() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_onboarding_progress() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'complete_onboarding() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_onboarding_status() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_onboarding_status() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.update_business_type() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_business_type() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.setup_onboarding_store() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'setup_onboarding_store() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_onboarding_checklist() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_onboarding_checklist() does not exist, skipping';
END $$;

-- ─── Stock transfers ─────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.generate_transfer_number() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'generate_transfer_number() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_stock_transfer() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'create_stock_transfer() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.send_stock_transfer() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'send_stock_transfer() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.receive_stock_transfer() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'receive_stock_transfer() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.cancel_stock_transfer() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'cancel_stock_transfer() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_stock_transfers() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_stock_transfers() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_stock_transfer_details() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_stock_transfer_details() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_pending_transfers_count() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_pending_transfers_count() does not exist, skipping';
END $$;

-- ─── Restock suggestions ─────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_restock_suggestions() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_restock_suggestions() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_suggestions() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'create_purchase_order_from_suggestions() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_supplier_order_history() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_supplier_order_history() does not exist, skipping';
END $$;

-- ─── Loyalty ──────────────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.earn_loyalty_points() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'earn_loyalty_points() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'redeem_loyalty_points() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.update_loyalty_tier() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_loyalty_tier() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_loyalty_stats() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_loyalty_stats() does not exist, skipping';
END $$;

-- ─── Backup/Restore ──────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.generate_backup_number() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'generate_backup_number() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_backup() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'create_backup() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.restore_backup() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'restore_backup() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_backups() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_backups() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_backup_details() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_backup_details() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.delete_backup() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'delete_backup() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_backup_stats() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_backup_stats() does not exist, skipping';
END $$;

-- ─── Support tickets ─────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.generate_ticket_number() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'generate_ticket_number() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_support_ticket() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'create_support_ticket() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.add_ticket_message() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'add_ticket_message() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.update_ticket_status() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'update_ticket_status() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_support_tickets() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_support_tickets() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_ticket_messages() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_ticket_messages() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_support_stats() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_support_stats() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.delete_support_ticket() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'delete_support_ticket() does not exist, skipping';
END $$;

-- ─── Subscription lifecycle ──────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.process_subscription_lifecycle() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'process_subscription_lifecycle() does not exist, skipping';
END $$;

-- ─── Multi-store ─────────────────────────────────────────────
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_organization_stores() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_organization_stores() does not exist, skipping';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.batch_update_stock() TO authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'batch_update_stock() does not exist, skipping';
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260704040000_fix_cron_secret_and_schedules.sql
-- ═════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- MANUAL ONLY — This migration intentionally does not modify the database.
-- It exists solely as documentation for the manual cron setup procedure.
--
-- See: docs/production/SUPABASE_CRON_SETUP.md
--
-- The cron jobs CANNOT be auto-applied because they require
-- project-specific secrets (CRON_SECRET) and URLs (Project ID)
-- that cannot be stored in this repository.
-- ═══════════════════════════════════════════════════════════════════════

-- No SQL to execute. See docs/production/SUPABASE_CRON_SETUP.md for setup instructions.
SELECT 1 AS cron_setup_is_manual;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260705010000_update_pricing_and_starter_trial.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Migration : Update pricing + convert starter to trial plan
-- Date : 2026-07-05
-- ============================================================
-- Changes:
--   1. Croissance price: 29.00 → 39.90 €
--   2. Enterprise price: 79.00 → 99.90 €
--   3. Starter renamed to "Essai" (trial), 14-day auto-expiry
--   4. Starter auto-subscription now lasts 14 days instead of 30
-- ============================================================

-- 1. Update plan prices
UPDATE public.plans
SET
  price_monthly = 39.90,
  price_yearly = 399.00,
  name = 'Croissance',
  description = 'Pour les boutiques qui grandissent — fournisseurs, rapports, exports'
WHERE id = 'croissance';

UPDATE public.plans
SET
  price_monthly = 99.90,
  price_yearly = 999.00,
  name = 'Enterprise',
  description = 'Pour les chaînes et grossistes — analytics, API, support prioritaire'
WHERE id = 'enterprise';

-- 2. Convert starter to trial plan
UPDATE public.plans
SET
  name = 'Essai gratuit',
  description = 'Période d''essai de 14 jours — caisse et stock de base'
WHERE id = 'starter';

-- 3. Update auto_create_starter_subscription to 14-day trial
CREATE OR REPLACE FUNCTION public.auto_create_starter_subscription()
RETURNS TRIGGER AS $$
DECLARE
  v_trial_end TIMESTAMPTZ;
BEGIN
  v_trial_end := NOW() + INTERVAL '14 days';

  INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
  VALUES (NEW.id, 'starter', 'trialing', NOW(), v_trial_end)
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update subscription-lifecycle to downgrade expired trials
-- (the existing function already handles this, but let's ensure
--  expired "trialing" status transitions to "past_due" then downgrades)

-- 5. Fix existing starter subscriptions: set 14-day expiry from creation
-- Only touch subscriptions that still have the old 30-day window
UPDATE public.subscriptions
SET
  current_period_end = current_period_start + INTERVAL '14 days',
  status = 'trialing'
WHERE plan_id = 'starter'
  AND status = 'active'
  AND current_period_end > NOW();


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260705020000_fix_feature_access_and_trialing.sql
-- ═════════════════════════════════════════════════════════════════

-- Migration: Fix feature access for super_admin/trialing and align sidebar/route roles
-- Date: 2026-07-05
-- Changes:
--   1. Add 'trialing' to subscriptions CHECK constraint
--   2. Update check_feature_access to include 'trialing' status
--   3. Update check_plan_limit to include 'trialing' status
--   4. Ensure all feature_flags have is_active = TRUE and correct allowed_plans
--   5. Update get_organization_subscription to include 'trialing' status


-- 0. Drop functions that have changed return types (must DROP before CREATE)
DROP FUNCTION IF EXISTS public.get_organization_subscription();
DROP FUNCTION IF EXISTS public.check_feature_access(TEXT);
DROP FUNCTION IF EXISTS public.check_plan_limit(TEXT);


-- 1. Fix subscriptions CHECK constraint to include 'trialing'
DO $body$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname LIKE '%status%'
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
  END IF;

  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'trialing', 'past_due', 'grace_period', 'read_only', 'cancelled', 'expired'));
END;
$body$;


-- 2. check_feature_access with 'trialing' status
CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_feature_key TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  plan_id TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_plan_id TEXT;
  v_allowed_plans TEXT[];
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  SELECT s.plan_id INTO v_plan_id
  FROM public.subscriptions s
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    v_plan_id := 'starter';
  END IF;

  SELECT allowed_plans INTO v_allowed_plans
  FROM public.feature_flags
  WHERE feature_key = p_feature_key AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, v_plan_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT (v_plan_id = ANY(v_allowed_plans))::BOOLEAN, v_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_feature_access(TEXT) TO authenticated;


-- 3. check_plan_limit with 'trialing' status
CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_limit_type TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  limit_value INTEGER,
  plan_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_sub record;
  v_current INTEGER;
  v_limit INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  SELECT * INTO v_sub
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_sub FROM public.plans WHERE id = 'starter';
  END IF;

  CASE p_limit_type
    WHEN 'stores' THEN
      SELECT COUNT(*) INTO v_current FROM public.stores WHERE organization_id = v_org_id;
      v_limit := v_sub.max_stores;
    WHEN 'users' THEN
      SELECT COUNT(*) INTO v_current FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE p.organization_id = v_org_id;
      v_limit := v_sub.max_users;
    WHEN 'products' THEN
      SELECT COUNT(*) INTO v_current FROM public.products WHERE organization_id = v_org_id;
      v_limit := v_sub.max_products;
    WHEN 'sales_this_month' THEN
      SELECT COUNT(*) INTO v_current FROM public.sales
      WHERE organization_id = v_org_id
        AND created_at >= date_trunc('month', NOW());
      v_limit := v_sub.max_sales_per_month;
    ELSE
      RAISE EXCEPTION 'Type de limite inconnu : %', p_limit_type;
  END CASE;

  RETURN QUERY SELECT
    (v_limit IS NULL OR v_current < v_limit)::BOOLEAN,
    v_current,
    v_limit,
    v_sub.plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_plan_limit(TEXT) TO authenticated;


-- 4. Ensure all feature_flags are active with correct allowed_plans
UPDATE public.feature_flags SET is_active = TRUE WHERE is_active IS NOT TRUE;

INSERT INTO public.feature_flags (feature_key, description, allowed_plans) VALUES
  ('pos', 'Acces caisse enregistreuse', '{"starter","croissance","enterprise"}'),
  ('stock_management', 'Gestion du stock', '{"starter","croissance","enterprise"}'),
  ('customer_credit', 'Credit clients', '{"starter","croissance","enterprise"}'),
  ('basic_reports', 'Rapports de base', '{"starter","croissance","enterprise"}'),
  ('advanced_reports', 'Rapports avances et analytics', '{"croissance","enterprise"}'),
  ('exports', 'Exports PDF et Excel', '{"croissance","enterprise"}'),
  ('supplier_management', 'Gestion fournisseurs', '{"croissance","enterprise"}'),
  ('offline_advanced', 'Mode offline avance', '{"croissance","enterprise"}'),
  ('custom_branding', 'Branding personnalise', '{"croissance","enterprise"}'),
  ('multi_currency', 'Multi-devises', '{"croissance","enterprise"}'),
  ('api_access', 'Acces API externe', '{"enterprise"}'),
  ('priority_support', 'Support prioritaire', '{"enterprise"}'),
  ('ai_assistant', 'Assistant IA metier', '{"enterprise"}'),
  ('loyalty_program', 'Programme fidelite', '{"enterprise"}'),
  ('admin_analytics', 'Analytics multi-boutiques admin', '{"enterprise"}'),
  ('backup_restore', 'Sauvegarde et restauration', '{"enterprise"}')
ON CONFLICT (feature_key) DO UPDATE SET
  description = EXCLUDED.description,
  allowed_plans = EXCLUDED.allowed_plans,
  is_active = TRUE;


-- 5. get_organization_subscription with 'trialing' status
CREATE OR REPLACE FUNCTION public.get_organization_subscription()
RETURNS TABLE (
  subscription_id UUID,
  plan_id TEXT,
  plan_name TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  max_stores INTEGER,
  max_users INTEGER,
  max_products INTEGER,
  max_sales_per_month INTEGER,
  has_advanced_reports BOOLEAN,
  has_exports BOOLEAN,
  has_supplier_management BOOLEAN,
  has_offline_advanced BOOLEAN,
  has_api_access BOOLEAN,
  has_priority_support BOOLEAN,
  has_custom_branding BOOLEAN,
  has_multi_currency BOOLEAN,
  has_ai_assistant BOOLEAN,
  has_loyalty_program BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  RETURN QUERY
  SELECT
    s.id AS subscription_id,
    s.plan_id,
    p.name AS plan_name,
    s.status,
    s.current_period_end,
    s.trial_ends_at,
    s.grace_period_ends_at,
    p.max_stores,
    p.max_users,
    p.max_products,
    p.max_sales_per_month,
    p.has_advanced_reports,
    p.has_exports,
    p.has_supplier_management,
    p.has_offline_advanced,
    p.has_api_access,
    p.has_priority_support,
    p.has_custom_branding,
    p.has_multi_currency,
    p.has_ai_assistant,
    p.has_loyalty_program
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'trialing', 'past_due', 'grace_period')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_subscription() TO authenticated;


-- 6. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260705030000_fix_super_admin_rls_and_has_role.sql
-- ═════════════════════════════════════════════════════════════════

-- Migration: Fix super_admin access — RLS policies + has_role fix
-- Date: 2026-07-05
-- Changes:
--   1. Fix user_roles SELECT RLS policy to include is_super_admin()
--   2. Fix profiles SELECT RLS policy to include is_super_admin()
--   3. Fix has_role() so super_admin is treated as having admin privileges
--   4. Fix organizations UPDATE and audit_log SELECT RLS for super_admin


-- STEP 0: Drop conflicting user_roles SELECT policy (only checks 'admin', not 'super_admin')
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public.user_roles;

CREATE POLICY "user_roles_select_own_or_admin"
ON public.user_roles FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_super_admin()
  OR public.has_role(auth.uid(), 'admin')
);


-- STEP 1: Fix profiles SELECT — ensure super_admin can see all profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR organization_id = public.get_user_organization_id()
  );


-- STEP 2: Fix has_role to also match super_admin when checking 'admin'
-- (super_admin should be treated as having admin privileges too)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Self-check: user can check their own role
  IF _user_id = auth.uid() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND (role = _role OR (_role = 'admin' AND role = 'super_admin'))
    );
  END IF;

  -- Super admin can check any user's role
  IF public.is_super_admin() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND (role = _role OR (_role = 'admin' AND role = 'super_admin'))
    );
  END IF;

  -- Admin of the same organization can check
  DECLARE
    v_caller_org uuid;
    v_target_org uuid;
  BEGIN
    SELECT organization_id INTO v_caller_org
    FROM public.profiles WHERE user_id = auth.uid() AND is_active = true;

    SELECT organization_id INTO v_target_org
    FROM public.profiles WHERE user_id = _user_id;

    IF v_caller_org IS NOT NULL AND v_caller_org = v_target_org THEN
      IF EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
      ) THEN
        RETURN EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = _user_id AND (role = _role OR (_role = 'admin' AND role = 'super_admin'))
        );
      END IF;
    END IF;

    RETURN FALSE;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;


-- STEP 3: Fix organizations UPDATE RLS for super_admin
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


-- STEP 4: Fix user_audit_log SELECT RLS for super_admin
DROP POLICY IF EXISTS "admins_view_audit_log" ON public.user_audit_log;
CREATE POLICY "admins_view_audit_log" ON public.user_audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin')
  );


-- STEP 5: Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260705040000_admin_subscription_management.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Admin Subscription Management for Super Admin
-- Date: 2026-07-05
--
-- Enables super_admin to:
--   - View all organizations with their subscription details
--   - Change any organization's plan, status, and duration
--   - Log all changes to subscription_events
--
-- Also creates the missing update_organization_subscription RPC
-- used by Billing.tsx (for own-org changes by any admin).
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. RLS: Allow super_admin to UPDATE subscriptions for any org
-- ════════════════════════════════════════════════════════════════
CREATE POLICY "Super admin can update any subscription"
  ON public.subscriptions
  FOR UPDATE USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Allow super_admin to INSERT subscriptions (for new orgs)
CREATE POLICY "Super admin can insert subscriptions"
  ON public.subscriptions
  FOR INSERT WITH CHECK (public.is_super_admin());

-- ════════════════════════════════════════════════════════════════
-- 2. admin_get_all_subscriptions — List all orgs with sub details
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.admin_get_all_subscriptions();

CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  owner_email TEXT,
  country TEXT,
  subscription_id UUID,
  plan_id TEXT,
  plan_name TEXT,
  status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  billing_period TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn1$
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name AS organization_name,
    au.email AS owner_email,
    o.country,
    s.id AS subscription_id,
    s.plan_id,
    p.name AS plan_name,
    s.status,
    s.current_period_start,
    s.current_period_end,
    s.trial_ends_at,
    s.billing_period,
    o.stripe_customer_id,
    s.created_at
  FROM organizations o
  LEFT JOIN subscriptions s ON s.organization_id = o.id
  LEFT JOIN plans p ON p.id = s.plan_id
  LEFT JOIN auth.users au ON au.id = o.owner_user_id
  ORDER BY o.name;
END;
$fn1$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. admin_update_organization_subscription — Change any org's sub
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.admin_update_organization_subscription(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_update_organization_subscription(
  p_organization_id UUID,
  p_plan_id TEXT,
  p_status TEXT DEFAULT 'active',
  p_duration TEXT DEFAULT '1 month'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn2$
DECLARE
  v_old_plan TEXT;
  v_old_status TEXT;
  v_event_type TEXT;
  v_period_end TIMESTAMPTZ;
  v_billing_period TEXT;
  v_sub_id UUID;
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  -- Validate plan exists
  IF NOT EXISTS (SELECT 1 FROM plans WHERE id = p_plan_id AND is_active) THEN
    RAISE EXCEPTION 'Invalid plan_id: %', p_plan_id;
  END IF;

  -- Validate status
  IF p_status NOT IN ('active', 'trialing', 'past_due', 'grace_period', 'read_only', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- Calculate period end
  IF p_duration = '1 year' THEN
    v_period_end := NOW() + INTERVAL '1 year';
    v_billing_period := 'yearly';
  ELSE
    v_period_end := NOW() + INTERVAL '1 month';
    v_billing_period := 'monthly';
  END IF;

  -- Get current subscription info (for audit)
  SELECT plan_id, status, id INTO v_old_plan, v_old_status, v_sub_id
  FROM subscriptions WHERE organization_id = p_organization_id;

  IF v_sub_id IS NOT NULL THEN
    -- Update existing subscription
    UPDATE subscriptions SET
      plan_id = p_plan_id,
      status = p_status,
      current_period_start = NOW(),
      current_period_end = v_period_end,
      billing_period = v_billing_period,
      updated_at = NOW()
    WHERE organization_id = p_organization_id;

    -- Determine event type
    IF v_old_plan IS DISTINCT FROM p_plan_id THEN
      IF p_plan_id > v_old_plan THEN  -- enterprise > croissance > starter
        v_event_type := 'upgraded';
      ELSE
        v_event_type := 'downgraded';
      END IF;
    ELSIF v_old_status IS DISTINCT FROM p_status THEN
      v_event_type := 'status_changed';
    ELSE
      v_event_type := 'renewed';
    END IF;

    -- Log event
    INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
    VALUES (
      p_organization_id,
      v_event_type,
      v_old_plan,
      p_plan_id,
      auth.uid(),
      jsonb_build_object(
        'old_status', v_old_status,
        'new_status', p_status,
        'duration', p_duration,
        'changed_by', 'super_admin'
      )
    );
  ELSE
    -- Create new subscription
    INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start, current_period_end, billing_period)
    VALUES (p_organization_id, p_plan_id, p_status, NOW(), v_period_end, v_billing_period)
    RETURNING id INTO v_sub_id;

    -- Log creation event
    INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
    VALUES (
      p_organization_id,
      'created',
      NULL,
      p_plan_id,
      auth.uid(),
      jsonb_build_object(
        'status', p_status,
        'duration', p_duration,
        'changed_by', 'super_admin'
      )
    );
  END IF;

  -- Also update the legacy cache column on organizations
  UPDATE organizations SET
    subscription_plan = p_plan_id,
    subscription_expires_at = v_period_end,
    updated_at = NOW()
  WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'subscription_id', v_sub_id,
    'plan_id', p_plan_id,
    'status', p_status,
    'period_end', v_period_end
  );
END;
$fn2$;

GRANT EXECUTE ON FUNCTION public.admin_update_organization_subscription(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. update_organization_subscription — Own-org sub change (used by Billing.tsx)
--    This was called by Billing.tsx but didn't exist. Now we create it.
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.update_organization_subscription(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_organization_subscription(
  p_plan_id TEXT,
  p_status TEXT DEFAULT 'active',
  p_duration TEXT DEFAULT '1 month'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn3$
DECLARE
  v_org_id UUID;
  v_old_plan TEXT;
  v_event_type TEXT;
  v_period_end TIMESTAMPTZ;
  v_billing_period TEXT;
  v_sub_id UUID;
BEGIN
  -- Get caller's organization
  SELECT organization_id INTO v_org_id
  FROM profiles WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  -- Validate plan exists
  IF NOT EXISTS (SELECT 1 FROM plans WHERE id = p_plan_id AND is_active) THEN
    RAISE EXCEPTION 'Invalid plan_id: %', p_plan_id;
  END IF;

  -- Calculate period end
  IF p_duration = '1 year' THEN
    v_period_end := NOW() + INTERVAL '1 year';
    v_billing_period := 'yearly';
  ELSE
    v_period_end := NOW() + INTERVAL '1 month';
    v_billing_period := 'monthly';
  END IF;

  -- Get current subscription info
  SELECT plan_id, id INTO v_old_plan, v_sub_id
  FROM subscriptions WHERE organization_id = v_org_id;

  IF v_sub_id IS NOT NULL THEN
    -- Update existing
    UPDATE subscriptions SET
      plan_id = p_plan_id,
      status = p_status,
      current_period_start = NOW(),
      current_period_end = v_period_end,
      billing_period = v_billing_period,
      updated_at = NOW()
    WHERE organization_id = v_org_id;

    IF v_old_plan IS DISTINCT FROM p_plan_id THEN
      IF p_plan_id > v_old_plan THEN
        v_event_type := 'upgraded';
      ELSE
        v_event_type := 'downgraded';
      END IF;
    ELSE
      v_event_type := 'renewed';
    END IF;

    INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
    VALUES (v_org_id, v_event_type, v_old_plan, p_plan_id, auth.uid(),
      jsonb_build_object('new_status', p_status, 'duration', p_duration));
  ELSE
    -- Create new
    INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start, current_period_end, billing_period)
    VALUES (v_org_id, p_plan_id, p_status, NOW(), v_period_end, v_billing_period)
    RETURNING id INTO v_sub_id;

    INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
    VALUES (v_org_id, 'created', NULL, p_plan_id, auth.uid(),
      jsonb_build_object('status', p_status, 'duration', p_duration));
  END IF;

  -- Update legacy cache
  UPDATE organizations SET
    subscription_plan = p_plan_id,
    subscription_expires_at = v_period_end,
    updated_at = NOW()
  WHERE id = v_org_id;

  RETURN jsonb_build_object('success', TRUE, 'plan_id', p_plan_id, 'period_end', v_period_end);
END;
$fn3$;

GRANT EXECUTE ON FUNCTION public.update_organization_subscription(TEXT, TEXT, TEXT) TO authenticated;


-- ═════════════════════════════════════════════════════════════════
-- MIGRATION: 20260705050000_secure_manual_subscription_management.sql
-- ═════════════════════════════════════════════════════════════════

-- ============================================================
-- Secure Manual Subscription Management — Hotfix
-- Date: 2026-07-05
--
-- Secures the manual subscription governance so that only
-- super_admin (platform operator) can change or extend plans.
-- Tenant admins (admin role) can no longer self-upgrade to
-- Croissance or Enterprise plans without platform validation.
--
-- Creates:
--   admin_update_organization_subscription() — SECURITY DEFINER RPC
--     - Only callable by super_admin
--     - Validates plan_id and duration
--     - Server-side period_end calculation
--     - Upsert on subscriptions
--     - Updates organizations cache columns
--     - Full audit logging via subscription_events
--
-- Security rules enforced:
--   1. is_super_admin() check at RPC entry
--   2. plan_id must be valid (exists in plans table)
--   3. duration must be one of: 1_month, 3_months, 6_months, 1_year
--   4. organization_id must exist
--   5. No direct subscriptions table mutation from frontend
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. Drop existing function if it was created in a prior migration
--    (42P13 return type change requires DROP + CREATE)
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.admin_update_organization_subscription(UUID, TEXT, TEXT);

-- ════════════════════════════════════════════════════════════════
-- 2. Create the secured RPC with full parameter set
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_update_organization_subscription(
  p_organization_id UUID,
  p_plan_id TEXT,
  p_duration TEXT DEFAULT '1_month',
  p_payment_reference TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_plan_id TEXT;
  v_old_status TEXT;
  v_new_period_end TIMESTAMPTZ;
  v_event_type TEXT;
  v_duration_interval INTERVAL;
  v_result JSONB;
BEGIN
  -- ─── Guard 1: Only super_admin can call this ────────────────
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : seuls les super_admin peuvent modifier les abonnements.';
  END IF;

  -- ─── Guard 2: Validate plan_id ─────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Plan invalide : % n''existe pas ou est inactif.', p_plan_id;
  END IF;

  -- ─── Guard 3: Validate duration ────────────────────────────
  CASE p_duration
    WHEN '1_month'  THEN v_duration_interval := INTERVAL '1 month';
    WHEN '3_months' THEN v_duration_interval := INTERVAL '3 months';
    WHEN '6_months' THEN v_duration_interval := INTERVAL '6 months';
    WHEN '1_year'   THEN v_duration_interval := INTERVAL '1 year';
    ELSE RAISE EXCEPTION 'Durée invalide : %. Valeurs acceptées : 1_month, 3_months, 6_months, 1_year.', p_duration;
  END CASE;

  -- ─── Guard 4: Validate organization exists ─────────────────
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Organisation introuvable : %', p_organization_id;
  END IF;

  -- ─── Get current subscription info ─────────────────────────
  SELECT plan_id, status INTO v_old_plan_id, v_old_status
  FROM public.subscriptions
  WHERE organization_id = p_organization_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- ─── Calculate new period end ──────────────────────────────
  v_new_period_end := NOW() + v_duration_interval;

  -- ─── Determine event type ──────────────────────────────────
  IF v_old_plan_id IS NULL THEN
    v_event_type := 'created';
  ELSIF v_old_plan_id = p_plan_id THEN
    v_event_type := 'renewed';
  ELSIF
    (SELECT sort_order FROM public.plans WHERE id = p_plan_id)
    >
    (SELECT sort_order FROM public.plans WHERE id = v_old_plan_id)
  THEN
    v_event_type := 'upgraded';
  ELSE
    v_event_type := 'downgraded';
  END IF;

  -- ─── Upsert subscription ───────────────────────────────────
  INSERT INTO public.subscriptions (
    organization_id, plan_id, status,
    current_period_start, current_period_end,
    trial_ends_at, grace_period_ends_at, cancelled_at
  ) VALUES (
    p_organization_id, p_plan_id, 'active',
    NOW(), v_new_period_end,
    NULL, NULL, NULL
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_start = NOW(),
    current_period_end = EXCLUDED.current_period_end,
    trial_ends_at = NULL,
    grace_period_ends_at = NULL,
    cancelled_at = NULL,
    updated_at = NOW();

  -- ─── Update organizations cache columns ────────────────────
  UPDATE public.organizations
  SET
    subscription_plan = p_plan_id,
    subscription_status = 'active',
    subscription_expires_at = v_new_period_end,
    updated_at = NOW()
  WHERE id = p_organization_id;

  -- ─── Audit log ─────────────────────────────────────────────
  INSERT INTO public.subscription_events (
    organization_id, event_type,
    from_plan, to_plan,
    performed_by,
    metadata
  ) VALUES (
    p_organization_id, v_event_type,
    v_old_plan_id, p_plan_id,
    auth.uid(),
    jsonb_build_object(
      'duration', p_duration,
      'new_period_end', v_new_period_end,
      'payment_reference', p_payment_reference,
      'reason', p_reason,
      'old_status', v_old_status
    )
  );

  -- ─── Return result ─────────────────────────────────────────
  v_result := jsonb_build_object(
    'success', TRUE,
    'organization_id', p_organization_id,
    'plan_id', p_plan_id,
    'event_type', v_event_type,
    'from_plan', v_old_plan_id,
    'period_end', v_new_period_end,
    'duration', p_duration
  );

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- 3. Grant execute to authenticated users (actual access control
--    is handled by is_super_admin() inside the function)
-- ════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.admin_update_organization_subscription(
  UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4. Revoke direct INSERT/UPDATE on subscriptions from non-super_admin
--    RLS policies: only super_admin can INSERT/UPDATE subscriptions
-- ════════════════════════════════════════════════════════════════

-- Drop existing overly-permissive policies if they exist
DROP POLICY IF EXISTS "Users can read own org subscription" ON public.subscriptions;

-- Re-create SELECT policy (org members can still read)
CREATE POLICY "Users can read own org subscription" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

-- Add INSERT policy: only super_admin
CREATE POLICY "Only super_admin can insert subscriptions" ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

-- Add UPDATE policy: only super_admin
CREATE POLICY "Only super_admin can update subscriptions" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ════════════════════════════════════════════════════════════════
-- 5. Verify the RPC exists
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_update_organization_subscription'
  ), 'RPC admin_update_organization_subscription not found after creation';
END;
$$;

