-- ============================================================
-- P3.1 — Création de la fonction trigger update_updated_at_column()
-- Date: 2026-07-08
-- Référence audit: AUDIT-2026-007 (suite de P3)
--
-- La fonction update_updated_at_column() est référencée comme trigger
-- dans 4 migrations historiques (depuis 20260207065000) mais n'a jamais
-- été définie. Les triggers BEFORE UPDATE sur les tables qui l'utilisent
-- échouent silencieusement en production.
--
-- Cette migration crée la fonction manquante.
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated, service_role;

-- Vérification
-- SELECT proname FROM pg_proc WHERE proname = 'update_updated_at_column';
