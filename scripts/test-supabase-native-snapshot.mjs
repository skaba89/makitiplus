import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { repairHistoricalMigration } from './postgres-replay-repairs.mjs';

// Only a freshly initialized, unlinked local CLI stack is supported.
const status = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const api = new URL(status.API_URL);
const dbUrl = new URL(status.DB_URL);
const local = url => ['127.0.0.1','localhost'].includes(url.hostname);
assert.ok(local(api) && api.protocol==='http:' && api.port==='54321');
assert.ok(local(dbUrl) && dbUrl.protocol==='postgresql:' && dbUrl.port==='54322' && dbUrl.pathname==='/postgres');
const publicKey = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
const serverKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
assert.ok(publicKey && serverKey, 'Local CLI keys missing');
const options = { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } };
const server = createClient(api.origin,serverKey,options);
const anonymous = createClient(api.origin,publicKey,options);
// Use only the validated local URL; never read production env credentials.
const db = new Client({connectionString:dbUrl.href,ssl:false});
await db.connect();
try {
  const {rows:[state]} = await db.query(`SELECT
    to_regclass('auth.users') IS NOT NULL AS auth_table,
    to_regclass('storage.objects') IS NOT NULL AS storage_table,
    to_regprocedure('auth.uid()') IS NOT NULL AS auth_uid,
    (SELECT count(*)=0 FROM auth.users) AS empty,
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.products'::regclass) AS product_rls`);
  assert.ok(Object.values(state).every(Boolean),'Unexpected native snapshot');
  // Reconcile precisely the first two numbered migrations on real Supabase,
  // using the already-reviewed compatibility repairs. No historical source
  // edits, migration ledger entries, scheduler or later migration execution.
  const prefix=[
    '20260202072852_917790af-3d14-44e9-bcdd-d88776ced82b.sql',
    '20260207065000_da463d93-5048-43ec-bb39-482bb0ea3ab9.sql',
  ];
  const directory=new URL('../supabase/migrations/',import.meta.url);
  const numbered=readdirSync(directory).filter(n=>/^\d{14}_.+\.sql$/.test(n)).sort();
  assert.deepEqual(numbered.slice(0,prefix.length),prefix,'Historical prefix changed');
  const baseline=JSON.parse(readFileSync(new URL('./postgres-replay-known-failures.json',import.meta.url),'utf8'));
  for (const name of prefix) {
    const historical=readFileSync(new URL(name,directory),'utf8');
    const [code,hash]=baseline[name];
    assert.equal(createHash('sha256').update(historical).digest('hex'),hash);
    await db.query('BEGIN');
    try {
      await db.query('SAVEPOINT original');
      await assert.rejects(db.query(historical),{code});
      await db.query('ROLLBACK TO SAVEPOINT original');
      await repairHistoricalMigration(db,name,historical);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }
  const {rows:[reconciled]}=await db.query(`SELECT NOT EXISTS (SELECT 1 FROM pg_policy
    WHERE polrelid='public.user_roles'::regclass AND polcmd IN ('a','*')) AS no_role_insert,
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.customers'::regclass) AS customer_rls,
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.customer_credits'::regclass) AS credit_rls`);
  assert.ok(Object.values(reconciled).every(Boolean),'First native repairs did not preserve expected security');
  // The next historical prefix temporarily introduces global admin policies
  // and a single-admin constraint. Keep ALL changes uncommitted and roll them
  // back before creating any Auth identities or sending any Data API requests.
  const next=[
    ['20260423040958_42cc2233-086f-4864-a7d3-64cb40a81ed5.sql','e592a50fc8d540aeb2e777c8382202efd4d09a5c143799c4433f582aeb441cea'],
    ['20260423042235_125de771-f1c8-4b67-90db-2b6d811096ca.sql','e347b905bb0996416ac1affd81c3e070419042b670d2318a317e98deaf723623'],
    ['20260424042936_db7e40cf-c001-4513-9126-a0596e12f542.sql','9dedd4c7befd8eb1f1c4b13f026daba928ad7b611ee48671dc74cb46680c3149','42P07'],
    ['20260424042947_b1941d89-89c0-4cb2-bdbc-6aaebc400cbb.sql','68891e26833fab4f1a79edf157eb39e4df6d8b99c777800fea32b01b2332153b'],
    ['20260424045251_3195f18f-7faa-4f1f-9d47-323cb8b7fac7.sql','3fb671516569685a263f7237bfbdfea768baa3a8e5aac512c6598dde69ed6499','42710'],
    ['20260425041530_c56455ad-2249-438f-b9a2-15f7f64df5e5.sql','afb2237998ef0c18f553bdabdb574cbeb0c0a59a92ab050e18f4688901be6226'],
  ];
  assert.deepEqual(numbered.slice(prefix.length,prefix.length+next.length),next.map(([name])=>name));
  const policyState=async()=> (await db.query(`SELECT p.polname, c.relname, p.polcmd, p.polroles,
    pg_get_expr(p.polqual,p.polrelid) AS predicate, pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname,p.polname`)).rows;
  const before=await policyState();
  await db.query('BEGIN');
  try {
    for (const [name,hash,code] of next) {
      const historical=readFileSync(new URL(name,directory),'utf8');
      assert.equal(createHash('sha256').update(historical).digest('hex'),hash);
      if (code) {
        assert.deepEqual(baseline[name].slice(0,2),[code,hash]);
        await db.query('SAVEPOINT original');
        await assert.rejects(db.query(historical),{code});
        await db.query('ROLLBACK TO SAVEPOINT original');
        await repairHistoricalMigration(db,name,historical);
        await db.query('RELEASE SAVEPOINT original');
      } else await db.query(historical);
    }
    const {rows:[contracts]}=await db.query(`SELECT
      to_regclass('public.idx_single_admin') IS NOT NULL AS legacy_index,
      public.resolve_stock_conflict(10,7,8)=5 AND public.resolve_stock_conflict(10,0,2)=0 AS stock_delta,
      EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.organizations'::regclass AND attname='default_tax_rate' AND NOT attisdropped) AS tax`);
    assert.ok(Object.values(contracts).every(Boolean),'Historical prefix contract mismatch');
  } finally { await db.query('ROLLBACK'); }
  assert.deepEqual(await policyState(),before,'Historical prefix leaked policy changes');
  const {rows:[rolledBack]}=await db.query("SELECT to_regclass('public.idx_single_admin') IS NULL AS clean");
  assert.ok(rolledBack.clean,'Historical constraint escaped transaction');
  console.log('Native historical prefix PASS: 8 migrations examined, 2 reconciled persistently in local snapshot, 6 exercised and rolled back');

  const fixtures=[];
  for (const suffix of ['a','b']) {
    const email=`native-${suffix}-${randomUUID()}@example.test`;
    const password=randomBytes(24).toString('hex');
    const created=await server.auth.admin.createUser({email,password,email_confirm:true});
    assert.ok(!created.error && created.data.user?.id,'Native Auth user creation failed');
    const user=created.data.user.id, org=randomUUID(), product=randomUUID();
    await db.query("INSERT INTO public.organizations(id,name,owner_user_id) VALUES ($1,'Native fixture',$2)",[org,user]);
    await db.query("INSERT INTO public.profiles(user_id,organization_id,business_name,owner_name) VALUES ($1,$2,'Native fixture','Native fixture')",[user,org]);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'admin')",[user]);
    await db.query("INSERT INTO public.products(id,user_id,organization_id,name,price,stock_quantity) VALUES ($1,$2,$3,'Native fixture',100,2)",[product,user,org]);
    const client=createClient(api.origin,publicKey,options);
    const login=await client.auth.signInWithPassword({email,password});
    assert.ok(!login.error && login.data.user?.id===user,'Native Auth login failed');
    fixtures.push({client,org,product,user});
  }
  for (const fixture of fixtures) {
    const result=await fixture.client.from('products').select('id,organization_id');
    assert.ok(!result.error,'Native authenticated Data API query failed');
    assert.deepEqual(result.data,[{id:fixture.product,organization_id:fixture.org}]);
    const escalate=await fixture.client.from('user_roles').insert({user_id:fixture.user,role:'super_admin'});
    assert.equal(escalate.error?.code,'42501','Self-role escalation must be denied after reconciliation');
  }
  const {rows:[roles]}=await db.query("SELECT count(*)::int AS count FROM public.user_roles WHERE role='super_admin'");
  assert.equal(roles.count,0);
  const denied=await anonymous.from('products').select('id');
  assert.ok((!denied.error && denied.data.length===0) || [401,403].includes(denied.status),'Anonymous product access was not denied');
  // Positive controls plus direct cross-tenant attacks over the real Data API.
  // Empty successful responses are an expected RLS denial for UPDATE/DELETE;
  // independently verify the protected rows through the local SQL connection.
  for (const [i, fixture] of fixtures.entries()) {
    const other=fixtures[1-i];
    const id=randomUUID();
    const own=await fixture.client.from('products').insert({id,user_id:fixture.user,organization_id:fixture.org,name:'Native write fixture',price:100}).select('id');
    assert.ok(!own.error,'Own-tenant insert failed');
    assert.deepEqual(own.data,[{id}]);
    const changed=await fixture.client.from('products').update({price:125}).eq('id',id).select('id,price');
    assert.ok(!changed.error,'Own-tenant update failed');
    assert.deepEqual(changed.data,[{id,price:125}]);
    const forgedId=randomUUID();
    const forged=await fixture.client.from('products').insert({id:forgedId,user_id:fixture.user,organization_id:other.org,name:'Forbidden',price:1});
    assert.equal(forged.error?.code,'42501','Cross-tenant insert must fail with RLS denial');
    const move=await fixture.client.from('products').update({organization_id:other.org}).eq('id',id);
    assert.equal(move.error?.code,'42501','Tenant reassignment must fail with RLS denial');
    const attackUpdate=await fixture.client.from('products').update({price:1}).eq('id',other.product).select('id');
    const attackDelete=await fixture.client.from('products').delete().eq('id',other.product).select('id');
    for (const attack of [attackUpdate,attackDelete]) {
      assert.ok(attack.error?.code==='42501' || (!attack.error && attack.data.length===0),'Cross-tenant mutation was not denied');
    }
    const {rows}=await db.query('SELECT id,organization_id,price::int FROM public.products WHERE id=ANY($1::uuid[]) ORDER BY id',[[id,other.product,forgedId]]);
    assert.deepEqual(rows.sort((a,b)=>a.price-b.price),[{id:other.product,organization_id:other.org,price:100},{id,organization_id:fixture.org,price:125}]);
    const removed=await fixture.client.from('products').delete().eq('id',id).select('id');
    assert.ok(!removed.error,'Own-tenant delete failed');
    assert.deepEqual(removed.data,[{id}]);
    const remaining=await db.query('SELECT id FROM public.products WHERE id=$1',[id]);
    assert.equal(remaining.rowCount,0);
  }
  const anonymousWrite=await anonymous.from('products').insert({id:randomUUID(),user_id:fixtures[0].user,organization_id:fixtures[0].org,name:'Forbidden anonymous',price:1});
  assert.ok([401,403].includes(anonymousWrite.status),'Anonymous product write was not denied');
  const {rows:finalRows}=await db.query('SELECT id FROM public.products ORDER BY id');
  assert.deepEqual(finalRows.map(row=>row.id),fixtures.map(f=>f.product).sort());
  console.log('Native Supabase write isolation PASS: positive CRUD, cross-tenant insert/update/delete and reassignment denial, anonymous write denial, SQL state verified');
  console.log('Native Supabase snapshot PASS: real Auth, PostgREST, two-tenant RLS, anonymous denial; first two historical collisions reconciled, self-role escalation denied');
} finally { await db.end(); }
