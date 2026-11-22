import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

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
  // Demonstrate the first strict-replay blocker on native SQL, rolling back
  // regardless of outcome; never execute beyond this known historical boundary.
  const historical = readFileSync(new URL('../supabase/migrations/20260202072852_917790af-3d14-44e9-bcdd-d88776ced82b.sql',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(historical).digest('hex'),'0718e0ba1086a3720da1bc6bd1840e695f0ba25354361a098ea331bc3e166f4a');
  await db.query('BEGIN');
  try { await assert.rejects(db.query(historical), {code:'42710'}); }
  finally { await db.query('ROLLBACK'); }

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
    fixtures.push({client,org,product});
  }
  for (const fixture of fixtures) {
    const result=await fixture.client.from('products').select('id,organization_id');
    assert.ok(!result.error,'Native authenticated Data API query failed');
    assert.deepEqual(result.data,[{id:fixture.product,organization_id:fixture.org}]);
  }
  const denied=await anonymous.from('products').select('id');
  assert.ok((!denied.error && denied.data.length===0) || [401,403].includes(denied.status),'Anonymous product access was not denied');
  console.log('Native Supabase snapshot PASS: real Auth, PostgREST, two-tenant RLS, anonymous denial; first historical strict-replay blocker reproduced');
} finally { await db.end(); }
