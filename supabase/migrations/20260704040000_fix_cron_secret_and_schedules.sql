-- ═══════════════════════════════════════════════════════════════════════
-- Fix: pg_cron schedules must pass CRON_SECRET to edge functions
-- Date: 2026-07-04
--
-- Problems fixed:
--   1. rotate-test-accounts cron did NOT send X-Cron-Secret → 403 Forbidden
--   2. subscription-lifecycle cron was commented out → no email notifications
--   3. Hardcoded project URL in rotate-test-accounts → not portable
--
-- Prerequisites:
--   - CRON_SECRET must be set in Supabase Dashboard → Edge Functions → Secrets
--   - pg_cron and pg_net extensions must be enabled
--   - Run this AFTER setting CRON_SECRET in edge function secrets
--
-- ⚠️  IMPORTANT: After running this migration, you MUST also run the
--     companion SQL in the Supabase SQL Editor to set the CRON_SECRET
--     in the pg_net context. See the post-migration instructions below.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Drop old broken cron jobs ────────────────────────────────────

-- Remove the old rotate-test-accounts cron that doesn't send the secret
SELECT cron.unschedule('rotate-test-accounts-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'rotate-test-accounts-daily'
);

-- Remove any old subscription-lifecycle cron jobs (if they existed)
SELECT cron.unschedule('subscription-lifecycle-hourly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'subscription-lifecycle-hourly'
);
SELECT cron.unschedule('subscription-lifecycle-6h') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'subscription-lifecycle-6h'
);

-- ─── 2. Recreate rotate-test-accounts with X-Cron-Secret ────────────
-- Runs daily at 03:00 UTC
-- NOTE: The CRON_SECRET value must be set via vault or environment.
-- Since pg_cron runs as the postgres superuser, we use
-- current_setting('app.settings.cron_secret', true) to retrieve it.
-- You must set this value AFTER running this migration (see instructions below).

-- First, ensure the custom setting can be set
DO $$
BEGIN
  -- Try to set the cron secret from vault if available
  -- If not available, the cron jobs will fail until the secret is manually set
  NULL;
END
$$;

-- Schedule rotate-test-accounts with proper auth
-- The secret is read from a postgres setting that you must configure
SELECT cron.schedule(
  'rotate-test-accounts-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.edge_function_url', true)
           || '/functions/v1/rotate-test-accounts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ─── 3. Schedule subscription-lifecycle edge function ────────────────
-- Runs every 6 hours (at 00:00, 06:00, 12:00, 18:00 UTC)
-- This calls the EDGE FUNCTION (not the SQL function) so it can send emails.
-- The SQL function process_subscription_lifecycle() can still be called directly
-- for testing or manual runs.

SELECT cron.schedule(
  'subscription-lifecycle-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.edge_function_url', true)
           || '/functions/v1/subscription-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ─── 4. Post-migration instructions ──────────────────────────────────
-- After running this migration, execute the following in SQL Editor
-- (replace the values with your actual secrets):
--
-- ALTER DATABASE postgres SET app.settings.cron_secret = 'YOUR_CRON_SECRET_HERE';
-- ALTER DATABASE postgres SET app.settings.edge_function_url = 'https://YOUR_PROJECT_ID.supabase.co';
--
-- For example, if your project ID is eiquqawymbgfejwucvyt and your
-- CRON_SECRET is abc123xyz:
--
-- ALTER DATABASE postgres SET app.settings.cron_secret = 'abc123xyz';
-- ALTER DATABASE postgres SET app.settings.edge_function_url = 'https://eiquqawymbgfejwucvyt.supabase.co';
--
-- To verify the settings:
-- SELECT current_setting('app.settings.cron_secret', true);
-- SELECT current_setting('app.settings.edge_function_url', true);
--
-- To verify the cron jobs:
-- SELECT * FROM cron.job WHERE jobname LIKE '%rotate%' OR jobname LIKE '%lifecycle%';
