-- ============================================================
-- Migration : Créer plan pilot_national + restaurer Starter commercial
-- Date: 2026-07-14
-- ============================================================
-- Le plan Starter avait toutes les features activées temporairement
-- pour le pilote. Cette migration :
-- 1. Crée un plan "pilot_national" avec toutes les features (pour le pilote)
-- 2. Restaure Starter avec ses vraies limites commerciales
-- 3. Ne casse pas les organisations existantes
-- ============================================================

-- 1. Créer le plan pilot_national
INSERT INTO public.plans (
  id, name, description, price_monthly, price_yearly,
  max_stores, max_users, max_products, max_sales_per_month,
  has_advanced_reports, has_exports, has_supplier_management,
  has_offline_advanced, has_custom_branding, has_multi_currency,
  has_api_access, has_priority_support, has_ai_assistant,
  has_loyalty_program, sort_order
) VALUES (
  'pilot_national', 'Pilot National', 'Plan pilote temporaire — toutes les features activées pour tests',
  0.00, NULL, NULL, NULL, NULL, NULL,
  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  0
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  has_advanced_reports = EXCLUDED.has_advanced_reports,
  has_exports = EXCLUDED.has_exports,
  has_supplier_management = EXCLUDED.has_supplier_management,
  has_offline_advanced = EXCLUDED.has_offline_advanced,
  has_custom_branding = EXCLUDED.has_custom_branding,
  has_multi_currency = EXCLUDED.has_multi_currency,
  has_api_access = EXCLUDED.has_api_access,
  has_priority_support = EXCLUDED.has_priority_support,
  has_ai_assistant = EXCLUDED.has_ai_assistant,
  has_loyalty_program = EXCLUDED.has_loyalty_program,
  updated_at = NOW();

-- 2. Restaurer Starter avec ses vraies limites commerciales
UPDATE public.plans SET
  has_advanced_reports = FALSE,
  has_exports = FALSE,
  has_supplier_management = FALSE,
  has_offline_advanced = FALSE,
  has_custom_branding = FALSE,
  has_multi_currency = FALSE,
  has_api_access = FALSE,
  has_priority_support = FALSE,
  has_ai_assistant = FALSE,
  has_loyalty_program = FALSE,
  max_stores = 1,
  max_users = 2,
  max_products = 2000,
  max_sales_per_month = 500,
  updated_at = NOW()
WHERE id = 'starter';

-- 3. Migrer les organisations pilote vers pilot_national
-- (seulement celles qui ont un abonnement starter actif et qui sont en pilote)
-- On ne touche pas aux abonnements existants — l'admin peut changer manuellement
-- via admin_update_organization_subscription si besoin.

COMMENT ON TABLE public.plans IS 'v2 (2026-07-14): plan pilot_national ajouté pour le pilote temporaire. Starter restauré avec limites commerciales.';

DO $$
BEGIN
  RAISE NOTICE '=== Plan pilot_national créé ===';
  RAISE NOTICE '=== Plan Starter restauré (limites commerciales) ===';
  RAISE NOTICE 'Pour utiliser le pilote : changer l''abonnement vers pilot_national';
  RAISE NOTICE 'via admin_update_organization_subscription (super_admin only)';
END $$;
