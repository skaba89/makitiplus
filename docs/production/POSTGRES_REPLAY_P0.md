# P0 — PostgreSQL replay regression gate

Baseline: main `56619a4`, 21 November 2026. First incremental PR; no application or historical migration edits, no production connection.

## Evidence and limits

- PostgreSQL 16.16, fresh local cluster, initial snapshot plus all 160 timestamped migration files in lexical order. 142 succeeded, 18 failed. The earlier 22/160 result used a different platform shim; this is not a four-migration product fix.
- The CI executes every migration, including the known failures. Each known failure is constrained by filename, original SHA-256 and SQLSTATE. Any new or changed failure, or a stale baseline entry, blocks `build-and-test`. `--strict` blocks every unresolved failure. The baseline is technical debt, not a release waiver.
- Combined SQL files are generated deployment artifacts, not separate numbered migrations. Auth and Storage are minimal local compatibility objects. Cron/net extensions and remote scheduling are not provisioned. No production data, secrets, or network queries are used by the test harness.
- Local `npm run check`: lint (9 existing warnings), typecheck, build and 3028 tests / 128 files passed. Migration safety check: 160 scanned, zero blocks.
- Full schema reconstruction, transactional credit RPC executions, concurrency, tenant isolation and real Supabase staging restoration remain open; successful DDL is not evidence of these guarantees.

## Run

Start a fresh PostgreSQL 16 instance on loopback port 55432 with the disposable `postgres` user/password (CI configuration). Never point the harness at a forwarded production database. Run `npm ci`, `python3 scripts/check_migration_safety.py`, then `node scripts/test-postgres-replay.mjs`. Use `--strict` to measure release readiness; it is expected to fail until all historical exceptions are resolved.

## Follow-up sequence

1. Add real two-tenant fixtures and RPC tests with forced rollback, replay, simultaneous sessions and cross-tenant writes; investigate missing organization predicate on the latest `create_full_sale` stock update before production rollout.
2. Resolve historical prerequisites, duplicate definitions and return-type changes without altering deployed migration history; shrink the baseline with evidence.
3. Validate full platform extensions and complete schema reconstruction on local Supabase, then remove the baseline and enforce strict mode.
4. Perform the isolated staging backup/restore drill and record RTO/RPO.

No increase to the previous provisional 73/100 maturity estimate until the CI is verified and real transactional risks close.
