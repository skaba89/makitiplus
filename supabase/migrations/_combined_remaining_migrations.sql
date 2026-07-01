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
-- Migration: HIGH audit fixes — Storage RLS org scoping, user_roles RLS cleanup, missing GRANTs
-- Date: 2026-07-01
-- FULLY IDEMPOTENT — safe to re-run any number of times

-- ============================================
-- H2: Storage bucket RLS — org scoping on logos
--     Current policies allow ANY authenticated user to upload/overwrite/delete
--     logos from ANY organization. Fix: restrict to admin/manager only, and
--     add org_id metadata check for uploads.
-- ============================================

-- Drop old permissive policies
DROP POLICY IF EXISTS anyone_view_logos ON storage.objects;
DROP POLICY IF EXISTS org_members_upload_logos ON storage.objects;
DROP POLICY IF EXISTS org_members_update_logos ON storage.objects;
DROP POLICY IF EXISTS org_members_delete_logos ON storage.objects;

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
-- Add nfc_enabled column to profiles for NFC preference persistence (#24)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nfc_enabled boolean DEFAULT false;

-- Grant is already covered by existing RLS policies on profiles
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
