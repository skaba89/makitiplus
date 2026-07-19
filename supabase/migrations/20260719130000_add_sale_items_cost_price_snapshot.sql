-- ════════════════════════════════════════════════════════════════
-- Migration: Add sale_items.cost_price for historical cost snapshot
-- Date: 2026-07-19
-- Objectif: Ajouter une colonne cost_price à sale_items pour stocker
--           le coût du produit AU MOMENT DE LA VENTE (snapshot historique).
--           Permet de calculer la marge même si le prix d'achat change.
-- ════════════════════════════════════════════════════════════════

-- 1. Ajouter la colonne cost_price (si elle n'existe pas)
ALTER TABLE public.sale_items 
ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;

-- 2. Index pour accélérer les requêtes de marge par produit
CREATE INDEX IF NOT EXISTS idx_sale_items_cost_price 
ON public.sale_items(cost_price);

-- 3. Vérification
DO $$
BEGIN
  RAISE NOTICE '✅ sale_items.cost_price ajoutée (NUMERIC DEFAULT 0)';
  RAISE NOTICE 'Index idx_sale_items_cost_price créé';
END $$;
