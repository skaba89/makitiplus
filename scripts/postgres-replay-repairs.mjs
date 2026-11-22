import { readFileSync } from 'node:fs';

// Compatibility for a fresh reconstruction from the historical snapshot only.
// These are not production migrations. Never edit the historical SQL or accept
// a new error: require both the original SHA-256 and original SQLSTATE.
export const repairNames = new Set([
  '20260207065000_da463d93-5048-43ec-bb39-482bb0ea3ab9.sql',
  '20260424042936_db7e40cf-c001-4513-9126-a0596e12f542.sql',
  '20260202072852_917790af-3d14-44e9-bcdd-d88776ced82b.sql',
  '20260426042420_f2188ae3-aeea-4b23-9b02-04b4b9938345.sql',
  '20260614020000_add_missing_foreign_keys.sql',
  '20260614030000_tighten_rls_policies.sql',
  '20260702190000_backup_restore.sql',
  '20260703030000_p1_grant_execute_fixes.sql',
  '20260706180000_remove_unsafe_update_organization_subscription.sql',
  '20260709010000_fix_seller_activity_production.sql',
  '20260715050000_fix_super_admin_visibility.sql',
  '20260715120000_emergency_login_fix.sql',
]);

function replaceExactlyOnce(sql, before, after) {
  if (sql.split(before).length !== 2) throw new Error('Replay repair source mismatch');
  return sql.replace(before, after);
}

async function verifySnapshotTable(client, table, columns) {
  const {rows} = await client.query(`SELECT a.attname, format_type(a.atttypid,a.atttypmod) AS type,
    a.attnotnull AS required FROM pg_attribute a
    WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped`,['public.'+table]);
  for (const [name,type,required] of columns) {
    if (!rows.some(r=>r.attname===name && r.type===type && r.required===required)) {
      throw new Error('Unexpected snapshot column: '+table+'.'+name);
    }
  }
  const {rows:[state]} = await client.query(`SELECT relrowsecurity AS rls,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=c.oid AND contype='p'
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.oid AND attname='id')]) AS pk
    FROM pg_class c WHERE oid=to_regclass($1)`,['public.'+table]);
  if (!state?.rls || !state.pk) throw new Error('Unexpected snapshot table security or primary key: '+table);
}

