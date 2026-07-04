-- ═══════════════════════════════════════════════════════════════════════
-- MANUAL ONLY — This migration intentionally does not modify the database.
-- It exists solely as documentation for the manual cron setup procedure.
--
-- See: docs/production/SUPABASE_CRON_SETUP.md
--
-- The cron jobs CANNOT be auto-applied because they require
-- project-specific secrets (CRON_SECRET) and URLs (Project ID)
-- that cannot be stored in this repository.
-- ═══════════════════════════════════════════════════════════════════════

-- No SQL to execute. See docs/production/SUPABASE_CRON_SETUP.md for setup instructions.
SELECT 1 AS cron_setup_is_manual;
