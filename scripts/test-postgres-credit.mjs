import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repairHistoricalMigration } from './postgres-replay-repairs.mjs';

// Called only after the disposable replay succeeds. Uses actual migrated RPCs.
export async function testCreditTransactions(db, connect) {
  const a = '10000000-0000-4000-8000-000000000001';
  const b = '10000000-0000-4000-8000-000000000002';
  const oa = '20000000-0000-4000-8000-000000000001';
  const ob = '20000000-0000-4000-8000-000000000002';
  const pa = '30000000-0000-4000-8000-000000000001';
  const pb = '30000000-0000-4000-8000-000000000002';
  for (const [user, org, product] of [[a, oa, pa], [b, ob, pb]]) {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [user]);
    // Same onboarding trigger sequencing as the existing organization RPC.
    // Seed only; restore the trigger before executing any tested RPC.
    await db.query('BEGIN');
    await db.query('ALTER TABLE public.organizations DISABLE TRIGGER trigger_auto_create_store_settings');
    await db.query("INSERT INTO public.organizations(id,name,owner_user_id,subscription_plan) VALUES ($1,'Fixture',$2,'enterprise')", [org,user]);
    await db.query('ALTER TABLE public.organizations ENABLE TRIGGER trigger_auto_create_store_settings');
    await db.query('COMMIT');
    await db.query("INSERT INTO public.profiles(user_id,organization_id,business_name,owner_name) VALUES ($1,$2,'Fixture','Fixture')", [user,org]);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'admin')", [user]);
    await db.query("INSERT INTO public.products(id,user_id,organization_id,name,price,stock_quantity) VALUES ($1,$2,$3,'Fixture',100,20)", [product,user,org]);
  }
  async function session(user) {
    const c = await connect();
    await c.query('SET ROLE authenticated');
    await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
    return c;
  }
  const c1 = await session(a), c2 = await session(a), cB = await session(b);
  const sale = async (c, number, product = pa, amount = 100, name = 'Fixture Client', phone = '00000001') => {
    const { rows } = await c.query(`SELECT public.create_credit_sale_atomic($1,$2,$2,$3::jsonb,p_customer_name=>$4,p_customer_phone=>$5) AS id`, [number,amount,JSON.stringify([{product_id:product,product_name:'Fixture',quantity:1,unit_price:amount,total_price:amount}]),name,phone]);
    return rows[0].id;
  };
  async function state(org, number, product) {
    const {rows:[r]} = await db.query(`SELECT (SELECT count(*)::int FROM public.sales WHERE organization_id=$1 AND sale_number=$2) AS sales, (SELECT count(*)::int FROM public.sale_items i JOIN public.sales s ON s.id=i.sale_id WHERE s.organization_id=$1 AND s.sale_number=$2) AS items, (SELECT count(*)::int FROM public.customer_credits WHERE organization_id=$1 AND sale_number=$2) AS credits, (SELECT stock_quantity FROM public.products WHERE id=$3) AS stock`, [org,number,product]);
    return r;
  }
  try {
    // Only the trusted server may mint or redeem reset tokens. The browser
    // may read the existing history panel's metadata, never token hashes.
    const server = await connect();
    try {
      await server.query('SET ROLE service_role');
      for (const [user, org, hash] of [[a,oa,'fixture-hash-a'],[b,ob,'fixture-hash-b']]) {
        await server.query("INSERT INTO public.password_reset_tokens(user_id,organization_id,token_hash,channel,destination,created_by,expires_at) VALUES ($1,$2,$3,'email','fixture@example.invalid',$1,now()+interval '1 hour')",[user,org,hash]);
      }
      assert.equal((await server.query("UPDATE public.password_reset_tokens SET used_at=now() WHERE token_hash='fixture-hash-a'")).rowCount,1);
    } finally { await server.end(); }
    for (const [c,user] of [[c1,a],[cB,b]]) {
      assert.deepEqual((await c.query('SELECT user_id FROM public.password_reset_tokens')).rows,[{user_id:user}]);
      await assert.rejects(c.query('SELECT token_hash FROM public.password_reset_tokens'),{code:'42501'});
      await assert.rejects(c.query("UPDATE public.password_reset_tokens SET used_at=NULL"),{code:'42501'});
      await assert.rejects(c.query("INSERT INTO public.password_reset_tokens(user_id,token_hash) VALUES ($1,'forged')",[user]),{code:'42501'});
    }
    assert.equal((await db.query("SELECT has_column_privilege('anon','public.password_reset_tokens','id','SELECT') AS allowed")).rows[0].allowed,false);
    console.log('Reset tokens: server mint/redeem, scoped browser metadata and hash/write denial passed');
    // A missing sale or organization must fail referential integrity checks.
    const missing = '99999999-9999-4999-8999-999999999999';
    await assert.rejects(db.query("INSERT INTO public.stock_movements(user_id,product_id,type,quantity,previous_quantity,new_quantity,reference_id,organization_id) VALUES ($1,$2,'sale',1,20,19,$3,$4)",[a,pa,missing,oa]), {code:'23503'});
    await assert.rejects(db.query("INSERT INTO public.customers(user_id,organization_id,name) VALUES ($1,$2,'Orphan')",[a,missing]), {code:'23503'});
    // Mirror Data API grants only for this compatibility database, then test RLS.
    await db.query('GRANT SELECT, INSERT ON public.sync_conflicts TO authenticated');
    const conflict = (c,user,org) => c.query("INSERT INTO public.sync_conflicts(user_id,organization_id,entity_type,resolution_strategy) VALUES ($1,$2,'stock','manual')",[user,org]);
    await conflict(c1,a,oa);
    await conflict(cB,b,ob);
    await assert.rejects(conflict(c1,a,ob),{code:'42501'});
    await assert.rejects(conflict(c1,b,oa),{code:'42501'});
    assert.deepEqual((await c1.query('SELECT organization_id FROM public.sync_conflicts')).rows,[{organization_id:oa}]);
    assert.deepEqual((await cB.query('SELECT organization_id FROM public.sync_conflicts')).rows,[{organization_id:ob}]);
    console.log('Foreign keys and sync conflicts: orphan denial, scoped inserts and reads passed');
    // Never apply compatibility-only identity repairs to an existing dataset.
    for (const name of ['20260715050000_fix_super_admin_visibility.sql','20260715120000_emergency_login_fix.sql']) {
      await assert.rejects(repairHistoricalMigration(db,name,''), /requires empty identity data/);
    }
    // Existing backup payloads survive forward migration reapplication.
    await db.query("INSERT INTO public.backups(organization_id,backup_number,status,backup_data) VALUES ($1,'FIXTURE-A','completed','{\"products\":[{\"name\":\"fixture\"}]}'),($2,'FIXTURE-B','completed','{}')",[oa,ob]);
    const beforeBackup = (await db.query('SELECT * FROM public.backups ORDER BY backup_number')).rows;
    await db.query(readFileSync(new URL('../supabase/migrations/20261121214326_retire_unsafe_backup_rpc.sql',import.meta.url),'utf8'));
    assert.deepEqual((await db.query('SELECT * FROM public.backups ORDER BY backup_number')).rows,beforeBackup);
    for (const c of [c1,cB]) {
      await assert.rejects(c.query('SELECT * FROM public.backups'),{code:'42501'});
      await assert.rejects(c.query("SELECT public.restore_backup(NULL::uuid,NULL::text[])"),{code:'42883'});
      await assert.rejects(c.query("SELECT public.create_backup(NULL::text,'manual')"),{code:'42883'});
      await assert.rejects(c.query("SELECT public.delete_backup(NULL::uuid)"),{code:'42883'});
    }
    const backupAcl = (await db.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('anon','public.backups','SELECT') AS anon_read FROM pg_class WHERE oid='public.backups'::regclass")).rows[0];
    assert.deepEqual(backupAcl,{relrowsecurity:true,relforcerowsecurity:true,anon_read:false});
    console.log('Backup: payload preservation, forced RLS and unsafe RPC retirement passed');
    // Neither tenant may self-upgrade through retired billing RPCs.
    await assert.rejects(c1.query("SELECT public.select_plan('enterprise')"), {code:'42883'});
    await assert.rejects(c1.query("SELECT public.update_organization_subscription('enterprise','active','1 year')"), {code:'42883'});
    await assert.rejects(c1.query("SELECT public.admin_update_organization_subscription($1,'enterprise','1_month',NULL,NULL)",[ob]), /Accès refusé/);
    const first = await sale(c1,'SQL-CREDIT-1');
    assert.ok(first);
    assert.equal(await sale(c1,'SQL-CREDIT-1'),first);
    assert.deepEqual(await state(oa,'SQL-CREDIT-1',pa),{sales:1,items:1,credits:1,stock:19});
    await assert.rejects(sale(c1,'SQL-CREDIT-1',pa,200), {code:'23505'});
    assert.deepEqual(await state(oa,'SQL-CREDIT-1',pa),{sales:1,items:1,credits:1,stock:19});
    // A pre-existing ambiguity forces the ledger step to fail after sale creation.
    await db.query("INSERT INTO public.customers(user_id,organization_id,name) VALUES ($1,$2,'Ambiguous'),($1,$2,'Ambiguous')",[a,oa]);
    await assert.rejects(sale(c1,'SQL-ROLLBACK',pa,100,'Ambiguous',null), /Plusieurs clients/);
    assert.deepEqual(await state(oa,'SQL-ROLLBACK',pa),{sales:0,items:0,credits:0,stock:19});
    // Hold the winning transaction open while the second session submits the same number.
    await c1.query('BEGIN');
    const winner = await sale(c1,'SQL-CONCURRENT');
    const retry = sale(c2,'SQL-CONCURRENT');
    await c1.query('COMMIT');
    assert.equal(await retry,winner);
    assert.deepEqual(await state(oa,'SQL-CONCURRENT',pa),{sales:1,items:1,credits:1,stock:18});
    const other = await sale(cB,'SQL-CREDIT-1',pb);
    assert.notEqual(other,first);
    assert.deepEqual(await state(ob,'SQL-CREDIT-1',pb),{sales:1,items:1,credits:1,stock:19});
    const balances = await db.query("SELECT organization_id,total_credit::int FROM public.customers WHERE phone='00000001' ORDER BY organization_id");
    assert.deepEqual(balances.rows,[{organization_id:oa,total_credit:200},{organization_id:ob,total_credit:100}]);
    // Mirror the Data API read grants for the local compatibility schema only;
    // RLS remains enabled and no BYPASSRLS role is used for the assertions.
    await db.query('GRANT SELECT ON public.sales, public.customer_credits, public.products, public.customers, public.profiles, public.user_roles TO authenticated');
    for (const [c, org] of [[c1,oa],[cB,ob]]) {
      assert.equal((await c.query('SELECT public.is_super_admin() AS allowed')).rows[0].allowed,false,'organization owner must not be platform admin');
      for (const table of ['sales','customer_credits','products','customers']) {
        const { rows } = await c.query(`SELECT DISTINCT organization_id FROM public.${table}`);
        assert.deepEqual(rows,[{organization_id:org}],`RLS ${table} for ${org}`);
      }
    }
    // Real write isolation, including a mixed basket that must roll back entirely.
    const item = (product_id, quantity = 1) => ({product_id,product_name:'Fixture',quantity,unit_price:100,total_price:100*quantity});
    const cash = async (c, number, items) => (await c.query(
      'SELECT public.create_sale_with_limit($1,100,100,$2::jsonb) AS id',
      [number,JSON.stringify(items)]
    )).rows[0].id;
    await assert.rejects(cash(c1,'SQL-FOREIGN',[item(pb)]), {code:'42501'});
    await assert.rejects(cash(cB,'SQL-FOREIGN',[item(pa)]), {code:'42501'});
    await assert.rejects(cash(c1,'SQL-MIXED',[item(pa),item(pb)]), {code:'42501'});
    await assert.rejects(cash(c1,'SQL-NEGATIVE',[item(pa,-1)]), {code:'22023'});
    await assert.rejects(sale(c1,'SQL-CREDIT-FOREIGN',pb), {code:'42501'});
    for (const [org, number, product, stock] of [[oa,'SQL-FOREIGN',pa,18],[ob,'SQL-FOREIGN',pb,19],[oa,'SQL-MIXED',pa,18],[oa,'SQL-NEGATIVE',pa,18],[oa,'SQL-CREDIT-FOREIGN',pa,18]]) {
      assert.deepEqual(await state(org,number,product),{sales:0,items:0,credits:0,stock});
    }
    const signature = 'public.create_full_sale(uuid,uuid,text,numeric,numeric,jsonb,numeric,text,numeric,numeric,text,text,text,numeric,uuid,text)';
    for (const role of ['anon','authenticated']) {
      assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,signature])).rows[0].allowed,false);
    }
    await assert.rejects(c1.query('SELECT public.create_full_sale($1,$2,$3,100,100,$4::jsonb)',[b,ob,'SQL-CREDIT-1',JSON.stringify([item(pb)])]), {code:'42501'});
    const cashId = await cash(c1,'SQL-CASH',[item(pa)]);
    assert.ok(cashId);
    assert.equal(await cash(c1,'SQL-CASH',[item(pa)]),cashId);
    assert.deepEqual(await state(oa,'SQL-CASH',pa),{sales:1,items:1,credits:0,stock:17});
    // Reporting must execute the frontend's tabular contract and remain tenant-scoped.
    const accountant = '10000000-0000-4000-8000-000000000004';
    await db.query('INSERT INTO auth.users(id) VALUES ($1)',[accountant]);
    await db.query("INSERT INTO public.profiles(user_id,organization_id,business_name,owner_name) VALUES ($1,$2,'Fixture','Accountant')",[accountant,oa]);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'comptable')",[accountant]);
    await db.query("INSERT INTO public.user_activity_logs(user_id,organization_id,action) VALUES ($1,$2,'login'),($3,$4,'login')",[a,oa,b,ob]);
    for (const [c, user, org, count] of [[c1,a,oa,3],[cB,b,ob,1]]) {
      const perf = await c.query('SELECT user_id,total_sales::int FROM public.get_seller_performance()');
      assert.deepEqual(perf.rows,[{user_id:user,total_sales:count}]);
      const kpis = await c.query("SELECT seller_id,total_sales::int FROM public.get_seller_kpis_detailed('month',$1)",[org]);
      assert.deepEqual(kpis.rows,[{seller_id:user,total_sales:count}]);
      await assert.rejects(c.query("SELECT * FROM public.get_seller_kpis_detailed('month',$1)",[org===oa?ob:oa]),{code:'42501'});
      assert.deepEqual((await c.query('SELECT user_id,action FROM public.get_seller_activities($1,100)',[user])).rows,[{user_id:user,action:'login'}]);
      assert.deepEqual((await c.query('SELECT * FROM public.get_seller_activities($1,100)',[org===oa?b:a])).rows,[]);
    }
    const unassigned = await session('10000000-0000-4000-8000-000000000099');
    try { await assert.rejects(unassigned.query('SELECT * FROM public.get_seller_kpis_detailed()'),{code:'42501'}); }
    finally { await unassigned.end(); }
    for (const signature of ['public.get_seller_performance(timestamptz,timestamptz)','public.get_seller_activities(uuid,integer)','public.get_seller_kpis_detailed(text,uuid)']) {
      assert.equal((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS allowed",[signature])).rows[0].allowed,false);
    }
    console.log('Seller reporting: tabular results, totals, tenant scope, unassigned/anonymous denial passed');
    const ticket = (await c1.query("SELECT public.create_support_ticket('Fixture','First message') AS result")).rows[0].result.id;
    assert.ok(ticket);
    assert.equal((await c1.query('SELECT * FROM public.get_ticket_messages($1)',[ticket])).rowCount,1);
    await c1.query("SELECT public.add_ticket_message($1,'Reply')",[ticket]);
    assert.equal((await c1.query('SELECT * FROM public.get_ticket_messages($1)',[ticket])).rowCount,2);
    assert.equal((await c1.query('SELECT id FROM public.get_support_tickets()')).rows[0].id,ticket);
    assert.equal((await cB.query('SELECT * FROM public.get_support_tickets()')).rowCount,0);
    assert.equal((await cB.query('SELECT * FROM public.support_ticket_messages')).rowCount,0);
    await assert.rejects(cB.query('SELECT * FROM public.get_ticket_messages($1)',[ticket]), /access denied/i);
    await assert.rejects(cB.query("SELECT public.add_ticket_message($1,'Foreign')",[ticket]), /access denied/i);
    await assert.rejects(c1.query("SELECT public.add_ticket_message($1,'Fake','admin')",[ticket]), {code:'42501'});
    await assert.rejects(c1.query('DELETE FROM public.support_tickets WHERE id=$1',[ticket]), {code:'42501'});
    assert.equal((await cB.query("SELECT public.update_ticket_status($1,'closed') AS result",[ticket])).rows[0].result,false);
    const supportAccountant = await session(accountant);
    try {
      await assert.rejects(supportAccountant.query("SELECT public.update_ticket_status($1,'closed')",[ticket]), {code:'42501'});
      await assert.rejects(supportAccountant.query('SELECT public.delete_support_ticket($1)',[ticket]), {code:'42501'});
    } finally { await supportAccountant.end(); }
    assert.equal((await c1.query('SELECT total_tickets FROM public.get_support_stats()')).rows[0].total_tickets,1);
    assert.equal((await db.query("SELECT has_function_privilege('anon','public.get_support_stats()','EXECUTE') AS allowed")).rows[0].allowed,false);
    console.log('Support: ticket/message RPCs, two-tenant isolation, role and sender restrictions passed');
    console.log('Sale write isolation: foreign products, mixed basket rollback, negative quantity, direct RPC denial and cash replay passed');
    // Explicit platform administrator retains the previously intended access.
    const platformUser = '10000000-0000-4000-8000-000000000003';
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [platformUser]);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'super_admin')", [platformUser]);
    const platform = await session(platformUser);
    try {
      // Test the same SELECT contracts used by login and team management.
      for (const [c, own, visible] of [[c1,a,[a,accountant]],[cB,b,[b]]]) {
        assert.deepEqual((await c.query('SELECT user_id FROM public.profiles ORDER BY user_id')).rows.map(r=>r.user_id),visible);
        assert.deepEqual((await c.query('SELECT user_id FROM public.user_roles ORDER BY user_id')).rows.map(r=>r.user_id),visible);
        assert.deepEqual((await c.query('SELECT role FROM public.user_roles WHERE user_id=$1',[own])).rows,[{role:'admin'}]);
      }
      assert.deepEqual((await platform.query('SELECT user_id FROM public.user_roles ORDER BY user_id')).rows.map(r=>r.user_id),[a,b,platformUser,accountant]);
      const cashier = await session(accountant);
      try {
        assert.deepEqual((await cashier.query('SELECT user_id,role FROM public.user_roles')).rows,[{user_id:accountant,role:'comptable'}]);
        assert.deepEqual((await cashier.query('SELECT user_id FROM public.profiles ORDER BY user_id')).rows.map(r=>r.user_id),[a,accountant]);
      } finally { await cashier.end(); }
      console.log('Login roles: self-read, scoped team visibility, platform isolation and explicit super-admin passed');
      assert.equal((await platform.query('SELECT public.is_super_admin() AS allowed')).rows[0].allowed,true);
      assert.equal((await platform.query('SELECT count(DISTINCT organization_id)::int AS count FROM public.sales')).rows[0].count,2);
      assert.deepEqual((await platform.query('SELECT seller_id FROM public.get_seller_kpis_detailed() ORDER BY seller_id')).rows,[{seller_id:a},{seller_id:b}]);
      assert.deepEqual((await platform.query("SELECT seller_id FROM public.get_seller_kpis_detailed('month',$1)",[ob])).rows,[{seller_id:b}]);
    } finally { await platform.end(); }
    assert.equal((await db.query("SELECT has_function_privilege('anon','public.create_credit_sale_atomic(text,numeric,numeric,jsonb,numeric,text,numeric,numeric,text,text,text,numeric,uuid,text)','EXECUTE') AS allowed")).rows[0].allowed,false);
    console.log('Credit transaction tests: atomicity, replay, conflict, rollback, concurrency, tenant-specific keys, balances, RLS reads, anonymous denial passed');
  } finally { await Promise.all([c1.end(),c2.end(),cB.end()]); }
}
