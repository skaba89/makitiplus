# P0 — PostgreSQL replay regression gate

Baseline: main `56619a4`, 21 November 2026. First incremental PR; no application or historical migration edits, no production connection.

## Evidence and limits

- PostgreSQL 16.16, fresh local cluster, initial snapshot plus all 160 timestamped migration files in lexical order. 142 succeeded, 18 failed. The earlier 22/160 result used a different platform shim; this is not a four-migration product fix.
- The CI executes every migration, including the known failures. Each known failure is constrained by filename, original SHA-256 and SQLSTATE. Any new or changed failure, or a stale baseline entry, blocks `build-and-test`. `--strict` blocks every unresolved failure. The baseline is technical debt, not a release waiver.
- Combined SQL files are generated deployment artifacts, not separate numbered migrations. Auth and Storage are minimal local compatibility objects. Cron/net extensions and remote scheduling are not provisioned. No production data, secrets, or network queries are used by the test harness.
- Local `npm run check`: lint (9 existing warnings), typecheck, build and 3028 tests / 128 files passed. Migration safety check: 160 scanned, zero blocks.
- Full schema reconstruction, transactional credit RPC executions, concurrency, tenant isolation and real Supabase staging restoration remain open; successful DDL is not evidence of these guarantees.

## Run

Start a fresh PostgreSQL 16 instance on loopback port 55432 with the disposable `postgres` user/password (CI configuration). Install pg_cron, set `shared_preload_libraries = 'pg_cron'` and `cron.launch_active_jobs = off` before starting PostgreSQL; leave pg_net uninstalled. The CI provisions these prerequisites automatically. Never point the harness at a forwarded production database. Run `npm ci`, `python3 scripts/check_migration_safety.py`, then `node scripts/test-postgres-replay.mjs`. Use `--strict` to measure release readiness; it rejects compatibility repairs and the isolated cron registration.

## 2026-11-21 — Historical permissions and billing isolation

On PostgreSQL 16.16: 163 numbered migrations, 145 unmodified successes, two successful reconstruction repairs and 16 unresolved failures. The original 18 failed statements are still accounted for in the baseline. Never interpret a reconstruction repair as an unmodified migration success; strict mode still fails on either category.

- `20260703030000`: correct the stale `is_user_active()` grant to the existing UUID signature only after checking it already has the intended privilege; the other statements are executed unchanged.
- `20260706180000`: the obsolete subscription writer was already absent at that point. Remove only the two impossible REVOKEs, retaining the original DROP IF EXISTS and schema notification.
- The harness first attempts the original migration, checks both its original checksum and SQLSTATE, and fails on any unexpected condition or missing repair. The repaired SQL is applied only to the disposable reconstruction; no historical migration or production migration history has been edited.
- A subsequent drift-capture migration had restored two unsafe subscription writers. The new forward migration removes only those two unused functions, without CASCADE or any data deletion. The current Stripe onboarding and guarded administrative billing RPC are retained; generated client types no longer advertise the removed functions. Real authenticated SQL tests verify both old entry points are absent and ordinary organization administrators cannot use the guarded billing RPC to change another organization's subscription.

These results concern a PostgreSQL compatibility reconstruction, not a full native Supabase `db reset` or a production deployment. The 16 remaining failures and two compatibility repairs must still be addressed in an approved reconstruction strategy.

## 2026-11-21 — Seller reporting return types and isolation

- PostgreSQL 16.16, 164 numbered migrations: 148 unmodified successes, 3 explicit reconstruction repairs, 13 unresolved failures. The original 09 July seller migration requires replacement of two JSONB return contracts; the harness verifies both types, then executes the restricted drops and original DDL atomically (no CASCADE). The 11 and 31 July migrations now execute unchanged, so their two baseline entries are removed.
- A forward migration handles environments still on the JSONB contract, preserves the frontend's table signatures, and retains the selling-role filter. The detailed seller KPI no longer interprets a missing tenant as global access unless the authenticated caller has the explicit platform role. Anonymous execution is revoked on all three reporting RPCs.
- Real SQL tests execute all three RPCs: sales totals for each of two organizations, positive activity records, cross-tenant denial, exclusion of an accountant from seller performance, no-profile denial, anonymous privileges and global/targeted access for an explicit platform administrator. Existing sale/credit and RLS tests pass unchanged.
- No data or production migration history modified. Strict replay still cannot pass while the 13 unresolved failures and 3 historical compatibility repairs remain; native Supabase reset and production checks are still outstanding.

