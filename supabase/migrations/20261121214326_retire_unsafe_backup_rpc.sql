-- Preserve existing backup payloads; retire unused unsafe in-app backup RPCs.
-- ============================================================
-- Backup & Restore — tables, enums, RLS, SECURITY DEFINER RPCs
-- ============================================================

-- ─── Enum ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE backup_status AS ENUM (
    'pending', 'in_progress', 'completed', 'failed', 'restoring'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Table: backups ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  backup_number text NOT NULL,
  status        backup_status NOT NULL DEFAULT 'pending',
  backup_type   text NOT NULL DEFAULT 'manual',  -- manual | auto | pre_restore
  description   text,
  -- Snapshot metadata
  table_counts  jsonb NOT NULL DEFAULT '{}',       -- {"products": 42, "sales": 128, ...}
  total_records integer NOT NULL DEFAULT 0,
  file_size_kb  integer,                           -- approximate size
  backup_data   jsonb,                             -- the actual backup payload (nullable for large orgs)
  -- Who / when
  created_by    uuid REFERENCES auth.users(id),
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, backup_number)
);

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_backups_org_status ON backups(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_backups_org_created ON backups(organization_id, created_at DESC);

-- ─── Updated-at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_backups_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.backups;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.backups
  FOR EACH ROW EXECUTE FUNCTION public.trg_backups_updated_at();

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.backups FROM PUBLIC, anon, authenticated;
-- Retire unused legacy endpoints: partial restores and unrestricted snapshot
-- mutations are not an acceptable recovery mechanism. No CASCADE or row deletion.
DROP FUNCTION IF EXISTS public.generate_backup_number();
DROP FUNCTION IF EXISTS public.create_backup(text,text);
DROP FUNCTION IF EXISTS public.restore_backup(uuid,text[]);
DROP FUNCTION IF EXISTS public.get_backups(integer,integer);
DROP FUNCTION IF EXISTS public.get_backup_details(uuid);
DROP FUNCTION IF EXISTS public.delete_backup(uuid);
DROP FUNCTION IF EXISTS public.get_backup_stats();
