#!/usr/bin/env bash
# Runs inside the disposable CI PostgreSQL service, after synthetic SQL tests.
# No connection strings or remote destinations accepted.
set -euo pipefail
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
export TZ=UTC
source_db=( -h /var/run/postgresql -p 5432 -U postgres -d postgres )
psql_source() { psql -X -qAt -v ON_ERROR_STOP=1 "${source_db[@]}" "$@"; }

# Fail closed if pointed at anything except the known synthetic fixture database.
test "$(psql_source -c "SELECT count(*)=4 AND bool_and(id::text IN ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004')) FROM auth.users")" = t
test "$(psql_source -c "SELECT current_setting('cron.launch_active_jobs')='off' AND to_regnamespace('net') IS NULL AND NOT EXISTS (SELECT 1 FROM cron.job)")" = t

work=$(mktemp -d /tmp/mkp-restore.XXXXXXXX)
started=0
cleanup() {
  if [ "$started" = 1 ]; then pg_ctl -D "$work/cluster" -m fast -w stop >/dev/null; fi
  # The service container is disposable; leave the private temp directory for
  # container teardown, never copy the dump to CI artifacts.
}
trap cleanup EXIT
target_db=( -h "$work" -p 55433 -U postgres -d postgres )
psql_target() { psql -X -qAt -v ON_ERROR_STOP=1 "${target_db[@]}" "$@"; }

# Deterministic, order-independent row fingerprints; no contents are printed.
# Includes every ordinary/partitioned application, auth and storage table.
fingerprint() {
  "$1" <<'SQL'
SET timezone='UTC';
SET datestyle='ISO, YMD';
SELECT format('SELECT %L, count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' ORDER BY md5(to_jsonb(t)::text)),'''')) FROM %I.%I t;', n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','p')
ORDER BY n.nspname,c.relname
\gexec
SELECT 'policy',schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname IN ('public','auth','storage') ORDER BY schemaname,tablename,policyname;
SELECT 'constraint',n.nspname,c.relname,k.conname,k.convalidated,pg_get_constraintdef(k.oid)
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','storage') ORDER BY n.nspname,c.relname,k.conname;
SELECT 'index',schemaname,tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname IN ('public','auth','storage') ORDER BY schemaname,tablename,indexname;
SELECT 'relation',n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,
  (SELECT string_agg(a::text,',' ORDER BY a::text) FROM unnest(c.relacl) a)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','p','v','m','S') ORDER BY n.nspname,c.relname;
SELECT 'function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid)),
  (SELECT string_agg(a::text,',' ORDER BY a::text) FROM unnest(p.proacl) a)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage') AND p.prokind IN ('f','p') ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
SELECT 'sequence',schemaname,sequencename,last_value FROM pg_sequences
WHERE schemaname IN ('public','auth','storage') ORDER BY schemaname,sequencename;
SQL
}
fingerprint psql_source > "$work/before"
watermark_before=$(psql_source -c 'SELECT max(created_at)::text FROM public.sales')
test -n "$watermark_before"
backup_started=$SECONDS
pg_dump "${source_db[@]}" --format=custom --file="$work/backup.dump" --no-password
pg_restore --list "$work/backup.dump" >/dev/null
backup_seconds=$((SECONDS-backup_started))
restore_started=$SECONDS

# Independent cluster with its own data directory and Unix socket; no TCP
# listener and no job execution. Only the three known fixture roles exist.
initdb -D "$work/cluster" -U postgres --auth=trust --encoding=UTF8 \
  --locale="$(psql_source -c 'SHOW lc_collate')" --lc-ctype="$(psql_source -c 'SHOW lc_ctype')" >/dev/null
pg_ctl -D "$work/cluster" -l "$work/server.log" -o "-p 55433 -k $work -c listen_addresses='' -c shared_preload_libraries=pg_cron -c cron.launch_active_jobs=off" -w start >/dev/null
started=1
test "$(psql_target -c "SELECT current_setting('cron.launch_active_jobs')='off' AND to_regnamespace('auth') IS NULL")" = t
psql_target -c 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;'
pg_restore "${target_db[@]}" --exit-on-error --single-transaction --no-password "$work/backup.dump"

fingerprint psql_target > "$work/after"
cmp -s "$work/before" "$work/after" || { echo 'Restore fingerprint mismatch (details suppressed)' >&2; exit 1; }
watermark_after=$(psql_target -c 'SELECT max(created_at)::text FROM public.sales')
test "$watermark_before" = "$watermark_after"
test "$(psql_target -c "SELECT current_setting('cron.launch_active_jobs')='off' AND to_regnamespace('net') IS NULL AND NOT EXISTS (SELECT 1 FROM cron.job) AND NOT EXISTS (SELECT 1 FROM cron.job_run_details)")" = t

# Exercise restored RLS as each real fixture tenant, not as the dump owner.
for suffix in 1 2; do
  user="10000000-0000-4000-8000-00000000000$suffix"
  org="20000000-0000-4000-8000-00000000000$suffix"
  test "$(psql_target -c "SET ROLE authenticated; SET request.jwt.claim.sub='$user'; SELECT count(*)>0 AND bool_and(organization_id='$org'::uuid) FROM public.sales;")" = t
done
echo "Synthetic restore PASS: backup_seconds=$backup_seconds rto_seconds=$((SECONDS-restore_started)) fixture_rows_lost=0 fixture_sale_watermark_gap_seconds=0"