## 2026-11-21 — Support schema reconstruction and access control

- PostgreSQL 16.16: 165 numbered migrations, 149 unmodified successes, 4 explicit reconstruction repairs, 12 unresolved failures. The historical support migration is replayed with the exact organization-admin predicate introduced later; its original checksum and failure remain recorded.
- The forward migration recreates absent support objects without deleting existing data, pins RPC search paths, scopes message reads and updates to the tenant, serializes ticket numbering, denies direct authenticated DML and anonymous RPC execution, and prevents sender impersonation and unauthorized status changes/deletion.
- Real PostgreSQL tests exercise ticket creation, messages, listing, statistics, two-organization RLS and RPC isolation, anonymous access and accountant role restrictions. Sale, credit and seller reporting tests continue to pass. No production access or deployment.
- The backup migration also depends on the missing admin predicate, but adding that prerequisite exposes a second PL/pgSQL syntax error in its legacy restore function. Its destructive restore operations require separate review; the migration remains unresolved. Strict mode remains blocked.

## 2026-11-21 — Backup storage recovery and unsafe RPC retirement

- PostgreSQL 16.16: 166 numbered migrations, 152 unmodified successes, 4 explicit reconstruction repairs, 10 unresolved failures. The backup reconstruction now creates the original storage objects and exact missing admin predicate, without compiling unsafe legacy backup RPCs. Support and FORCE RLS migrations consequently run unchanged; their stale exception entries were removed.
- The historical restore routine contains a syntax error and a delete-before-insert pattern that can skip failed rows while reporting success. The old JSON snapshot is not a complete disaster-recovery backup. No runtime callers of the seven backup RPCs were found in the frontend or Edge Functions. The forward migration preserves the backup table and payloads, forces RLS, removes direct client grants, and retires the seven exact legacy function signatures without CASCADE. External integrations must be checked before rollout.
- Real PostgreSQL tests seed two organizations' backup records, reapply the forward migration, compare complete rows and payloads, and verify both authenticated administrators cannot read snapshots or invoke the retired mutating endpoints; anon has no SELECT privilege. Existing sale, credit, reporting and support regression tests pass.
- This is a safety containment change, **not a validated backup/restore solution**. Use the approved infrastructure backup and isolated recovery process; an actual Supabase staging restoration and measured RTO/RPO remain outstanding. No production data or migration history was changed. Strict replay remains blocked.

## 2026-11-21 — Identity migration reconstruction

- PostgreSQL 16.16: 166 numbered migrations, 152 unmodified successes, 6 explicit compatibility repairs, 8 unresolved failures. No new migration or production SQL is introduced. Both original failed identity scripts remain checksum/SQLSTATE-bound in the baseline.
- Casting their role expressions to the enum would make unsafe automatic platform-role promotion, identity-specific account reassignment and broad policies executable. The replay repairs instead require empty profiles, roles, organizations and auth users, then install the existing explicit-role helper and conservative self-login policies. Later historical migrations restore the scoped team policies. They refuse to run on populated identity data.
- Real authenticated SQL tests confirm own-role access, two-tenant profile/role isolation, same-tenant team access for administrators, accountant self-role access, and explicit platform administrator access. Existing transaction and support/backup tests pass.
- Historical consolidated migration also contains owner-to-platform role promotion. Existing explicit super_admin assignments may have originated there: production role provenance and owner-approved review remain necessary. Do not automatically revoke or grant any real account role. Native Supabase login and strict replay remain unvalidated.

## 2026-11-21 — Foreign key and tenant policy reconstruction

