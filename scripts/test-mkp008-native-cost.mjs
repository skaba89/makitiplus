// Executes the MKP-008 arithmetic characterization ONLY on an unlinked,
// loopback-only Supabase database created by the native-snapshot CI workflow.
// The SQL creates a TEMP table and always ROLLBACKs. No production writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

assert.equal(process.argv.length, 3, 'Usage: node test-mkp008-native-cost.mjs <supabase-local-status.json>');
const status = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const url = new URL(status.DB_URL);
assert.equal(url.protocol, 'postgresql:', 'Database must use PostgreSQL');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Remote DB forbidden');
assert.equal(url.port, '54322', 'Only default local Supabase DB port is allowed');
assert.equal(url.pathname, '/postgres', 'Only disposable local Supabase database is allowed');

const sql = readFileSync(
  new URL('./admin/test_mkp008_cost_average.sql.example', import.meta.url),
  'utf8',
);
assert.match(sql, /^BEGIN;/m);
assert.match(sql, /^ROLLBACK;/m);
assert.match(sql, /CREATE TEMP TABLE mkp008_cost_cases/);
const db = new Client({ connectionString: url.href, ssl: false });
await db.connect();
try {
  // Hard fail unless this is the local disposable project initialized by CI.
  const { rows: [identity] } = await db.query(
    "SELECT current_database() AS db, inet_server_port() AS port",
  );
  assert.equal(identity.db, 'postgres');
  assert.equal(identity.port, 5432);
  await db.query(sql);
  const { rows: [check] } = await db.query(
    "SELECT to_regclass('pg_temp.mkp008_cost_cases') IS NULL AS cleaned",
  );
  assert.equal(check.cleaned, true, 'Temporary test relation survived rollback');
  console.log('MKP-008 nine SQL arithmetic cases PASS; transaction rolled back on local Supabase');
} finally {
  await db.end();
}
