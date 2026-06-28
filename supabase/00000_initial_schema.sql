-- ═══════════════════════════════════════════════════════════════════════
-- MAKITIPLUS — Schéma initial complet (projet Supabase vierge)
-- Exécuter dans : Supabase Dashboard → SQL Editor
-- Exécuter EN PREMIER avant toute autre migration
-- Date : Juin 2026 — Marché guinéen (GNF)
-- ═══════════════════════════════════════════════════════════════════════

-- ============================================================
-- 0. ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'vendeur', 'comptable');
CREATE TYPE public.payment_method AS ENUM ('cash', 'wave', 'orange_money', 'mtn_money', 'moov_money', 'mpesa', 'card', 'credit');
CREATE TYPE public.subscription_plan AS ENUM ('starter', 'croissance', 'enterprise');
CREATE TYPE public.sync_status AS ENUM ('synced', 'pending', 'conflict');

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_name text NOT NULL,
  owner_name text NOT NULL,
  phone text,
  address text,
  city text,
  country text DEFAULT 'Guinée',
  currency text DEFAULT 'GNF',
  subscription_plan public.subscription_plan DEFAULT 'starter',
  subscription_expires_at timestamptz,
  organization_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  deactivated_at timestamptz,
  deactivation_reason text,
  is_test_account boolean NOT NULL DEFAULT false,
  test_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. USER_ROLES
-- ============================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Un seul rôle admin par organisation (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_admin
  ON public.user_roles (role) WHERE role = 'admin';

-- ============================================================
-- 3. ORGANIZATIONS
-- ============================================================
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL,
  country text DEFAULT 'Guinée',
  currency text DEFAULT 'GNF',
  subscription_plan public.subscription_plan DEFAULT 'starter',
  subscription_expires_at timestamptz,
  default_tax_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. CATEGORIES
-- ============================================================
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  icon text,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. PRODUCTS
-- ============================================================
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL,
  cost_price numeric,
  stock_quantity integer NOT NULL DEFAULT 0,
  min_stock_alert integer,
  barcode text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  image_url text,
  unit text,
  is_active boolean DEFAULT true,
  expiry_date date,
  tax_rate numeric,
  sync_status public.sync_status,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. CUSTOMERS
-- ============================================================
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  total_purchases numeric NOT NULL DEFAULT 0,
  total_credit numeric NOT NULL DEFAULT 0,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. SALES
-- ============================================================
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sale_number text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  subtotal numeric NOT NULL,
  tax_amount numeric,
  discount_amount numeric,
  total_amount numeric NOT NULL,
  amount_paid numeric NOT NULL,
  change_amount numeric,
  payment_method public.payment_method NOT NULL,
  notes text,
  seller_name text,
  sync_status public.sync_status,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. SALE_ITEMS
-- ============================================================
CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. CUSTOMER_CREDITS
-- ============================================================
CREATE TABLE public.customer_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id),
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('credit', 'payment')),
  description text,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 10. EXPENSES
-- ============================================================
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL,
  description text,
  expense_date date NOT NULL DEFAULT now(),
  payment_method public.payment_method,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 11. STOCK_MOVEMENTS
-- ============================================================
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id),
  type text NOT NULL,
  quantity integer NOT NULL,
  previous_quantity integer NOT NULL,
  new_quantity integer NOT NULL,
  reason text,
  reference_id uuid REFERENCES public.sales(id),
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 12. SYNC_CONFLICTS
-- ============================================================
CREATE TABLE public.sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  device_id text,
  local_data jsonb,
  remote_data jsonb,
  resolved_data jsonb,
  resolution_strategy text NOT NULL,
  status text NOT NULL DEFAULT 'resolved',
  error_message text,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 13. USER_AUDIT_LOG
-- ============================================================
CREATE TABLE public.user_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  target_user_id uuid,
  target_user_name text,
  action text NOT NULL,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 14. PASSWORD_RESET_TOKENS
-- ============================================================
CREATE TABLE public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  destination text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  organization_id uuid
);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════
-- FONCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Vérifier si un admin existe (pour le premier signup)
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin');
$$;

