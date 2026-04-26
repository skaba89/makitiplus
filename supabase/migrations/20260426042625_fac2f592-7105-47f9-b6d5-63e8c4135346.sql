-- Schedule daily test account rotation at 03:00 UTC
SELECT cron.schedule(
  'rotate-test-accounts-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://eiquqawymbgfejwucvyt.supabase.co/functions/v1/rotate-test-accounts',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);