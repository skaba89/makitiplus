-- ============================================================
-- Fix : Ajouter colonnes manquantes à suppliers (city, etc.)
-- Date: 2026-07-13
-- ============================================================
-- Bug : "Could not find the 'city' column of 'suppliers' in the schema cache"
-- Cause : la table suppliers en production n'a pas toutes les colonnes
-- que le frontend envoie (city, country, notes, etc.)
--
-- Fix : ALTER TABLE ADD COLUMN IF NOT EXISTS pour toutes les colonnes
-- attendues par le frontend.
-- ============================================================

-- Ajouter les colonnes manquantes (idempotent)
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Guinée';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

-- Vérification : afficher toutes les colonnes de suppliers
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'suppliers'
ORDER BY ordinal_position;

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Colonnes suppliers ajoutées/vérifiées';
  RAISE NOTICE '   city, country, notes, email, address, phone, is_active, store_id';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
