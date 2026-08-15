-- ════════════════════════════════════════════════════════════════
-- Audit fonctionnel/métier + code du 2026-08-14 — contraintes CHECK
-- manquantes sur les tables financières
--
-- Constat : products.stock_quantity est la SEULE colonne financière
-- protégée par une contrainte CHECK en base (products_stock_quantity_nonneg,
-- migration 20260719100000). sales, sale_items, expenses n'ont aucun
-- garde-fou au niveau base contre un montant ou une quantité négative --
-- la validation actuelle repose entièrement sur le code applicatif
-- (client + RPC), sans filet de sécurité en profondeur en cas de bug
-- futur, d'appel RPC direct malformé, ou de correctif qui oublierait une
-- vérification.
--
-- Vérifié en lecture seule avant cette migration (aucune ligne existante
-- ne violerait ces contraintes) :
--   sales.total_amount<0, subtotal<0, amount_paid<0, discount_amount<0,
--   change_amount<0, tax_amount<0, sale_items.quantity<=0, unit_price<0,
--   total_price<0, cost_price<0, expenses.amount<=0, products.price<0,
--   products.cost_price<0 : 0 ligne pour chaque cas -- migration sûre,
--   aucun backfill nécessaire.
--
-- Chaque contrainte est ajoutée de façon idempotente (vérifie son
-- existence au préalable), même pattern que products_stock_quantity_nonneg
-- (migration 20260719100000_security_fixes_audit.sql).
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- ─── sales ──────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_total_amount_nonneg'
  ) THEN
    ALTER TABLE public.sales ADD CONSTRAINT sales_total_amount_nonneg CHECK (total_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_subtotal_nonneg'
  ) THEN
    ALTER TABLE public.sales ADD CONSTRAINT sales_subtotal_nonneg CHECK (subtotal >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_amount_paid_nonneg'
  ) THEN
    ALTER TABLE public.sales ADD CONSTRAINT sales_amount_paid_nonneg CHECK (amount_paid >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_discount_amount_nonneg'
  ) THEN
    ALTER TABLE public.sales ADD CONSTRAINT sales_discount_amount_nonneg CHECK (discount_amount IS NULL OR discount_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_change_amount_nonneg'
  ) THEN
    ALTER TABLE public.sales ADD CONSTRAINT sales_change_amount_nonneg CHECK (change_amount IS NULL OR change_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sales_tax_amount_nonneg'
  ) THEN
    ALTER TABLE public.sales ADD CONSTRAINT sales_tax_amount_nonneg CHECK (tax_amount IS NULL OR tax_amount >= 0);
  END IF;

  -- ─── sale_items ─────────────────────────────────────────────
  -- quantity > 0 strict : une ligne de vente à quantité nulle ou négative
  -- n'a pas de sens métier (contrairement à stock_movements, où une
  -- sortie de stock négative est le mécanisme normal).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sale_items_quantity_positive'
  ) THEN
    ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_quantity_positive CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sale_items_unit_price_nonneg'
  ) THEN
    ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_unit_price_nonneg CHECK (unit_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sale_items_total_price_nonneg'
  ) THEN
    ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_total_price_nonneg CHECK (total_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sale_items_cost_price_nonneg'
  ) THEN
    ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_cost_price_nonneg CHECK (cost_price IS NULL OR cost_price >= 0);
  END IF;

  -- ─── expenses ───────────────────────────────────────────────
  -- amount > 0 strict : une dépense à 0 ou négative n'a pas de sens
  -- métier (une correction/remboursement se fait par une autre écriture,
  -- pas par une dépense négative -- aucun code du dépôt ne construit une
  -- dépense négative intentionnellement).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'expenses_amount_positive'
  ) THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0);
  END IF;

  -- ─── products ───────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'products_price_nonneg'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_price_nonneg CHECK (price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'products_cost_price_nonneg'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_cost_price_nonneg CHECK (cost_price IS NULL OR cost_price >= 0);
  END IF;

  RAISE NOTICE 'Contraintes CHECK financieres ajoutees (sales, sale_items, expenses, products)';
END $$;