-- Récupérer l'organisation de l'utilisateur connecté
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Vérifier si l'utilisateur est membre d'une organisation
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

-- Vérifier le rôle d'un utilisateur
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Vérifier si un utilisateur est actif
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_active FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- Vérifier le statut du compte
CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE(is_active boolean, deactivation_reason text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.is_active, p.deactivation_reason
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
$$;

-- Mettre à jour last_login_at
CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET last_login_at = now() WHERE user_id = auth.uid();
END;
$$;

-- Générer un numéro de vente
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
  org_id uuid;
  prefix text;
BEGIN
  org_id := public.get_user_organization_id();
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '[0-9]+$') AS integer)), 0) + 1
    INTO next_num
    FROM public.sales
    WHERE organization_id = org_id;
  prefix := 'VTE-';
  RETURN prefix || LPAD(next_num::text, 6, '0');
END;
$$;

-- Résoudre un conflit de stock
CREATE OR REPLACE FUNCTION public.resolve_stock_conflict(
  previous_qty integer,
  local_new_qty integer,
  remote_new_qty integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0, previous_qty + (local_new_qty - previous_qty) + (remote_new_qty - previous_qty) - previous_qty);
$$;

-- Batch stock update (ventes atomiques)
CREATE OR REPLACE FUNCTION public.batch_update_stock(
  p_sale_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  new_qty integer;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.products
    SET stock_quantity = stock_quantity - (item->>'quantity')::int
    WHERE id = (item->>'product_id')::uuid
    RETURNING stock_quantity INTO new_qty;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', item->>'product_id';
    END IF;

    IF new_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product %', item->>'product_id';
    END IF;

    INSERT INTO public.stock_movements (user_id, product_id, type, quantity, previous_quantity, new_quantity, reference_id, organization_id)
    VALUES (
      (SELECT user_id FROM public.sales WHERE id = p_sale_id),
      (item->>'product_id')::uuid,
      'sale',
      -(item->>'quantity')::int,
      (item->>'previous_quantity')::int,
      new_qty,
      p_sale_id,
      (SELECT organization_id FROM public.sales WHERE id = p_sale_id)
    );
  END LOOP;
END;
$$;

-- Auto-assign organization_id
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

-- Auto-assign sale_items.organization_id from parent sale
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

-- ═══════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════

-- updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-assign organization_id on INSERT
CREATE TRIGGER auto_org_products BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER auto_org_categories BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER auto_org_customers BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER auto_org_credits BEFORE INSERT ON public.customer_credits
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER auto_org_sales BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER auto_org_expenses BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER auto_org_stock BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER auto_org_sale_items BEFORE INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.set_sale_item_organization();

-- ═══════════════════════════════════════════════════════════════════════
-- INDEX
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_test_expiry ON public.profiles(test_expires_at)
  WHERE is_test_account = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_products_org ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode) WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_categories_org ON public.categories(organization_id);

CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers(organization_id);

CREATE INDEX IF NOT EXISTS idx_sales_org ON public.sales(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sale_items_org ON public.sale_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);

