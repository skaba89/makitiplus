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
