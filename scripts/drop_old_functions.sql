-- ============================================================
-- Script de nettoyage: supprimer les anciennes fonctions
-- Exécuter AVANT de relancer step3_stores_rls_rpcs.sql
-- ============================================================

-- Supprimer check_plan_limit (et ses dépendances)
DROP FUNCTION IF EXISTS public.check_plan_limit(TEXT) CASCADE;

-- Supprimer les autres fonctions potentiellement conflictuelles
DROP FUNCTION IF EXISTS public.get_organization_stores() CASCADE;
DROP FUNCTION IF EXISTS public.set_current_store(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_store_stats(UUID) CASCADE;