- PostgreSQL 16.16: 166 numbered migrations, 152 unmodified successes, 8 explicit compatibility repairs, 6 unresolved failures. Both original June migration failures remain checksum/SQLSTATE-bound; no production SQL or migration history is changed.
- Foreign-key repair parses all eleven original declarations and checks existing constraints against the PostgreSQL catalogs: type, validated status, exact source/target relation and column, matching semantics, update/delete actions and deferrability. A conflicting same-name constraint aborts rather than being silently ignored. Remaining original DDL, including the index, executes.
- Tenant-policy repair reinstalls the six exact original policies atomically, retaining the original organization backfill and obsolete policy removals. No broad replacement condition or bypass is introduced.
- Real PostgreSQL tests show orphan stock-movement sale references and customer organization references fail (23503), and authenticated tenants can insert/read their own sync conflicts but cannot impersonate another user or organization (42501). Existing financial, identity, backup and support tests pass.
- Referential existence alone does not prove cross-tenant relationship integrity for every table. Strict replay, native Supabase reset and the recovery drill remain outstanding.

## 2026-11-21 — Reset token access and historical role policy

- PostgreSQL 16.16: 167 numbered migrations, 153 unmodified successes, 10 explicit compatibility repairs, 4 unresolved failures. The two historical failures remain bound to their original SHA and SQLSTATE.
- The obsolete duplicate self-role policy is removed during the disposable reconstruction rather than reintroduced; subsequent historical security migrations establish the current role contract. The reset-token repair retains the snapshot policies and runs remaining original schema/index/backfill statements. It explicitly omits pg_cron/pg_net installation in the compatibility environment; the separate scheduler migration remains unresolved and no remote HTTP job runs.
- The new forward migration preserves the existing reset history UI's explicit metadata columns, excludes token hashes, denies browser DML and anonymous access, and limits row visibility to the same organization or explicit platform administrator. Only the server service role may mint/redeem tokens. Existing records are not modified.
- Real PostgreSQL tests exercise service-role insert/update, two administrators reading only their own metadata, denial of hash reads, forged inserts and updates, and anonymous privilege denial. Existing financial, identity, backup, support and sync tests pass.
- Native Supabase Data API and Edge Function end-to-end redemption still require staging verification; this is not a production deployment. Historical role assignment provenance and strict reconstruction remain open.

## 2026-11-22 — Customer and sync snapshot reconstruction

- PostgreSQL 16.16: 167 numbered migrations, 153 unmodified successes, 12 explicit compatibility repairs, 2 unresolved failures. The two historical duplicate-table failures remain bound to their original SHA and SQLSTATE.
- The customer/credit repair verifies the snapshot's column types and nullability, primary keys, RLS, validated sale/customer/credit foreign-key relationships and enabled update trigger. It preserves the existing tenant-aware schema and newer deletion semantics instead of recreating older user-only policies.
- The sync-conflict repair checks its original column contract, primary key, RLS, required index and scoped insert policy, then executes its original account-status and stock-delta functions and audit indexes. It does not restore broad historical policies.
- Real SQL tests exercise the customer update trigger, authenticated account status and stock delta calculation including the nonnegative floor, in addition to existing tenant-conflict and financial tests. No production data or migration SQL changed.
- Remaining failures: historical organization/product policy duplication and cron scheduling; strict and native Supabase reconstruction remain blocked.

## 2026-11-22 — Organization policy snapshot reconciliation

- Added a SHA/SQLSTATE-bound compatibility repair for the duplicate tenant policy migration. It requires empty identity and business tables, verifies RLS, tenant UUID columns and all 30 corresponding policy names, roles and commands, including the five more restrictive snapshot write policies.
- Preserves the newer RLS policies and does not execute historical orphan reassignment to a named business. Replays only original index/trigger/assignment-helper DDL after checking the existing tenant helpers.
- Extended actual PostgreSQL regression tests to assert organization SELECT and UPDATE isolation in both directions. No historical migration files or production data modified. Expected compatibility result: 13 explicit repairs and one unresolved cron migration; CI execution is required to confirm this result. Native/strict reconstruction remains blocked.

## 2026-11-22 — Historical cron registration in isolation

