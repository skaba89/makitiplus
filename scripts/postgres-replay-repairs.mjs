// Compatibility for a fresh reconstruction from the historical snapshot only.
// These are not production migrations. Never edit the historical SQL or accept
// a new error: require both the original SHA-256 and original SQLSTATE.
export const repairNames = new Set([
  '20260702190000_backup_restore.sql',
  '20260703030000_p1_grant_execute_fixes.sql',
  '20260706180000_remove_unsafe_update_organization_subscription.sql',
  '20260709010000_fix_seller_activity_production.sql',
]);

function replaceExactlyOnce(sql, before, after) {
  if (sql.split(before).length !== 2) throw new Error('Replay repair source mismatch');
  return sql.replace(before, after);
}

export async function repairHistoricalMigration(client, name, sql) {
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
  throw new Error(`Unknown replay repair: ${name}`);
}
