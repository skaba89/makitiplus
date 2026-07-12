-- ============================================================
-- Migration : ajouter colonnes description, expiry_date, is_active à products
-- Date: 2026-07-12
-- ============================================================
-- BUG : "column "description" of relation "products" does not exist"
--
-- Cause : Le frontend (ProductForm.tsx) et la RPC create_product
-- utilisent description / expiry_date / is_active, mais aucune migration
-- n'a ajouté ces colonnes à la table products.
--
-- Le type TypeScript (src/integrations/supabase/types.ts) déclare
-- expiry_date et is_active mais PAS description — il y avait un mismatch.
--
-- Cette migration ajoute les 3 colonnes manquantes avec ADD COLUMN
-- IF NOT EXISTS (idempotent).
-- ============================================================

-- 1. Colonne description (TEXT, nullable) — description du produit
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Colonne expiry_date (DATE, nullable) — date de péremption
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- 3. Colonne is_active (BOOLEAN, default true) — produit actif/inactif
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 4. Mettre à jour les lignes existantes : tous les produits existants sont actifs
UPDATE public.products SET is_active = true WHERE is_active IS NULL;

-- 5. Vérification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'description'
  ) THEN
    RAISE WARNING '⚠️  Colonne description non créée';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'expiry_date'
  ) THEN
    RAISE WARNING '⚠️  Colonne expiry_date non créée';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'is_active'
  ) THEN
    RAISE WARNING '⚠️  Colonne is_active non créée';
  END IF;
END $$;

-- Done — la création de produit avec description doit marcher maintenant.
