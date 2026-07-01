-- ============================================================
-- Fix: Allow NULL for max_stores, max_users, max_products
-- (NULL = unlimited, same as max_sales_per_month)
--
-- Run this in Supabase SQL Editor to fix the NOT NULL constraint
-- error when inserting Croissance/Enterprise plans.
-- ============================================================

-- 1. Drop NOT NULL constraints — allow NULL = unlimited
ALTER TABLE public.plans ALTER COLUMN max_stores DROP NOT NULL;
ALTER TABLE public.plans ALTER COLUMN max_users DROP NOT NULL;
ALTER TABLE public.plans ALTER COLUMN max_products DROP NOT NULL;

-- 2. Set default to NULL (unlimited) instead of fixed values
ALTER TABLE public.plans ALTER COLUMN max_stores SET DEFAULT NULL;
ALTER TABLE public.plans ALTER COLUMN max_users SET DEFAULT NULL;
ALTER TABLE public.plans ALTER COLUMN max_products SET DEFAULT NULL;

-- 3. Re-seed plans with correct values
INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, max_stores, max_users, max_products, has_advanced_reports, has_exports, has_supplier_management, has_offline_advanced, sort_order) VALUES
  ('starter', 'Starter', 'Idéal pour démarrer — caisse et stock de base', 0.00, NULL, 1, 2, 500, FALSE, FALSE, FALSE, FALSE, 1),
  ('croissance', 'Croissance', 'Pour les boutiques qui grandissent — fournisseurs, rapports, exports', 29.00, 290.00, 3, 10, 5000, TRUE, TRUE, TRUE, TRUE, 2),
  ('enterprise', 'Enterprise', 'Pour les chaînes et grossistes — analytics, API, support prioritaire', 79.00, 790.00, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_stores = EXCLUDED.max_stores,
  max_users = EXCLUDED.max_users,
  max_products = EXCLUDED.max_products,
  has_advanced_reports = EXCLUDED.has_advanced_reports,
  has_exports = EXCLUDED.has_exports,
  has_supplier_management = EXCLUDED.has_supplier_management,
  has_offline_advanced = EXCLUDED.has_offline_advanced,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- 4. Update enterprise plan with premium features
UPDATE public.plans SET
  has_api_access = TRUE,
  has_priority_support = TRUE,
  has_custom_branding = TRUE,
  has_multi_currency = TRUE,
  has_ai_assistant = TRUE,
  has_loyalty_program = TRUE
WHERE id = 'enterprise';

-- 5. Update croissance with some premium features
UPDATE public.plans SET
  has_custom_branding = TRUE,
  has_multi_currency = TRUE
WHERE id = 'croissance';
