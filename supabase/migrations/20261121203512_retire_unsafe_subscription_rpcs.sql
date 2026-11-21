-- These obsolete self-service subscription writers were reintroduced by the
-- historical live-drift capture. No current web or Edge Function caller uses
-- them; paid onboarding uses Stripe and manual billing uses the guarded RPC.
-- No CASCADE: fail safely if an unexpected database dependency exists.
DROP FUNCTION IF EXISTS public.select_plan(TEXT);
DROP FUNCTION IF EXISTS public.update_organization_subscription(TEXT, TEXT, TEXT);
NOTIFY pgrst, 'reload schema';
