-- ─────────────────────────────────────────────────────────────────
-- Fix additif : ajouter 'pilot_national' aux allowed_plans de
-- feature_flags (trouvé lors de l'audit stratégique, docs/production/
-- STRATEGIC_AUDIT_AFRICA_WORLD_LEADER.md section 3.5).
--
-- Constat : public.plans.pilot_national a tous ses has_X = TRUE (créé
-- pour donner un accès complet à un magasin en pilote national, sans
-- passer par la facturation). Mais check_feature_access() ne consulte
-- PAS plans.has_X -- il consulte feature_flags.allowed_plans, une
-- table séparée qui ne contenait 'pilot_national' pour AUCUNE des 16
-- fonctionnalités déclarées. Un organisme mis sur ce plan se verrait
-- donc refuser exports/gestion fournisseurs/branding personnalisé/
-- multi-devises/assistant IA/API/support prioritaire/programme
-- fidélité/analytics admin -- l'inverse exact de ce que le plan est
-- censé accorder.
--
-- Impact actuel : AUCUN -- vérifié en lecture seule qu'aucune
-- organisation n'est abonnée à 'pilot_national' à ce jour (migration
-- donc purement préventive, sans effet observable sur un utilisateur
-- réel, Diallo & Frères inclus -- leur organisation est sur le plan
-- 'enterprise', jamais touché ici).
--
-- Additif et idempotent : n'ajoute 'pilot_national' que s'il est
-- absent, ne touche aucune autre table.
-- ─────────────────────────────────────────────────────────────────

UPDATE public.feature_flags
SET allowed_plans = array_append(allowed_plans, 'pilot_national')
WHERE NOT ('pilot_national' = ANY(allowed_plans));