- The CI installs the real pg_cron extension in the disposable PostgreSQL 16 service. Job launch is explicitly disabled before the database restarts; pg_net is not installed. The harness checks both safety prerequisites before migration replay.
- The historical daily test-account rotation statement is verified by its original SHA-256, executed inside a transaction, and checked against the real cron catalog for precisely the original name, schedule, command and local database. The transaction is rolled back. Both immediately and at the end of replay, the scheduler must have zero jobs and zero runs; no external HTTP request is sent.
- The old cron failure is removed from the failure baseline, but the registration is separately classified as isolated validation, not an unmodified applied migration. Expected compatibility totals: 167 migrations, 153 unmodified successes, 13 repairs, one isolated registration, zero unresolved failures; confirmation requires blocking CI. Any unresolved failure now fails the gate, and strict mode still rejects repairs/isolated registration.
- The pg_net payload execution, Edge Function behavior and native Supabase reconstruction remain unvalidated. Do not enable or invoke the historical rotation in production based on this check.

## 2026-11-22 — Synthetic logical backup/restore drill (MKP-005)

- PR #128 succeeded in both CI and Release Readiness. The new blocking drill runs only after the synthetic transaction suite, checks the four exact synthetic auth identities, captures a custom-format dump and restores it into a separate PostgreSQL 16 cluster with its own data directory and Unix socket, no TCP listener, pg_cron disabled and no pg_net.
- Compare order-independent row counts and fingerprints for every ordinary/partitioned table in public/auth/storage, plus policies, constraints, indexes, RLS flags, ACLs, function definitions and sequence values. Recheck two authenticated tenants after restoration and require the original latest-sale watermark and zero cron jobs/runs. The dump stays in the disposable service container; no backup artifact or data is published.
- The CI log records actual elapsed backup and restore-plus-verification seconds and zero lost fixture rows/zero latest-sale watermark gap only if all checks pass. This is a synthetic logical restore rehearsal, not a production RPO/RTO measurement, native Supabase reset, storage-object restore or PITR proof.

## Follow-up sequence

### Native snapshot gate (next incremental step)

- PR #129's blocking CI confirmed the synthetic restore: `backup_seconds=0`, `rto_seconds=1`, zero lost fixture rows and zero latest-sale watermark gap. These measurements apply only to the small disposable fixture, not production.
- The dedicated Supabase Native Snapshot workflow starts an unlinked CLI project in a fresh runner directory, copies only the original initial snapshot as a local migration, and never loads the production config, secrets, Edge Functions or the historical cron migration.
- The regression test verifies real Auth and Storage catalog objects, creates two synthetic users via local Auth, signs them in, seeds separate organizations/products, checks real PostgREST tenant isolation and anonymous denial. It also reproduces the first SHA-bound strict replay collision (42710) inside a rolled-back transaction.
- PR #130 passed all three workflows, including the native snapshot job (run 44997673725). This is a native initial-snapshot gate only, not complete native migration reconstruction. The PostgreSQL compatibility replay and restoration gates remain independent and blocking.
- The next incremental native test extends the same two real Auth identities to positive product CRUD, bidirectional cross-tenant insert/update/delete denial, organization reassignment denial and anonymous write denial. Direct SQL checks verify the actual protected row state, not merely HTTP response status. Native execution of these new assertions is pending CI; no migration or RLS policy is modified.
- PR #131 passed all three workflows, including native write isolation (run 44998969058).
- First native historical reconciliation: attempt the first two numbered migrations in order, require original SHA-256 and SQLSTATE, roll back the original failure to a savepoint, and apply the existing compatibility repair in the same disposable transaction. Verify the obsolete self-assignment policy is absent and customer/credit RLS remains enabled. The two real Auth administrators must be unable to grant themselves super_admin, and the existing product CRUD/tenant isolation tests still run. New assertions pending CI. No migration ledger or historical SQL changes; this covers two of 167 migrations, not strict native replay.
- PR #132 succeeded in all three workflows (native run 45000470262); CI build-and-test, e2e and pilot-e2e jobs succeeded.
- PR #133 passed all three workflows (native run 45001193935), confirming the eight-migration prefix probe.
- PR #134 passed all three workflows (native run 45001929688): 18 accounted for, 17 exercised and one cron registration skipped.
- PR #135 passed all three workflows (native run 45003205511), confirming the 31-entry prefix.
- PR #136 passed all three workflows (native run 45004956245), confirming the 47-entry prefix.
- PR #137 passed all three workflows (native run 45006148339), confirming the 57-entry prefix, including backup and support contracts.
- PR #138 passed all three workflows (native run 45007231535), confirming the 64-entry prefix.
- PR #139 passed all three workflows (native run 45009422985), confirming the 72-entry prefix.
- Extend the rollback probe through migration 80. Check auth bootstrap execute ACLs, service-role-only Stripe policy, forced WhatsApp RLS, activity enum and removal of the old text RPC, and scoped profile/role policy presence. Pending CI: 80 accounted for, 79 exercised (2 reconciled locally, 77 rolled back), one external cron registration skipped. Catalog presence does not prove runtime tenant isolation: review historical self-referential profiles SELECT policy for recursion before enabling it, and test the activity enum conversion on representative non-empty data (unknown values map to NULL despite existing NOT NULL). No historical SQL or production changes.
- PR #140 native run 45011089182 reached the final catalog assertion but failed. The bootstrap migration revokes PUBLIC, not a direct anon grant potentially inherited from native default ACLs. Verify the historical PUBLIC ACL and actual unauthenticated rejection before explicitly revoking anon in the rolled-back probe, then require the effective ACL contract. Print the historical anon privilege boolean and name any failing contract. This tests remediation only; it does not change deployed ACLs or certify production safety. Follow-up migration review remains required if the native grant is present.
- PR #140 passed all three workflows after correction (native run 45011622601); direct historical anon EXECUTE was confirmed true, anonymous invocation rejected, explicit remediation verified only inside the rolled-back probe. Final production ACL remediation remains open.
- PR #141 passed all three workflows (native run 45013208371), confirming the 88-entry prefix.
- PR #142 passed all three workflows (native run 45013936390), confirming the 93-entry prefix and transaction-boundary guard.
- Extend through migration 96: for three explicitly reviewed SHA-pinned files, remove only the exact BEGIN/COMMIT wrapper lines in memory, execute the unchanged body inside the outer transaction and require successful savepoint release. All other files retain the transaction-boundary guard; no source file is edited. Verify the store-aware sale RPC signatures and absence of older wrapper overloads. Pending CI: 96 accounted for, 95 exercised (2 reconciled locally, 93 rolled back, including 3 transaction-wrapper adaptations), one external cron registration skipped. These catalog checks do not certify runtime sale authorization. No historical SQL or production changes.

