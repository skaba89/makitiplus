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
