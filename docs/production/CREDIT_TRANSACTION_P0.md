# P0 credit transaction and tenant-read regression

Baseline: `main` 05bd21f (#116). All execution is isolated PostgreSQL 16; no production access.

The new blocking replay step runs actual RPC calls as `authenticated` with two independent organization owners, instead of merely checking the presence of the function. The checks assert sale, line, credit ledger and stock consistency; same-number replay; conflicting total rejection; rollback on ambiguous customer; independent sessions retrying one sale; separate tenant keys and exact customer balances. Direct RLS reads of sales, customers, products and credits are also tested in both directions, and anonymous execution of the credit RPC is denied.

The initial run exposed a platform authorization defect on the reconstructed schema. The new additive migration preserves the existing `is_super_admin()` signature but makes the helper depend exclusively on an explicit platform role. Normal owners retain organization-scoped access, and an explicitly assigned platform administrator retains the intended cross-organization visibility. No existing role assignment is changed. The test-only setup grants SELECT to reproduce local Data API permissions; these grants are not part of the migration. The onboarding trigger is temporarily disabled only for fixture seeding, restored before any tested RPC runs; tests do not establish onboarding correctness.

Local PostgreSQL 16.16: 143/161 migrations passed, 18 historical exceptions unchanged, zero unexpected failures; transaction and RLS fixtures passed. This does not demonstrate full schema reconstruction or live Supabase parity.

Before release: audit explicit platform role assignments with the authorized production administrator (historical migrations may have populated them), verify owner versus platform administrator UI flows in staging, and review production policy/role state. Do not revoke legitimate platform administrators automatically. Cross-tenant RPC write checks, especially product identifiers and store scope, remain the next P0 task. No production deployment is authorized by this report.