- PR #143 passed all three workflows (native run 45015217388), confirming the 96-entry prefix.
- Extend through migration 99: assert that both MKP-025 cleanup/recovery versions are SHA-pinned, comment-only plus `SELECT 1;`, then execute their actual no-op SQL. Verify the replacement onboarding text RPC is the only overload, returns UUID and is executable by authenticated. This supersedes the earlier enum overload contract; it does not establish safe onboarding authorization or concurrency. Pending CI: 99 accounted for, 98 exercised (2 reconciled locally, 96 rolled back including 3 wrapper adaptations and 2 verified no-ops), one external cron registration skipped. Review the next consolidated migration separately for regression of store-scoped sales. No historical SQL or production changes.

- PR #144 passed all three workflows (native run 45016178842), confirming the 99-entry prefix.
- Extend through migration 103 using one additional SHA-pinned transaction-wrapper adaptation. Check the twelve authenticated business policies, supplier columns and Starter pilot feature flags. Pending CI: 103 accounted for, 102 exercised (2 reconciled locally, 100 rolled back including 4 wrapper adaptations and 2 verified no-ops), one external cron registration skipped. The consolidated migration recreates the privileged `create_full_sale` with caller-supplied user/org IDs and a stock update filtered only by product ID and available quantity. Record the missing tenant/store predicate from the actual historical function catalog; this is an open P0 finding, not an authorization test or acceptance of the vulnerability. The new policies query profiles, so recursion and effective tenant isolation remain to be tested; catalog checks do not prove either. No historical SQL or production changes.

1. Add real two-tenant fixtures and RPC tests with forced rollback, replay, simultaneous sessions and cross-tenant writes; investigate missing organization predicate on the latest `create_full_sale` stock update before production rollout.
2. Resolve historical prerequisites, duplicate definitions and return-type changes without altering deployed migration history; shrink the baseline with evidence.
3. Validate full platform extensions and complete schema reconstruction on local Supabase, then remove the baseline and enforce strict mode.
4. Perform the isolated staging backup/restore drill and record RTO/RPO.

No increase to the previous provisional 73/100 maturity estimate until the CI is verified and real transactional risks close.
