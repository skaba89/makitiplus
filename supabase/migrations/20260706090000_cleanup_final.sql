-- ============================================================
-- Neutralized migration placeholder
-- Date: 2026-07-06
--
-- The previous content of this migration was a destructive demo reset script.
-- It has been removed from this file to prevent production data loss.
--
-- Do not add reset/demo cleanup logic to supabase/migrations.
-- Any demo reset procedure must live outside migrations and remain manual-only.
-- ============================================================

NOTIFY pgrst, 'reload schema';