CREATE INDEX IF NOT EXISTS idx_credits_org ON public.customer_credits(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_customer_id ON public.customer_credits(customer_id);

CREATE INDEX IF NOT EXISTS idx_expenses_org ON public.expenses(organization_id);

CREATE INDEX IF NOT EXISTS idx_stock_org ON public.stock_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id ON public.stock_movements(reference_id);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_org ON public.sync_conflicts(organization_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_user_acknowledged
  ON public.sync_conflicts(user_id, acknowledged, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_created_at ON public.user_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.user_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_target_user ON public.user_audit_log(target_user_id);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_tokens_user ON public.password_reset_tokens(user_id, used_at);

-- ═══════════════════════════════════════════════════════════════════════
-- FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.categories
  ADD CONSTRAINT categories_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.products
  ADD CONSTRAINT products_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.customers
  ADD CONSTRAINT customers_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.customer_credits
  ADD CONSTRAINT customer_credits_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.sales
  ADD CONSTRAINT sales_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.sync_conflicts
  ADD CONSTRAINT sync_conflicts_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.password_reset_tokens
  ADD CONSTRAINT password_reset_tokens_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

-- ═══════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════

-- -----------------------------------------------------------
-- PROFILES
-- -----------------------------------------------------------
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------
-- USER_ROLES
-- -----------------------------------------------------------
CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------
-- ORGANIZATIONS
-- -----------------------------------------------------------
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

-- -----------------------------------------------------------
-- CATEGORIES
-- -----------------------------------------------------------
CREATE POLICY "org_members_view_categories" ON public.categories
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_members_insert_categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

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

CREATE POLICY "org_admins_delete_categories" ON public.categories
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- -----------------------------------------------------------
-- PRODUCTS
-- -----------------------------------------------------------
CREATE POLICY "org_members_view_products" ON public.products
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_members_insert_products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

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

CREATE POLICY "org_admins_delete_products" ON public.products
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- -----------------------------------------------------------
-- CUSTOMERS
-- -----------------------------------------------------------
CREATE POLICY "org_members_view_customers" ON public.customers
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_members_insert_customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id());

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

CREATE POLICY "org_admins_delete_customers" ON public.customers
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- -----------------------------------------------------------
-- SALES
-- -----------------------------------------------------------
CREATE POLICY "org_members_view_sales" ON public.sales
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_members_insert_sales" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "org_admins_update_sales" ON public.sales
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- -----------------------------------------------------------
-- SALE_ITEMS
-- -----------------------------------------------------------
CREATE POLICY "org_members_view_sale_items" ON public.sale_items
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_members_insert_sale_items" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id());

-- -----------------------------------------------------------
-- CUSTOMER_CREDITS
-- -----------------------------------------------------------
CREATE POLICY "org_members_view_credits" ON public.customer_credits
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_admins_insert_credits" ON public.customer_credits
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'comptable'))
  );

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

CREATE POLICY "org_admins_delete_credits" ON public.customer_credits
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_role(auth.uid(), 'admin')
  );

-- -----------------------------------------------------------
-- EXPENSES (comptable + admin/manager)
-- -----------------------------------------------------------
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

-- -----------------------------------------------------------
-- STOCK_MOVEMENTS
-- -----------------------------------------------------------
CREATE POLICY "org_members_view_stock" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_members_insert_stock" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id());

-- -----------------------------------------------------------
-- SYNC_CONFLICTS
-- -----------------------------------------------------------
CREATE POLICY "org_members_view_sync_conflicts" ON public.sync_conflicts
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "sync_conflicts_insert_own_org" ON public.sync_conflicts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.get_user_organization_id()
  );

CREATE POLICY "sync_conflicts_update_own" ON public.sync_conflicts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- -----------------------------------------------------------
-- USER_AUDIT_LOG (admin uniquement)
-- -----------------------------------------------------------
CREATE POLICY "admins_view_audit_log" ON public.user_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins_insert_audit_log" ON public.user_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------
-- PASSWORD_RESET_TOKENS
-- -----------------------------------------------------------
CREATE POLICY "admins_view_reset_tokens" ON public.password_reset_tokens
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND (
      organization_id = public.get_user_organization_id()
      OR organization_id IS NULL
    )
  );

CREATE POLICY "admins_insert_reset_tokens" ON public.password_reset_tokens
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins_update_reset_tokens" ON public.password_reset_tokens
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ═══════════════════════════════════════════════════════════════════════
-- GRANTS — autoriser admin_exists() pour les utilisateurs non connectés
-- ═══════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- RÉVOQUER les fonctions sensibles de anon
-- ═══════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.is_user_active(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_organization_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_sale_item_organization() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_sale_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_organization_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_member_of_organization(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_account_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_last_login() FROM anon;

-- Révoquer PUBLIC sur toutes les fonctions SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.is_user_active(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_organization_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_sale_item_organization() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_sale_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_organization_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_member_of_organization(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_account_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_last_login() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_update_stock(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_stock_conflict(integer, integer, integer) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════
-- ✅ Schéma initial terminé !
-- ═══════════════════════════════════════════════════════════════════════