export async function repairHistoricalMigration(client, name, sql) {
  if (name === '20260207065000_da463d93-5048-43ec-bb39-482bb0ea3ab9.sql') {
    const uuid='uuid', t='text', ts='timestamp with time zone';
    await verifySnapshotTable(client,'customers',[
      ['id',uuid,true],['user_id',uuid,true],['name',t,true],['phone',t,false],
      ['email',t,false],['address',t,false],['notes',t,false],['total_purchases','numeric',true],
      ['total_credit','numeric',true],['created_at',ts,true],['updated_at',ts,true],['organization_id',uuid,false]]);
    await verifySnapshotTable(client,'customer_credits',[
      ['id',uuid,true],['user_id',uuid,true],['customer_id',uuid,true],['sale_id',uuid,false],
      ['amount','numeric',true],['type',t,true],['description',t,false],['created_at',ts,true],['organization_id',uuid,false]]);
    const {rows:[state]} = await client.query(`SELECT
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sales'::regclass
        AND conname='sales_customer_id_fkey' AND confrelid='public.customers'::regclass AND convalidated) AS sale_customer,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_credits'::regclass
        AND conname='customer_credits_customer_id_fkey' AND confrelid='public.customers'::regclass AND convalidated) AS credit_customer,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customer_credits'::regclass
        AND conname='customer_credits_sale_id_fkey' AND confrelid='public.sales'::regclass AND convalidated) AS credit_sale,
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.customers'::regclass
        AND tgname='update_customers_updated_at' AND tgenabled<>'D'
        AND tgfoid='public.update_updated_at_column()'::regprocedure) AS updated_trigger`);
    if (!Object.values(state).every(Boolean)) throw new Error('Unexpected customer snapshot relationships');
    // The original objects already exist; retain newer tenant policies and
    // FK deletion semantics instead of re-adding old user-only policies.
    return 'Verified existing customers, credits, relationships, RLS and update trigger; preserved snapshot';
  }
  if (name === '20260424042936_db7e40cf-c001-4513-9126-a0596e12f542.sql') {
    const uuid='uuid', t='text', ts='timestamp with time zone';
    await verifySnapshotTable(client,'sync_conflicts',[
      ['id',uuid,true],['user_id',uuid,true],['organization_id',uuid,false],['entity_type',t,true],
      ['entity_id',uuid,false],['entity_label',t,false],['device_id',t,false],['local_data','jsonb',false],
      ['remote_data','jsonb',false],['resolved_data','jsonb',false],['resolution_strategy',t,true],
      ['status',t,true],['error_message',t,false],['acknowledged','boolean',true],['acknowledged_at',ts,false],['created_at',ts,true]]);
    const {rows:[state]} = await client.query(`SELECT
      to_regclass('public.idx_sync_conflicts_user_acknowledged') IS NOT NULL AS indexed,
      EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.sync_conflicts'::regclass
        AND polname='sync_conflicts_insert_own_org') AS scoped`);
    if (!state.indexed || !state.scoped) throw new Error('Unexpected sync conflict snapshot');
    // Preserve the more restrictive snapshot policies. Execute the original
    // compatible function definitions and audit indexes from this boundary.
    const boundary='-- Fonction : statut du compte connecté (pour polling client)';
    if (sql.split(boundary).length!==2) throw new Error('Unexpected sync migration boundary');
    await client.query(sql.slice(sql.indexOf(boundary)));
    return 'Verified sync conflict snapshot and replayed original functions/indexes without broad policies';
  }
  if (name === '20260202072852_917790af-3d14-44e9-bcdd-d88776ced82b.sql') {
    const {rows:[state]} = await client.query(`SELECT EXISTS (SELECT 1 FROM pg_policy
      WHERE polrelid='public.user_roles'::regclass AND polname='Users can create their own role' AND polcmd='a') AS present`);
    if (!state.present) throw new Error('Unexpected duplicate role policy');
    // Do not recreate the historical self-role escalation path. The later
    // security migrations replace it with the intended role policies.
    await client.query('DROP POLICY "Users can create their own role" ON public.user_roles');
    return 'Removed obsolete self-role assignment policy instead of recreating it';
  }
  if (name === '20260426042420_f2188ae3-aeea-4b23-9b02-04b4b9938345.sql') {
    // The snapshot already has these policies. Keep its stronger SELECT scope
    // and execute the remaining profile/table/index/backfill DDL. Platform
    // extensions are explicitly excluded from this compatibility repair.
    let repaired = replaceExactlyOnce(sql, `CREATE POLICY "admins_view_reset_tokens"
  ON public.password_reset_tokens FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));`, '');
    repaired = replaceExactlyOnce(repaired, `CREATE POLICY "admins_insert_reset_tokens"
  ON public.password_reset_tokens FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));`, '');
    repaired = replaceExactlyOnce(repaired,'CREATE EXTENSION IF NOT EXISTS pg_cron;','');
    repaired = replaceExactlyOnce(repaired,'CREATE EXTENSION IF NOT EXISTS pg_net;','');
    const {rows:[state]} = await client.query(`SELECT count(*)::int=2 AS present FROM pg_policy
      WHERE polrelid='public.password_reset_tokens'::regclass
        AND ((polname='admins_view_reset_tokens' AND polcmd='r') OR (polname='admins_insert_reset_tokens' AND polcmd='a'))`);
    if (!state.present) throw new Error('Unexpected reset token policies');
    await client.query(repaired);
    return 'Preserved snapshot token policies, applied schema DDL; cron/net remain unvalidated';
  }
  if (name === '20260614020000_add_missing_foreign_keys.sql') {
    const matches = [...sql.matchAll(/ALTER TABLE public\.(\w+)\s+ADD CONSTRAINT (\w+)\s+FOREIGN KEY \((\w+)\) REFERENCES public\.(\w+)\((\w+)\);/g)];
    if (matches.length !== 11) throw new Error('Unexpected FK migration contract');
    let repaired = sql;
    for (const [statement, table, constraint, column, parent, parentColumn] of matches) {
      const {rows} = await client.query(`SELECT c.contype='f' AND c.convalidated
        AND c.confrelid=to_regclass($3)
        AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass($1) AND attname=$4)]
        AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass($3) AND attname=$5)]
        AND c.confupdtype='a' AND c.confdeltype='a' AND c.confmatchtype='s'
        AND NOT c.condeferrable AND NOT c.condeferred AS equivalent
        FROM pg_constraint c WHERE c.conrelid=to_regclass($1) AND c.conname=$2`,
        ['public.'+table,constraint,'public.'+parent,column,parentColumn]);
      if (rows.length) {
        if (rows.length!==1 || !rows[0].equivalent) throw new Error('Conflicting existing foreign key: '+constraint);
        repaired = replaceExactlyOnce(repaired,statement,'');
      }
    }
    await client.query(repaired);
    return 'Verified existing foreign keys by catalog definition and validation; applied remaining DDL';
  }
  if (name === '20260614030000_tighten_rls_policies.sql') {
    const policies = [...sql.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.(\w+)/g)];
    if (policies.length !== 6) throw new Error('Unexpected RLS migration contract');
    // Replace only the six exact named policies in the original migration.
    // The remaining original statements, including legacy policy removals
    // and the organization backfill, still execute atomically.
    let repaired = sql;
    for (const [statement,policy,table] of policies) {
      repaired = replaceExactlyOnce(repaired,statement,`DROP POLICY IF EXISTS "${policy}" ON public.${table};\n${statement}`);
    }
    await client.query(repaired);
    return 'Reapplied exact historical tenant policies atomically without duplicate names';
  }
  if (name === '20260702190000_backup_restore.sql') {
    const {rows:[state]} = await client.query("SELECT to_regprocedure('public.is_org_admin()') IS NULL AS helper_absent");
    if (!state.helper_absent) throw new Error('Unexpected backup prerequisite');
    const boundary = '-- ─── RPC: generate_backup_number';
    if (sql.split(boundary).length !== 2) throw new Error('Unexpected backup migration boundary');
    // Preserve the historical tables, indexes, trigger and policies but do not
    // compile or expose unsafe legacy RPCs in the disposable reconstruction.
    // The forward migration likewise retires those RPCs on existing databases.
    await client.query(`CREATE FUNCTION public.is_org_admin() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','super_admin'));
      $$;\n${sql.split(boundary)[0]}\nREVOKE ALL ON public.backups FROM PUBLIC, anon, authenticated;`);
    return 'Reconstructed backup storage without unsafe legacy RPCs';
  }
  if (name === '20260703030000_p1_grant_execute_fixes.sql') {
    const { rows: [signature] } = await client.query(`SELECT
      to_regprocedure('public.is_user_active()') IS NULL AS old_absent,
      to_regprocedure('public.is_user_active(uuid)') IS NOT NULL AS current_exists,
      has_function_privilege('authenticated','public.is_user_active(uuid)','EXECUTE') AS already_granted`);
    // The preceding security migration already grants this exact signature.
    // Do not introduce a privilege that was not already present.
    if (!signature.old_absent || !signature.current_exists || !signature.already_granted) throw new Error('Unexpected is_user_active contract');
    await client.query(replaceExactlyOnce(sql,
      'GRANT EXECUTE ON FUNCTION public.is_user_active() TO authenticated;',
      'GRANT EXECUTE ON FUNCTION public.is_user_active(uuid) TO authenticated;'));
    return 'Corrected obsolete GRANT signature; prior privilege verified';
  }
  if (name === '20260706180000_remove_unsafe_update_organization_subscription.sql') {
    const { rows: [signature] } = await client.query("SELECT to_regprocedure('public.update_organization_subscription(text,text,text)') IS NULL AS absent");
    if (!signature.absent) throw new Error('Unsafe subscription RPC unexpectedly exists');
    // Preserve DROP IF EXISTS and NOTIFY; absence is the intended outcome.
    let repaired = replaceExactlyOnce(sql,
      'REVOKE EXECUTE ON FUNCTION public.update_organization_subscription(TEXT, TEXT, TEXT) FROM authenticated;', '');
    repaired = replaceExactlyOnce(repaired,
      'REVOKE EXECUTE ON FUNCTION public.update_organization_subscription(TEXT, TEXT, TEXT) FROM anon;', '');
    await client.query(repaired);
    return 'Obsolete REVOKEs unnecessary: unsafe signature already absent';
  }
  if (name === '20260709010000_fix_seller_activity_production.sql') {
    const {rows:[state]} = await client.query(`SELECT
      pg_get_function_result('public.get_seller_performance(timestamptz,timestamptz)'::regprocedure) = 'jsonb' AS performance,
      pg_get_function_result('public.get_seller_activities(uuid,integer)'::regprocedure) = 'jsonb' AS activities`);
    if (!state.performance || !state.activities) throw new Error('Unexpected historical seller return types');
    // PostgreSQL cannot CREATE OR REPLACE a function with a different return type.
    // Atomic, restricted to the disposable reconstruction; no CASCADE.
    await client.query(`DROP FUNCTION public.get_seller_performance(timestamptz,timestamptz);
      DROP FUNCTION public.get_seller_activities(uuid,integer);\n${sql}`);
    return 'Replaced obsolete JSONB signatures with historical table contracts';
  }
  if (name === '20260715050000_fix_super_admin_visibility.sql' ||
      name === '20260715120000_emergency_login_fix.sql') {
    // These failed scripts contain identity-specific reassignment, automatic
    // platform promotion and broadened RLS. Do not cast their role DML to make
    // it executable. Only reconstruct on a verified empty identity dataset.
    const {rows:[state]} = await client.query(`SELECT
      NOT EXISTS (SELECT 1 FROM public.profiles) AS profiles_empty,
      NOT EXISTS (SELECT 1 FROM public.user_roles) AS roles_empty,
      NOT EXISTS (SELECT 1 FROM public.organizations) AS organizations_empty,
      NOT EXISTS (SELECT 1 FROM auth.users) AS users_empty`);
    if (!Object.values(state).every(Boolean)) throw new Error('Role replay repair requires empty identity data');
    const migration = file => readFileSync(new URL('../supabase/migrations/' + file, import.meta.url),'utf8');
    if (name === '20260715050000_fix_super_admin_visibility.sql') {
      await client.query(migration('20261121200439_restrict_super_admin_to_explicit_role.sql'));
      return 'Reconstructed explicit-role authorization without automatic platform promotion';
    }
    // At this historical point has_role(uuid,text) does not yet exist.
    // Preserve self-login and explicit platform access only; the later
    // consolidated migration and scoped policy migrations rebuild team access.
    await client.query(`DROP POLICY IF EXISTS "user_roles_select_scoped" ON public.user_roles;
      CREATE POLICY "user_roles_select_scoped" ON public.user_roles FOR SELECT TO authenticated
        USING (user_id = auth.uid() OR public.is_super_admin());
      DROP POLICY IF EXISTS "profiles_select_scoped" ON public.profiles;
      CREATE POLICY "profiles_select_scoped" ON public.profiles FOR SELECT TO authenticated
        USING (user_id = auth.uid() OR public.is_super_admin());`);
    return 'Reconstructed self-login policies without identity-specific DML; later migrations restore scoped team access';
  }
  throw new Error(`Unknown replay repair: ${name}`);
}
