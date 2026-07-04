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

-- ─── RLS ────────────────────────────────────────────────────
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view own backups"
  ON public.backups FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can insert backups"
  ON public.backups FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

CREATE POLICY "Admins can update backups"
  ON public.backups FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

CREATE POLICY "Admins can delete backups"
  ON public.backups FOR DELETE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

-- ─── RPC: generate_backup_number ────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_backup_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_prefix text;
  v_next_seq integer;
  v_result text;
BEGIN
  v_org_id := public.get_user_organization_id();
  SELECT upper(left(o.name, 3)) INTO v_prefix FROM organizations o WHERE o.id = v_org_id;
  IF v_prefix IS NULL THEN v_prefix := 'BAK'; END IF;

  SELECT coalesce(max(
    cast(substring(backup_number from '[0-9]+$') as integer)
  ), 0) + 1 INTO v_next_seq
  FROM public.backups
  WHERE organization_id = v_org_id;

  v_result := v_prefix || '-SAV-' || lpad(v_next_seq::text, 5, '0');
  RETURN v_result;
END;
$$;

-- ─── RPC: create_backup ─────────────────────────────────────
-- Creates a full JSON snapshot of the organization's data
CREATE OR REPLACE FUNCTION public.create_backup(
  p_description text DEFAULT NULL,
  p_backup_type text DEFAULT 'manual'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_backup_id uuid;
  v_backup_num text;
  v_counts jsonb := '{}';
  v_total integer := 0;
  v_rec record;
  v_data jsonb;
  v_tables text[] := ARRAY[
    'products', 'categories', 'customers', 'sales', 'sale_items',
    'expenses', 'suppliers', 'supplier_products',
    'purchase_orders', 'purchase_order_items',
    'stock_transfers', 'stock_transfer_items',
    'loyalty_accounts', 'loyalty_transactions', 'loyalty_rewards',
    'store_settings'
  ];
  v_table_name text;
  v_count integer;
  v_start timestamptz := now();
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  -- Generate backup number
  v_backup_num := public.generate_backup_number();

  -- Create backup record (pending)
  INSERT INTO public.backups (
    organization_id, backup_number, status, backup_type,
    description, created_by, started_at
  ) VALUES (
    v_org_id, v_backup_num, 'in_progress', p_backup_type,
    p_description, v_user_id, v_start
  ) RETURNING id INTO v_backup_id;

  -- Build backup data: each table's rows as JSON array
  v_data := '{}';
  FOREACH v_table_name IN ARRAY v_tables LOOP
    -- Check if table has organization_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v_table_name
        AND c.column_name = 'organization_id'
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', v_table_name)
        INTO v_count USING v_org_id;

      IF v_count > 0 THEN
        EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
                        FROM (SELECT * FROM public.%I WHERE organization_id = $1 ORDER BY created_at) t', v_table_name)
          INTO v_rec USING v_org_id;
        v_data := jsonb_set(v_data, ARRAY[v_table_name], COALESCE(v_rec, '[]'::jsonb));
      ELSE
        v_data := jsonb_set(v_data, ARRAY[v_table_name], '[]'::jsonb);
      END IF;

      v_counts := jsonb_set(v_counts, ARRAY[v_table_name], to_jsonb(v_count));
      v_total := v_total + v_count;
    END IF;
  END LOOP;

  -- Also snapshot stores
  IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='stores' AND c.column_name='organization_id') THEN
    SELECT count(*) INTO v_count FROM public.stores WHERE organization_id = v_org_id;
    SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      INTO v_rec FROM (SELECT * FROM public.stores WHERE organization_id = v_org_id ORDER BY created_at) t;
    v_data := jsonb_set(v_data, ARRAY['stores'], COALESCE(v_rec, '[]'::jsonb));
    v_counts := jsonb_set(v_counts, ARRAY['stores'], to_jsonb(v_count));
    v_total := v_total + v_count;
  END IF;

  -- Estimate size (rough: 2 bytes per char in JSON)
  -- pg_column_size gives compressed size; use length for raw size
  UPDATE public.backups SET
    status = 'completed',
    table_counts = v_counts,
    total_records = v_total,
    file_size_kb = ceil(length(v_data::text) / 1024.0),
    backup_data = v_data,
    completed_at = now()
  WHERE id = v_backup_id;

  -- Return summary
  RETURN jsonb_build_object(
    'id', v_backup_id,
    'backup_number', v_backup_num,
    'status', 'completed',
    'table_counts', v_counts,
    'total_records', v_total,
    'file_size_kb', ceil(length(v_data::text) / 1024.0),
    'completed_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  -- Mark as failed
  UPDATE public.backups SET
    status = 'failed',
    completed_at = now()
  WHERE id = v_backup_id;
  RAISE EXCEPTION 'Backup failed: %', SQLERRM;
END;
$$;

-- ─── RPC: restore_backup ────────────────────────────────────
-- Restores data from a specific backup (creates a pre-restore backup first)
CREATE OR REPLACE FUNCTION public.restore_backup(
  p_backup_id uuid,
  p_tables text[] DEFAULT NULL   -- NULL = restore all tables; otherwise only listed tables
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_backup public.backups%ROWTYPE;
  v_pre_backup_id uuid;
  v_pre_backup_num text;
  v_data jsonb;
  v_table_name text;
  v_rows jsonb;
  v_count integer;
  v_restored_counts jsonb := '{}';
  v_total_restored integer := 0;
  v_col_names text[];
  v_col_list text;
  v_val_list text;
  v_insert_sql text;
  v_start timestamptz := now();
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  -- Load backup
  SELECT * INTO v_backup FROM public.backups
  WHERE id = p_backup_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Backup not found or access denied';
  END IF;

  IF v_backup.status != 'completed' THEN
    RAISE EXCEPTION 'Only completed backups can be restored';
  END IF;

  IF v_backup.backup_data IS NULL THEN
    RAISE EXCEPTION 'Backup data is empty';
  END IF;

  -- Create a pre-restore backup automatically
  v_pre_backup_num := public.generate_backup_number();
  INSERT INTO public.backups (
    organization_id, backup_number, status, backup_type,
    description, created_by, started_at, completed_at
  ) VALUES (
    v_org_id, v_pre_backup_num, 'completed', 'pre_restore',
    'Sauvegarde automatique avant restauration de ' || v_backup.backup_number,
    v_user_id, v_start, now()
  ) RETURNING id INTO v_pre_backup_id;

  -- Copy current data into the pre-restore backup
  -- (simplified: just store current state using same create_backup logic but inline)
  DECLARE
    v_pre_data jsonb := '{}';
    v_pre_counts jsonb := '{}';
    v_pre_total integer := 0;
    v_tbl text;
    v_tbl_count integer;
    v_tbl_rows jsonb;
    v_all_tables text[] := ARRAY[
      'products', 'categories', 'customers', 'sales', 'sale_items',
      'expenses', 'suppliers', 'supplier_products',
      'purchase_orders', 'purchase_order_items',
      'stock_transfers', 'stock_transfer_items',
      'loyalty_accounts', 'loyalty_transactions', 'loyalty_rewards',
      'store_settings', 'stores'
    ];
  BEGIN
    FOREACH v_tbl IN ARRAY v_all_tables LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=v_tbl AND c.column_name='organization_id'
      ) THEN
        EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', v_tbl)
          INTO v_tbl_count USING v_org_id;
        IF v_tbl_count > 0 THEN
          EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
                          FROM (SELECT * FROM public.%I WHERE organization_id = $1 ORDER BY created_at) t', v_tbl)
            INTO v_tbl_rows USING v_org_id;
          v_pre_data := jsonb_set(v_pre_data, ARRAY[v_tbl], COALESCE(v_tbl_rows, '[]'::jsonb));
        ELSE
          v_pre_data := jsonb_set(v_pre_data, ARRAY[v_tbl], '[]'::jsonb);
        END IF;
        v_pre_counts := jsonb_set(v_pre_counts, ARRAY[v_tbl], to_jsonb(v_tbl_count));
        v_pre_total := v_pre_total + v_tbl_count;
      END IF;
    END LOOP;

    UPDATE public.backups SET
      table_counts = v_pre_counts,
      total_records = v_pre_total,
      file_size_kb = ceil(length(v_pre_data::text) / 1024.0),
      backup_data = v_pre_data
    WHERE id = v_pre_backup_id;
  END;

  -- Now restore from the target backup
  v_data := v_backup.backup_data;

  -- Determine which tables to restore
  IF p_tables IS NULL THEN
    p_tables := ARRAY(
      SELECT jsonb_object_keys(v_data)
    );
  END IF;

  -- Mark backup as restoring
  UPDATE public.backups SET status = 'restoring' WHERE id = p_backup_id;

  -- Restore each table
  FOREACH v_table_name IN ARRAY p_tables LOOP
    -- Check table exists and has organization_id
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_name = v_table_name
    ) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v_table_name AND c.column_name = 'organization_id'
    ) THEN
      CONTINUE;
    END IF;

    v_rows := v_data->v_table_name;
    IF v_rows IS NULL OR jsonb_array_length(v_rows) = 0 THEN
      -- Delete existing data for this org in this table (restore to empty)
      EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', v_table_name) USING v_org_id;
      v_restored_counts := jsonb_set(v_restored_counts, ARRAY[v_table_name], '0');
      CONTINUE;
    END IF;

    -- Delete existing data first
    EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', v_table_name) USING v_org_id;

    -- Get column names from first row
    v_col_names := ARRAY(SELECT jsonb_object_keys(v_rows->0));
    v_col_list := array_to_string(v_col_names, ', ');
    v_val_list := array_to_string(
      ARRAY(SELECT format('$%s', generate_series(1, array_length(v_col_names, 1)))),
      ', '
    );
    v_insert_sql := format(
      'INSERT INTO public.%I (%s) VALUES (%s) ON CONFLICT (id) DO NOTHING',
      v_table_name, v_col_list, v_val_list
    );

    v_count := 0;
    -- Insert rows one by one (safest approach for varying column sets)
    FOR v_rec IN SELECT * FROM jsonb_array_elements(v_rows) AS elem LOOP
      BEGIN
        EXECUTE format(
          'INSERT INTO public.%I SELECT * FROM jsonb_to_record($1) AS x(%s) ON CONFLICT (id) DO NOTHING',
          v_table_name,
          (SELECT string_agg(format('%s %s',
            col_name,
            CASE
              WHEN c.data_type = 'uuid' THEN 'uuid'
              WHEN c.data_type = 'integer' THEN 'integer'
              WHEN c.data_type = 'numeric' THEN 'numeric'
              WHEN c.data_type = 'bigint' THEN 'bigint'
              WHEN c.data_type = 'boolean' THEN 'boolean'
              WHEN c.data_type = 'date' THEN 'date'
              WHEN c.data_type = 'timestamp with time zone' THEN 'timestamptz'
              WHEN c.data_type = 'timestamp without time zone' THEN 'timestamp'
              WHEN c.data_type = 'time without time zone' THEN 'time'
              WHEN c.data_type = 'text' THEN 'text'
              WHEN c.data_type = 'character varying' THEN 'text'
              WHEN c.data_type = 'jsonb' THEN 'jsonb'
              WHEN c.data_type = 'USER-DEFINED' THEN 'text'
              ELSE 'text'
            END
          ), ', ')
          FROM unnest(v_col_names) AS col_name
          LEFT JOIN information_schema.columns c
            ON c.table_schema = 'public'
            AND c.table_name = v_table_name
            AND c.column_name = col_name
          )
        ) USING v_rec.elem;
        v_count := v_count + 1;
      EXCEPTION WHEN OTHERS THEN
        -- Skip rows that fail (e.g. FK violations) but continue
        RAISE NOTICE 'Skipping row in %: %', v_table_name, SQLERRM;
      END;
    END LOOP;

    v_restored_counts := jsonb_set(v_restored_counts, ARRAY[v_table_name], to_jsonb(v_count));
    v_total_restored := v_total_restored + v_count;
  END LOOP;

  -- Mark backup as completed again
  UPDATE public.backups SET status = 'completed' WHERE id = p_backup_id;

  RETURN jsonb_build_object(
    'restored_backup_id', p_backup_id,
    'pre_restore_backup_id', v_pre_backup_id,
    'restored_counts', v_restored_counts,
    'total_restored', v_total_restored,
    'restored_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  -- Restore the original status
  UPDATE public.backups SET status = 'completed' WHERE id = p_backup_id;
  RAISE EXCEPTION 'Restore failed: %', SQLERRM;
END;
$$;

-- ─── RPC: get_backups ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_backups(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  backup_number text,
  status backup_status,
  backup_type text,
  description text,
  table_counts jsonb,
  total_records integer,
  file_size_kb integer,
  created_by uuid,
  created_by_name text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
    SELECT
      b.id,
      b.backup_number,
      b.status,
      b.backup_type,
      b.description,
      b.table_counts,
      b.total_records,
      b.file_size_kb,
      b.created_by,
      p.owner_name AS created_by_name,
      b.started_at,
      b.completed_at,
      b.created_at
    FROM public.backups b
    LEFT JOIN public.profiles p ON p.user_id = b.created_by
    WHERE b.organization_id = v_org_id
    ORDER BY b.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ─── RPC: get_backup_details ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_backup_details(
  p_backup_id uuid
)
RETURNS TABLE (
  id uuid,
  backup_number text,
  status backup_status,
  backup_type text,
  description text,
  table_counts jsonb,
  total_records integer,
  file_size_kb integer,
  backup_data jsonb,
  created_by uuid,
  created_by_name text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
    SELECT
      b.id,
      b.backup_number,
      b.status,
      b.backup_type,
      b.description,
      b.table_counts,
      b.total_records,
      b.file_size_kb,
      b.backup_data,
      b.created_by,
      p.owner_name AS created_by_name,
      b.started_at,
      b.completed_at,
      b.created_at,
      b.updated_at
    FROM public.backups b
    LEFT JOIN public.profiles p ON p.user_id = b.created_by
    WHERE b.organization_id = v_org_id AND b.id = p_backup_id;
END;
$$;

-- ─── RPC: delete_backup ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_backup(
  p_backup_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  DELETE FROM public.backups
  WHERE id = p_backup_id AND organization_id = v_org_id;

  RETURN FOUND;
END;
$$;

-- ─── RPC: get_backup_stats ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_backup_stats()
RETURNS TABLE (
  total_backups integer,
  completed_backups integer,
  total_size_kb integer,
  last_backup_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
    SELECT
      coalesce(sum(1), 0)::integer,
      coalesce(sum(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::integer,
      coalesce(sum(file_size_kb), 0)::integer,
      max(created_at)
    FROM public.backups
    WHERE organization_id = v_org_id;
END;
$$;
