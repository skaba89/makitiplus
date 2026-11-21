import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { testCreditTransactions } from './test-postgres-credit.mjs';

// Intentionally no DATABASE_URL, PGHOST, or production credentials accepted.
const port = Number(process.env.MKP_TEST_PG_PORT || 55432);
const settings = { host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'postgres', ssl: false };
const client = new Client(settings);
const fromRoot = path => new URL(`../${path}`, import.meta.url);
const read = path => readFileSync(fromRoot(path), 'utf8');
await client.connect();
try {
  const { rows: [state] } = await client.query("SELECT current_setting('server_version_num')::int AS version, to_regnamespace('auth') IS NULL AND to_regclass('public.profiles') IS NULL AS empty");
  if (!state.empty || state.version < 160000 || state.version >= 170000) throw new Error('Requires a fresh disposable PostgreSQL 16 database');
  await client.query(read('scripts/postgres-test-bootstrap.sql'));
  await client.query(read('supabase/00000_initial_schema.sql'));
  const files = readdirSync(fromRoot('supabase/migrations')).filter(n => /^\d{14}_.+\.sql$/.test(n)).sort();
  const failures = [];
  for (const name of files) {
    const sql = read(`supabase/migrations/${name}`);
    try {
      await client.query(sql);
    } catch (err) {
      await client.query('ROLLBACK');
      failures.push({ name, code: err.code, sha256: createHash('sha256').update(sql).digest('hex'), reason: err.message });
    }
  }
  const baseline = JSON.parse(read('scripts/postgres-replay-known-failures.json'));
  const unexpected = failures.filter(f => !baseline[f.name] || baseline[f.name][0] !== f.code || baseline[f.name][1] !== f.sha256);
  const resolved = Object.keys(baseline).filter(name => !failures.some(f => f.name === name));
  // A successful CREATE FUNCTION is not proof that its body executes.
  // These checks only establish the presence of the critical schema objects.
  const { rows: [contracts] } = await client.query(`SELECT
    to_regprocedure('public.create_credit_sale_atomic(text,numeric,numeric,jsonb,numeric,text,numeric,numeric,text,text,text,numeric,uuid,text)') IS NOT NULL AS credit_rpc,
    to_regclass('public.sales_org_sale_number_unique') IS NOT NULL AS sale_idempotency,
    to_regclass('public.customer_credits') IS NOT NULL AS credit_ledger`);
  if (!Object.values(contracts).every(Boolean)) throw new Error(`Missing critical schema contracts: ${JSON.stringify(contracts)}`);
  console.log(JSON.stringify({ total: files.length, passed: files.length - failures.length, failures, unexpected, resolved }, null, 2));
  if (unexpected.length || resolved.length || (process.argv.includes('--strict') && failures.length)) process.exitCode = 1;
  else await testCreditTransactions(client, async () => { const c = new Client(settings); await c.connect(); return c; });
} finally {
  await client.end();
}
