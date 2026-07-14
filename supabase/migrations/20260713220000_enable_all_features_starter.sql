-- ============================================================
-- Fix : Activer toutes les features sur le plan Starter
-- Date: 2026-07-13
-- ============================================================
-- Bug : le super admin sur plan Starter ne peut pas créer de fournisseurs
-- car has_supplier_management = FALSE sur Starter.
--
-- Fix : activer toutes les features sur Starter pour permettre les tests
-- et le déploiement pilote. Les features seront re-désactivées
-- après le pilote quand le billing sera en place.
-- ============================================================

UPDATE public.plans
SET
  has_advanced_reports = TRUE,
  has_exports = TRUE,
  has_supplier_management = TRUE,
  has_offline_advanced = TRUE,
  has_custom_branding = TRUE,
  has_multi_currency = TRUE,
  has_api_access = TRUE,
  has_priority_support = TRUE,
  has_ai_assistant = TRUE,
  has_loyalty_program = TRUE,
  updated_at = NOW()
WHERE id = 'starter';

-- Vérification
SELECT id, name,
  has_advanced_reports,
  has_exports,
  has_supplier_management,
  has_offline_advanced,
  has_custom_branding,
  has_multi_currency
FROM public.plans
WHERE id = 'starter';

DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Toutes les features activées sur le plan Starter';
  RAISE NOTICE '   Le super admin peut maintenant créer des fournisseurs,';
  RAISE NOTICE '   voir les rapports avancés, exporter, etc.';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
