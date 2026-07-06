-- ============================================================
-- Fix: Increase product limits + fix [object Object] error
-- Date: 2026-07-06
--
-- Problems fixed:
--   1. Starter plan max_products=500 is too low for real businesses
--      → Increased to 2000
--   2. Croissance plan max_products=5000 → Increased to 10000
--   3. Frontend bug: [object Object] in error toast (separate code fix)
--
-- Run this in Supabase SQL Editor to update limits immediately.
-- ============================================================

UPDATE public.plans
SET max_products = 2000
WHERE id = 'starter';

UPDATE public.plans
SET max_products = 10000
WHERE id = 'croissance';

-- Verify
SELECT id, name, max_products FROM public.plans ORDER BY sort_order;

NOTIFY pgrst, 'reload schema';
