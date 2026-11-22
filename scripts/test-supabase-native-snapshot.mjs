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
    ['20260426042420_f2188ae3-aeea-4b23-9b02-04b4b9938345.sql','566a1a762a949822a2d8d1c32bed738ce81adff7fadcebfbaf19804017cbd15f','42710'],
    ['20260426042625_fac2f592-7105-47f9-b6d5-63e8c4135346.sql','1a843e3558ae11b55529f2d44c3a57d66432f20d127f7ba95227955104d4ddbc','skip-cron'],
    ['20260427045819_7d242cc0-26f4-4887-a0d5-d687cb78cdba.sql','e964e8e1384bed9b590930780d48d471288f54d24dc54000d6c8a96c001eb5a0'],
    ['20260612031944_ff09240b-7ecb-49e5-b88b-e9800618663b.sql','833cf9e382d1c3e26e8b7290cfc22fb2541da1ebceca7b4261004956d314b63e'],
    ['20260612031957_f26f99b1-d459-4100-876b-f11b8ebf4985.sql','49b2c232b6a48bb8d27bc4479b4a589d01db74a1af7781b0ef2fa9778c356c69'],
    ['20260612032011_a2f1b765-7ea2-46da-be0c-40a9e3e7f831.sql','85b80fee6d2d97e2bfada276097abd769e522681dfd47a3c6935fc98e42d46a9'],
    ['20260614010000_batch_update_stock_rpc.sql','d46f34ebd4cac1480d1eaf436726a4af19dcab357f093b65c644a918f7466bee'],
    ['20260614020000_add_missing_foreign_keys.sql','5def3711cd78411e400d12c9f4f21f9fdf10e4a5788d8c6af98e3066841e3433','42710'],
    ['20260614030000_tighten_rls_policies.sql','4054f1b5d9d04090ef110c28deb6f49e884245cc56e01506780470233347656f','42710'],
    ['20260614040000_grant_admin_exists_to_anon.sql','56c1f0234ce7129842a1a21b5d32c3937342abd778ec71461611196e60e8039f'],
    ['20260629010000_add_super_admin_role.sql','63240141e721f21844434de4334d26cda0a5baa26c644d58512ebb09279e5cc3'],
    ['20260629010001_store_settings_and_default_categories.sql','85b07eddff49d2297a12cde6fe80a1a61f76b2dbfd07a2801220703c0431258b'],
    ['20260629020000_add_store_category.sql','aa27c63b1248f17b77ae6cda5d82ab62243ccff7e22af7ec45ffa436eb0f640d'],
    ['20260701010000_fix_rls_self_escalation_and_super_admin.sql','352d1193ed743f0bd2923cb6223ad518ce8e61be70bc6761bd7af71ad3acf1b2'],
    ['20260701010001_phase1_security_and_rpc.sql','b9a47a91250ff04145cde8ad22e0841c58abf7fccd63131ce1e086f059173624'],
    ['20260701020000_critical_audit_fixes.sql','414d2fc4601c222a64c33c293b6b792ae93d7cd1d59e848bbd00362478517aa2'],
    ['20260701030000_high_audit_fixes.sql','afca86a04084fc1b2ce2b280e92de2065068d4af1dec97eb6973b6a16b3c80f9'],
    ['20260701040000_add_nfc_enabled_to_profiles.sql','64b237f6685239b6a3d6bd189c060427d0f2cecb3f931e2935e9e57b0f866492'],
    ['20260701050000_fix_create_full_sale_race_condition.sql','aa7347a09cc881b6b488427752fde51db829838c9582756511279fc7e536bd2c'],
    ['20260702010000_add_missing_indexes.sql','6753dfcaf0f97e9b14586919e6c55a36cc84067fd5a7cb8eb7e2294d4e5a82e0'],
    ['20260702010001_add_suppliers_table.sql','7cdf1d5723b3e33cb105df93fd66bb6b0e260cda3465412de00a94bec32ed3b9'],
    ['20260702020000_race_condition_fixes.sql','02b55a5afed0e16e34dfd93d7148550a85d5b3a064af8dcff0924819ebab128e'],
    ['20260702030000_dashboard_rpc_aggregation.sql','de0096caf6115b127f37d27afafdb4739606cc0a5b5a3a930f2a2121646c51b5'],
    ['20260702040000_data_correctness_and_performance.sql','fb31ad93c4022ee3f6ab68e969d58102ef0dbb40f96a730cb2f9394d93d5d40a'],
    ['20260702050000_org_scoping_and_shared_hooks.sql','c3e772d694939dc980d083bebb6e90e3d708750b9830c6b4fd55726d6a6f2d73'],
    ['20260702060000_add_suppliers_and_supplier_products.sql','9fc6f09a1076f19c21c3dd8f92e3d1c47b7ff5a59f7b717117b5ceea0def3702'],
    ['20260702070000_admin_multi_store_analytics.sql','135901a4190738f054740212f57a897f08f3776b76d9165224f36a3fdd9e02ed'],
    ['20260702080000_security_hardening_rpc.sql','00785fd8351a1871dff0aaf58bbb1da7d051971cc597ff4ef84b1b7ce32d97e1'],
    ['20260702090000_p0_security_remove_client_identity_params.sql','d0cd23a9aa393908e68f5b98d41a5bb1801c8a8e29e807f4e457b79cbed8b9e7'],
    ['20260702100000_fix_register_user_first_admin.sql','c5e56300a0c2e0b9228208b947a55b2748cce6a583188674e6fd5622e0b85aa7'],
    ['20260702110000_saas_foundation_plans_subscriptions.sql','efc9d2e48cf980f2b2bed35e954272a66c82b56220ceceef7b96459ca01cb43b'],
    ['20260702120000_multi_store_support.sql','b297862fd6fb072685a4ab15d9a0be78694dafe444982830fb2b4b4a7a660ec2'],
    ['20260702130000_fix_subscription_events_and_lifecycle.sql','4823d6b73e82c821bc0db886491f4afee6dba961f213696f32b723a299ca8448'],
    ['20260702130001_purchase_orders.sql','a89db37c0cbc96bdbe319678b909d745b3abcfe11938f3bf05c8d03a8685b787'],
    ['20260702140000_saas_metrics_rpcs.sql','92d93a7791bf3bf78c5a9f65a014103d44c9fce1fb75cafe4f10c85c701e3f2c'],
    ['20260702150000_onboarding_premium.sql','beba0b94a141173dab78891102c7535b0e7f871f6e58c20d1884774256e4fd4c'],
    ['20260702160000_stock_transfers.sql','5cad38a80b1625f33614a287d1258304ee9bbf869c680e815643853a3b5b0689'],
    ['20260702170000_smart_restock_suggestions.sql','fa720ff96323ef3c970b4178a3fa4a47b1a6e124b64fb254ad6be6fd59e63973'],
    ['20260702180000_loyalty_program.sql','e9d600919cd856a128042a10c3ba2714e6746ecbc64a97a8311a67361cafce16'],
  ];
  assert.deepEqual(numbered.slice(prefix.length,prefix.length+next.length),next.map(([name])=>name));
  const policyState=async()=> (await db.query(`SELECT p.polname, c.relname, p.polcmd, p.polroles,
    pg_get_expr(p.polqual,p.polrelid) AS predicate, pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','storage') ORDER BY n.nspname,c.relname,p.polname`)).rows;
  const before=await policyState();
  await db.query('BEGIN');
  try {
    for (const [name,hash,code] of next) {
      const historical=readFileSync(new URL(name,directory),'utf8');
      assert.equal(createHash('sha256').update(historical).digest('hex'),hash);
      if (code==='skip-cron') {
        // The exact registration has a real external HTTP target. Never run
        // it on the native stack, even in a rolled-back transaction.
        assert.equal(name,'20260426042625_fac2f592-7105-47f9-b6d5-63e8c4135346.sql');
        continue;
      }
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
      to_regclass('public.idx_single_admin') IS NULL AS legacy_index_removed,
      public.resolve_stock_conflict(10,7,8)=5 AND public.resolve_stock_conflict(10,0,2)=0 AS stock_delta,
      EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.organizations'::regclass AND attname='default_tax_rate' AND NOT attisdropped) AS tax,
      NOT has_function_privilege('anon','public.is_user_active(uuid)','EXECUTE') AS private_status,
      has_function_privilege('service_role','public.is_user_active(uuid)','EXECUTE') AS service_status,
      has_function_privilege('anon','public.admin_exists()','EXECUTE') AS signup,
      EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.password_reset_tokens'::regclass AND polname='admins_view_reset_tokens_org') AS token_scope,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.stock_movements'::regclass AND contype='f' AND confrelid='public.sales'::regclass AND convalidated) AS sale_fk,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.suppliers'::regclass) AS supplier_rls,
      EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='suppliers') AS supplier_realtime,
      EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='org_admins_upload_logos') AS logo_policy,
      to_regprocedure('public.adjust_product_stock(uuid,text,integer,text)') IS NOT NULL AND
        to_regprocedure('public.adjust_product_stock(uuid,text,integer,text,uuid,uuid)') IS NULL AS adjust_stock,
      to_regprocedure('public.get_dashboard_stats(timestamptz,timestamptz,timestamptz,timestamptz)') IS NOT NULL AND
        to_regprocedure('public.get_dashboard_stats(uuid,timestamptz,timestamptz,timestamptz,timestamptz)') IS NULL AS dashboard,
      (SELECT count(*)=6 AND bool_and(relrowsecurity) FROM pg_class WHERE oid IN
        ('public.stores'::regclass,'public.subscriptions'::regclass,'public.purchase_orders'::regclass,
         'public.stock_transfers'::regclass,'public.loyalty_accounts'::regclass,'public.loyalty_transactions'::regclass)) AS business_rls`);
    assert.ok(Object.values(contracts).every(Boolean),'Historical prefix contract mismatch');
  } finally { await db.query('ROLLBACK'); }
  assert.deepEqual(await policyState(),before,'Historical prefix leaked policy changes');
  const {rows:[rolledBack]}=await db.query("SELECT to_regclass('public.idx_single_admin') IS NULL AS clean");
  assert.ok(rolledBack.clean,'Historical constraint escaped transaction');
  console.log('Native historical prefix PASS: 47 migrations accounted for, 2 reconciled persistently in local snapshot, 44 exercised and rolled back, 1 cron registration not executed');

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
