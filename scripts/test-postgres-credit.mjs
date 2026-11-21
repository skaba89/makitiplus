import assert from 'node:assert/strict';

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
    await db.query('GRANT SELECT ON public.sales, public.customer_credits, public.products, public.customers, public.profiles TO authenticated');
    for (const [c, org] of [[c1,oa],[cB,ob]]) {
      assert.equal((await c.query('SELECT public.is_super_admin() AS allowed')).rows[0].allowed,false,'organization owner must not be platform admin');
      for (const table of ['sales','customer_credits','products','customers']) {
        const { rows } = await c.query(`SELECT DISTINCT organization_id FROM public.${table}`);
        assert.deepEqual(rows,[{organization_id:org}],`RLS ${table} for ${org}`);
      }
    }
    // Explicit platform administrator retains the previously intended access.
    const platformUser = '10000000-0000-4000-8000-000000000003';
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [platformUser]);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'super_admin')", [platformUser]);
    const platform = await session(platformUser);
    try {
      assert.equal((await platform.query('SELECT public.is_super_admin() AS allowed')).rows[0].allowed,true);
      assert.equal((await platform.query('SELECT count(DISTINCT organization_id)::int AS count FROM public.sales')).rows[0].count,2);
    } finally { await platform.end(); }
    assert.equal((await db.query("SELECT has_function_privilege('anon','public.create_credit_sale_atomic(text,numeric,numeric,jsonb,numeric,text,numeric,numeric,text,text,text,numeric,uuid,text)','EXECUTE') AS allowed")).rows[0].allowed,false);
    console.log('Credit transaction tests: atomicity, replay, conflict, rollback, concurrency, tenant-specific keys, balances, RLS reads, anonymous denial passed');
  } finally { await Promise.all([c1.end(),c2.end(),cB.end()]); }
}
