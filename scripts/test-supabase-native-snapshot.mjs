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
    ['20260702190000_backup_restore.sql','03144e8c751ff8054075fa31a66b9f8660f6b897b5ebc27a15ae9ab45b33493a','42883'],
    ['20260702200000_support_tickets.sql','de63a4a495c900e19c17eb13df0420126d33f9a0a76d7e34be9a29ea01d8af85'],
    ['20260703010000_p0_hotfix_migrations.sql','b1acc46d4fc82a24d1b94fd750e482e8ba12aeb0d69ad5342586e02c99816c97'],
    ['20260703020000_p1_server_side_plan_enforcement.sql','f8f3762393f8aaf4a1d5bba06f9447a2a528318076b5573983194472211af097'],
    ['20260703030000_p1_grant_execute_fixes.sql','4fc88792977094d27b30f94b76ec50c6f473e64be13a55067bafc2fd6f8e5635','42883'],
    ['20260703040000_p1_sale_limit_grant_stripe_idempotency.sql','fd0db4607b04025b1749dfc3ed2008e527175fb6c379de0f4d1f0b6bbefceddb'],
    ['20260703050000_stripe_integration.sql','bd75c860e61b7666539fc1de1e3b95366a6c2d3d73f67b53d9d4dec5bebb87bd'],
    ['20260704010000_fix_missing_rpcs_v5.sql','e200be26de0abcf1a39dd6447f3ff7832bf494da3d1743651a8045e5dc845288'],
    ['20260704020000_add_stripe_customer_id_to_subscription_rpc.sql','e4908fd3ecfc287f6747784c59f1b27401fefb1976edf63ec6d7bc54acef735e'],
    ['20260704030000_add_missing_grant_execute.sql','9b0b7cae54ef112c86eee8a6aa5e73f71519352c1bfa93679b02eda8d2b986b1'],
    ['20260704040000_fix_cron_secret_and_schedules.sql','5c6a492c486460348e6652cb62f119670abe43795067be302760c8bdc783f881'],
    ['20260705010000_update_pricing_and_starter_trial.sql','b86dc12998b8d51b54b9b009acd551ef55ce2f15408da1f1bb87b139e74499ce'],
    ['20260705020000_fix_feature_access_and_trialing.sql','5e4571492a9a25198f87efb9815356d0708e86fa8a06166ee7241ad7cd2f47ff'],
    ['20260705030000_fix_super_admin_rls_and_has_role.sql','6ca5ed6c7d49ac4ba811acfa4cacabdd4ae025ad69ed9466d5c6b020c5df2431'],
    ['20260705040000_admin_subscription_management.sql','865dd755a3b23412d11fb9c58e7f9ad6258aafd331f35c6df57cee99ad0cc25d'],
    ['20260705050000_secure_manual_subscription_management.sql','754476ed61135198e704068e205f11cca9876974e9442531e0a542e68bb95e72'],
    ['20260705060000_force_row_level_security.sql','6eac6972e73efecdddcf8aadb4c4d2447f1c4309d14f80ef7a00ed95036b8f00'],
    ['20260706010000_fix_store_deletion.sql','c29648bd0cf1f4ee7a3ab95866212fad77dce24d47323212dcb3a3918db456e8'],
    ['20260706020000_increase_product_limits.sql','3c2733a98c44ed31c322ba93d4bc2d26447ae4a6e452c52b33edd71ff1b1c9c7'],
    ['20260706030000_fix_delete_organization_no_stores.sql','5f4d642f6627767173c35b2bfbdf1c585bb8e092532b0304cdb42aee8fc40df4'],
    ['20260706040000_fix_delete_organization_check_constraint.sql','127c14fc40aba428d998f0c9f5dd43c93d1d6d1761c0f0d574767851cafd8634'],
    ['20260706050000_comprehensive_audit_fix.sql','ea5b6d400a3d88b85d4026ca803f58c4c6cdbd5855f866dc49d4ec1bce20808e'],
    ['20260706060000_user_activity_tracking.sql','7b9d38795420d73c3e918a459031fb258c6a744d44a213a87947be620dfd5b00'],
    ['20260706100000_create_first_organization_rpc.sql','6518267107dfb5bf7fbe758c454b5fa795dba09afad5ebb4a0058856acdeebc1'],
    ['20260706180000_remove_unsafe_update_organization_subscription.sql','3977aa039c83ed33af269df8a464446929bcb2ccab2f10e4b29bc3bab1397521','42883'],
    ['20260706190000_enforce_store_limit_in_first_org_rpc.sql','951cb04a17c1979f0ffd9012f5baaca4d9f3eee21ae0b00b79549b444c319052'],
    ['20260706200000_fix_auth_profile_role_rls.sql','d6a3b3bf06db9a9f1a0794485850d605d6b1141acd3b5d4be1c4aaf1f38c5330'],
    ['20260707070000_auth_role_profile_bootstrap_safety.sql','b033577d77f47b8c4bea1e211f52e01d6f198157c2e36b0925b4ed7eebff933a'],
    ['20260708000000_p1_security_fixes.sql','84e8445294088612cf7b4f9b282fdce8c086be4db719aacd9add18c3a4412f4d'],
    ['20260708010000_p2_security_fixes.sql','344904a26c4675a2ec5dbd1ec702ee177d3206ffb7b65effaaa40958797685db'],
    ['20260708020000_p3_security_fixes.sql','a973fc203333fd0c9034cf91c2910ccd94eb4ee553177163bccd258b7baa58e3'],
    ['20260708030000_p3_1_create_update_updated_at_column.sql','33d10cd83ef1c1de9461266ba599035cf5a6e4f3f1a0c04c4cd740704fdbefd5'],
    ['20260708040000_tenant_isolation_user_roles_profiles.sql','076ea9b899258b0aeb2b8aca5a51ad890efb1331ab65bb90d5898d19c556e3fc'],
    ['20260708050000_fix_delete_organization_cascade.sql','b18170f83a9a696659e77d206bc640a62dbea9b5c4081b8051a18fd347391fc2'],
    ['20260708060000_fix_admin_get_all_subscriptions_type_cast.sql','fb220ab52b50294e4c1c6a224c013c46f2cc117d68101fbdee5c6734ce18200c'],
    ['20260708070000_fix_get_seller_performance_fields.sql','944c7e39e578888df45ee2a4be4d7146a417710f9783429be05a539c3529cc4f'],
    ['20260708080000_fix_rpc_returns_jsonb_global.sql','68d771fbed0ffc0761bb00bc8841b93ce3470f412bc3e03a8794750fe541f3a5'],
    ['20260708090000_fix_all_returns_table_rpcs.sql','2b5ef58d70c870086e9f26ce33f007eab2f182d906003b60225683a0146a2bbd'],
    ['20260709010000_fix_seller_activity_production.sql','788d85abe0131dad42616c97d9d53b23771442ada150e193d48349543b9a31c9','42P13'],
    ['20260711060000_fix_seller_performance_exclude_super_admin.sql','ab90baadcef0fb263724c5fc3b961baf500885c0fdf6fc2c39797f71f67875c5'],
    ['20260712120000_add_discount_amount_to_sale_rpc.sql','191f55394cac2c77e583bfe20163a667ed13cae6b19b477395cef639e43495a3'],
    ['20260712130000_enrich_reports_stats_with_margin.sql','89d0d1411770541f3eaee542af6557d70d32b39b1010292bb75c2fe2bdd98bab'],
    ['20260712140000_consolidate_create_product.sql','0a31a1f77a5f756bf43da2cfe9accb22920fe71b1b53f937b683cd40fca233d0'],
    ['20260712150000_add_missing_rpc_stubs.sql','9d049357b95734481390861d215e13db9b7081305523b5be98c5fc5bf810088c'],
    ['20260712160000_fix_check_plan_limit_jsonb_pattern.sql','53cf7a996296a737314d8503e62806e6d9c665ba2d61a6b7df356bb0ea63df0c'],
    ['20260712170000_add_description_expiry_isactive_to_products.sql','c59fc589a6de95e8962b9ea3271360aadd3bc09c20c1452e60fc81a075b1ff00'],
    ['20260712180000_CONSOLIDATED_all_critical_fixes.sql','5db1c7d526bc237c8ba571d4b49d3c84b6b285739cce79869250fe8abe0ae566','outer-transaction'],
    ['20260712190000_fix_payment_method_enum_cast.sql','b27bc1a1cc34bec554982e6ee8c83475d59fc261f3275ab304367d7a69721c81','outer-transaction'],
    ['20260712195000_harden_sales_store_scope.sql','1ed8fbc0ff0ab540b70dcfdce1308d1540d57d592638002ab673a5901b21237f','outer-transaction'],
    ['20260713100000_CLEANUP_RESET_PROJECT.sql','8c1dd99015ce1316853e5600e4ba970c12b1601285a2ef2ad7661017105f25ae','neutralized'],
    ['20260713110000_RECOVERY_CREATE_ORG.sql','f0c7a4652aa53d4992b47db93d0e080dddd211cbc864b9857f4974434b57a976','neutralized'],
    ['20260713120000_fix_create_first_organization_conflict.sql','54dc0ea277913743f1a487b0f5fbd7e0f65d05518c8a92cb300b7b5363dc4a3f'],
    ['20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql','0e430141cff5435fb6f927a5ede2349ac1b37d2fdc047a635b2fc6af0ff997c0','outer-transaction'],
    ['20260713210000_fix_rls_policies_suppliers_expenses_customers.sql','f08735ada21c2dad0134fd89b3384ebf33af98e0349dd7b49fde423ed864e06d'],
    ['20260713220000_enable_all_features_starter.sql','781db53d40ff41257bc74230ed4528fc3ef2333655466f395a40593af13c3751'],
    ['20260713230000_add_missing_suppliers_columns.sql','25510a1cf69e5cc1f72a3651a4f2e61060065460a1ca9b5ea6346fb342471efe'],
    ['20260713240000_create_test_users.sql','2ebca1a1f10e3ba088381bb9abe4a865e440c58e5f1c6577f09b444d078490e8','neutralized'],
    ['20260713260000_clean_transactional_data.sql','21e4c03745755f0ad941cb8dfe4f4e6a56f905fea19cb7570d63b5a12f45fa58','neutralized'],
    ['20260714010000_create_pilot_plan_restore_starter.sql','149ada95d98193bcc1bdba573e66b1cd2bc9a9264e66ed0d7ec11cd8ee826d4b'],
    ['20260714020000_store_management_enhanced.sql','e0dcd7303d3006d9589e2c12083feedd602b82b072aa38b6b1c2b8aa7752b61f'],
    ['20260715040000_super_admin_create_organization.sql','cce2ea31edb1b4a26c6cdd034c74b4a8a028efffec0e6b653bef4fda1ba5cb46'],
    ['20260715050000_fix_super_admin_visibility.sql','62d8b4256a858a48c2fa473a25c81e27176f582d20a9364578acb0246177b794','42804'],
    ['20260715060000_fix_super_admin_create_organization_rpc.sql','dc61ddbf819a9cd2df88a7107def8f053e97acf0df9d743155a16eef817117f6'],
    ['20260715070000_fix_super_admin_create_organization_owner.sql','4eb04637d8afb0c29dcb00fba238026f1f32a546ec1118494f8ff9920de4d32b'],
    ['20260715080000_fix_super_admin_can_read_all_stores.sql','4151ca32d90a9d34547d4bdf59c684c9106cb6b1729f696c1eac6a984592432c'],
    ['20260715090000_fix_duplicate_store_on_org_creation.sql','100fbfd043db31a858914eb63266c852a4af73ddfc9d44dd70cf21196a43e896'],
    ['20260715100000_hide_super_admin_from_org_admins.sql','af7b6639e177250bd5fabb429014ede0767932e13e26a7e95cb48243e19155f0'],
    ['20260715110000_fix_login_broken_by_rls.sql','2dcb1829d16f2f13ee20f3fc8ffb48ba4c6f6a288e785a1886fcb4c7dcf2222e'],
    ['20260715120000_emergency_login_fix.sql','b6eec7a71d79cad7948a23625cd0a7ae4d1e5dcd201674d034a9c218b360923f','42804'],
    ['20260715200000_CONSOLIDATED_ALL_FIXES.sql','c86784f3e2c4614333b40cfafd7a9349855cdc2548301d4a8c0c9db9cce8c8e9','outer-transaction'],
    ['20260716100000_admin_analytics_advanced_rpcs.sql','e9b40e5b1387c59166ffcd5bab0deed49b8a518edc4689866cfa1be615cf8eec'],
    ['20260716120000_super_admin_rls_all_tables.sql','6adfed9213d197f4d176fe15bd4711820fa4416f67f72e65c2b69c001f7d1ebb'],
    ['20260719100000_security_fixes_audit.sql','9c2d340376285854fd7260481bd98264b0d7eac66b153172a2a57c26fe3f193c'],
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
      if (name==='20260715200000_CONSOLIDATED_ALL_FIXES.sql') {
        const {rows:[state]}=await db.query(`SELECT NOT EXISTS (SELECT 1 FROM public.stores) AS stores_empty,
          NOT EXISTS (SELECT 1 FROM public.organizations) AS organizations_empty,
          NOT EXISTS (SELECT 1 FROM public.profiles) AS profiles_empty,
          NOT EXISTS (SELECT 1 FROM public.user_roles) AS roles_empty,
          NOT EXISTS (SELECT 1 FROM auth.users) AS users_empty`);
        assert.ok(Object.values(state).every(Boolean),'Historical consolidated identity/cleanup requires empty fixture data');
      }
      if (name==='20260715090000_fix_duplicate_store_on_org_creation.sql') {
        const {rows:[state]}=await db.query(`SELECT NOT EXISTS (SELECT 1 FROM public.stores) AS stores_empty,
          NOT EXISTS (SELECT 1 FROM public.organizations) AS organizations_empty`);
        assert.ok(Object.values(state).every(Boolean),'Historical store cleanup requires empty fixture data');
      }
      if (code==='outer-transaction') {
        // Exact, digest-pinned wrappers only: preserve all SQL between them,
        // while the existing outer transaction provides atomic execution.
        const boundaries={
          '20260712180000_CONSOLIDATED_all_critical_fixes.sql':[21,593],
          '20260712190000_fix_payment_method_enum_cast.sql':[17,176],
          '20260712195000_harden_sales_store_scope.sql':[32,269],
          '20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql':[19,371],
          '20260715200000_CONSOLIDATED_ALL_FIXES.sql':[20,323],
        }[name];
        assert.ok(boundaries,`Unreviewed transaction wrapper: ${name}`);
        const lines=historical.split('\n');
        const [start,end]=boundaries.map(n=>n-1);
        assert.match(lines[start],/^BEGIN;\s*(?:--.*)?$/);
        assert.equal(lines[end].trim(),'COMMIT;');
        lines[start]=''; lines[end]='';
        const body=lines.join('\n');
        assert.doesNotMatch(body,/^[\t ]*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im);
        await db.query('SAVEPOINT historical_wrapper');
        await db.query(body);
        await db.query('RELEASE SAVEPOINT historical_wrapper');
        if (name==='20260715200000_CONSOLIDATED_ALL_FIXES.sql') {
          const {rows:[state]}=await db.query(`SELECT prosrc FROM pg_proc WHERE oid='public.is_super_admin()'::regprocedure`);
          assert.match(state.prosrc,/owner_user_id/,'Historical owner fallback changed; reassess finding');
          console.log('Historical consolidated helper reintroduces owner privilege fallback (P0); restoring explicit role in rollback probe');
          await db.query(readFileSync(new URL('20261121200439_restrict_super_admin_to_explicit_role.sql',directory),'utf8'));
        }
        continue;
      }
      // Do not admit historical files that could close the enclosing rollback.
      assert.doesNotMatch(historical,/^[\t ]*(?:COMMIT|ROLLBACK)\s*;/im,`Explicit transaction boundary in ${name}`);
      if (code==='neutralized') {
        assert.equal(historical.replace(/^\s*--[^\n]*$/gm,'').trim(),'SELECT 1;',`Neutralized migration changed: ${name}`);
        await db.query(historical);
        continue;
      }
      if (code==='skip-cron') {
        // The exact registration has a real external HTTP target. Never run
        // it on the native stack, even in a rolled-back transaction.
        assert.equal(name,'20260426042625_fac2f592-7105-47f9-b6d5-63e8c4135346.sql');
        continue;
      }
      if (code) {
        assert.deepEqual(baseline[name].slice(0,2),[code,hash]);
        if (['20260715050000_fix_super_admin_visibility.sql','20260715120000_emergency_login_fix.sql'].includes(name)) {
          const {rows:[identity]}=await db.query(`SELECT
            NOT EXISTS (SELECT 1 FROM public.profiles) AS profiles_empty,
            NOT EXISTS (SELECT 1 FROM public.user_roles) AS roles_empty,
            NOT EXISTS (SELECT 1 FROM public.organizations) AS organizations_empty,
            NOT EXISTS (SELECT 1 FROM auth.users) AS users_empty`);
          assert.ok(Object.values(identity).every(Boolean),'Unsafe identity migration requires empty fixture data');
        }
        await db.query('SAVEPOINT original');
        await assert.rejects(db.query(historical),{code});
        await db.query('ROLLBACK TO SAVEPOINT original');
        await repairHistoricalMigration(db,name,historical);
        await db.query('RELEASE SAVEPOINT original');
      } else await db.query(historical);
    }
    // Native Supabase may grant EXECUTE directly to anon via default ACLs.
    // The historical REVOKE FROM PUBLIC does not remove that direct grant.
    const {rows:[bootstrap]}=await db.query(`SELECT
      has_function_privilege('anon','public.auth_bootstrap_status()','EXECUTE') AS anon_execute,
      NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.oid='public.auth_bootstrap_status()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public_revoked`);
    assert.ok(bootstrap.public_revoked,'Historical bootstrap PUBLIC grant was not revoked');
    await db.query('SAVEPOINT bootstrap_anon');
    await db.query('SET LOCAL ROLE anon');
    await assert.rejects(db.query('SELECT * FROM public.auth_bootstrap_status()'),{code:bootstrap.anon_execute?'P0001':'42501'});
    await db.query('ROLLBACK TO SAVEPOINT bootstrap_anon');
    await db.query('RELEASE SAVEPOINT bootstrap_anon');
    // Prove the explicit remediation in the disposable transaction only.
    console.log(`Historical bootstrap direct anon EXECUTE: ${bootstrap.anon_execute}`);
    await db.query('REVOKE EXECUTE ON FUNCTION public.auth_bootstrap_status() FROM anon');
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
         'public.stock_transfers'::regclass,'public.loyalty_accounts'::regclass,'public.loyalty_transactions'::regclass)) AS business_rls,
      (SELECT count(*)=4 AND bool_and(relrowsecurity) FROM pg_class WHERE oid IN
        ('public.backups'::regclass,'public.support_tickets'::regclass,'public.support_ticket_messages'::regclass,'public.stripe_events'::regclass)) AS operational_rls,
      NOT has_table_privilege('authenticated','public.backups','SELECT') AND NOT has_table_privilege('anon','public.backups','SELECT') AS private_backups,
      NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('create_backup','restore_backup')) AS legacy_backup_absent,
      (SELECT count(*)=2 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename IN ('support_tickets','support_ticket_messages')) AS support_realtime,
      (SELECT count(*)=6 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN
        ('public.organizations'::regclass,'public.products'::regclass,'public.sales'::regclass,
         'public.customer_credits'::regclass,'public.subscriptions'::regclass,'public.backups'::regclass)) AS forced_rls,
      to_regprocedure('public.admin_update_organization_subscription(uuid,text,text,text,text)') IS NOT NULL AS manual_subscription_rpc,
      to_regprocedure('public.check_feature_access(text)') IS NOT NULL AND to_regprocedure('public.check_plan_limit(text)') IS NOT NULL AS plan_checks,
      to_regprocedure('public.update_organization_subscription(text,text,text)') IS NULL AS unsafe_subscription_absent,
      to_regprocedure('public.create_first_organization(text,text,text,public.store_category,text,text)') IS NULL AS obsolete_onboarding_rpc_absent,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_activity_logs'::regclass) AS activity_rls,
      (SELECT count(*)=2 AND bool_and(confdeltype='n' AND convalidated) FROM pg_constraint
        WHERE conrelid='public.stock_transfers'::regclass AND conname IN ('stock_transfers_from_store_id_fkey','stock_transfers_to_store_id_fkey')) AS transfer_fk,
      NOT has_function_privilege('anon','public.auth_bootstrap_status()','EXECUTE') AND
        has_function_privilege('authenticated','public.auth_bootstrap_status()','EXECUTE') AS bootstrap_acl,
      EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.stripe_events'::regclass AND polname='stripe_events_service_role'
        AND polroles=ARRAY['service_role'::regrole::oid]) AS stripe_service_policy,
      (SELECT count(*)=2 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN
        ('public.whatsapp_config'::regclass,'public.whatsapp_message_logs'::regclass)) AS whatsapp_rls,
      EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.user_activity_logs'::regclass AND attname='action' AND atttypid='public.app_activity_action'::regtype AND NOT attisdropped)
        AND to_regprocedure('public.log_user_activity(text,text,jsonb)') IS NULL AS activity_enum,
      EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.profiles'::regclass AND polname='profiles_select_scoped') AND
        EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.user_roles'::regclass AND polname='user_roles_select_scoped') AS scoped_policies,
      pg_get_function_result('public.get_seller_performance(timestamptz,timestamptz)'::regprocedure) LIKE 'TABLE(%' AND
        pg_get_function_result('public.get_seller_activities(uuid,integer)'::regprocedure) LIKE 'TABLE(%' AS seller_table_contract,
      pg_get_function_result('public.get_organization_subscription()'::regprocedure)='jsonb' AND
        pg_get_function_result('public.check_feature_access(text)'::regprocedure)='jsonb' AND
        pg_get_function_result('public.check_plan_limit(text)'::regprocedure)='jsonb' AS subscription_json_contract,
      pg_get_function_result('public.create_sale_with_limit(text,numeric,numeric,jsonb,numeric,text,numeric,numeric,text,text,text,numeric,uuid)'::regprocedure)='uuid' AND
        to_regprocedure('public.create_sale_with_limit(text,numeric,numeric,jsonb,numeric,text,numeric,numeric,text,text,text,numeric)') IS NULL AND
        to_regprocedure('public.create_sale_with_limit(text,numeric,numeric,jsonb,numeric,text,numeric,numeric,text,text,text)') IS NULL AS store_sale_contract,
      pg_get_function_result('public.create_full_sale(uuid,uuid,text,numeric,numeric,jsonb,numeric,text,numeric,numeric,text,text,text,numeric,uuid)'::regprocedure)='uuid' AS full_store_sale_contract,
      pg_get_function_result('public.get_reports_stats(uuid,timestamptz,timestamptz)'::regprocedure)='jsonb' AS reports_contract,
      pg_get_function_result('public.create_product(text,numeric,uuid,text,text,integer,integer,numeric,uuid,uuid,text,text,boolean)'::regprocedure)='uuid' AS product_contract,
      pg_get_function_result('public.create_first_organization(text,text,text,text,text,text)'::regprocedure)='uuid' AND
        (SELECT count(*)=1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='create_first_organization') AND
        has_function_privilege('authenticated','public.create_first_organization(text,text,text,text,text,text)','EXECUTE') AS onboarding_text_contract,
      (SELECT count(*)=12 AND bool_and(polroles=ARRAY['authenticated'::regrole::oid] AND
        CASE WHEN polcmd='a' THEN polwithcheck IS NOT NULL ELSE polqual IS NOT NULL END)
        FROM pg_policy WHERE polrelid IN ('public.suppliers'::regclass,'public.expenses'::regclass,'public.customers'::regclass)
        AND polname IN ('suppliers_select_own_org','suppliers_insert_scoped','suppliers_update_scoped','suppliers_delete_scoped',
          'expenses_select_own_org','expenses_insert_scoped','expenses_update_scoped','expenses_delete_scoped',
          'customers_select_own_org','customers_insert_scoped','customers_update_scoped','customers_delete_scoped')) AS business_policy_catalog,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.products'::regclass AND conname='products_stock_quantity_nonneg' AND convalidated) AS stock_nonnegative,
      to_regprocedure('public.has_role(uuid,text)') IS NOT NULL AS text_role_helper,
      (SELECT count(*)=5 AND bool_and(proretset) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
        ('get_admin_users_per_org','get_admin_seller_performance','get_admin_org_kpis','get_admin_global_kpis','get_admin_product_ranking_detailed')) AS admin_analytics_contract,
      (SELECT count(*)=8 FROM pg_attribute WHERE attrelid='public.suppliers'::regclass AND NOT attisdropped AND
        attname IN ('city','country','notes','email','address','phone','is_active','store_id')) AS supplier_columns,
      EXISTS (SELECT 1 FROM public.plans WHERE id='pilot_national' AND has_supplier_management AND has_offline_advanced AND has_loyalty_program) AS pilot_features,
      EXISTS (SELECT 1 FROM public.plans WHERE id='starter' AND NOT has_supplier_management AND NOT has_offline_advanced AND NOT has_loyalty_program AND max_stores=1 AND max_users=2 AND max_products=2000 AND max_sales_per_month=500) AS starter_commercial_limits,
      pg_get_function_result('public.delete_store(uuid)'::regprocedure)='jsonb' AND
        pg_get_function_result('public.create_store(uuid,text,text,public.store_category,text,text,text)'::regprocedure)='uuid' AS store_management_contract,
      (SELECT count(*)=2 FROM pg_attribute WHERE attrelid='public.stores'::regclass AND NOT attisdropped AND attname IN ('city','address') AND atttypid='text'::regtype) AS store_address_columns,
      pg_get_function_result('public.super_admin_create_organization(text,text,text,text,text,text,text,text)'::regprocedure)='TABLE(org_id uuid, store_id uuid, success boolean, error text)' AS admin_org_contract,
      EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.is_super_admin()'::regprocedure AND prosrc LIKE '%user_roles%' AND prosrc NOT LIKE '%owner_user_id%') AS explicit_admin_role,
      EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.stores'::regclass AND polname='stores_select_org_member' AND polroles=ARRAY['authenticated'::regrole::oid] AND pg_get_expr(polqual,polrelid) LIKE '%is_super_admin()%') AS store_visibility_policy,
      (SELECT count(*)=2 AND bool_and(polroles=ARRAY['authenticated'::regrole::oid] AND polcmd='r' AND
        pg_get_expr(polqual,polrelid) LIKE '%auth.uid()%' AND pg_get_expr(polqual,polrelid) LIKE '%is_super_admin()%') FROM pg_policy
        WHERE (polrelid='public.profiles'::regclass AND polname='profiles_select_scoped') OR
        (polrelid='public.user_roles'::regclass AND polname='user_roles_select_scoped')) AS repaired_login_policies,
      EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.user_audit_log'::regclass AND polname='admins_view_audit_log') AS audit_scope_policy,
      (SELECT count(*)=3 FROM pg_attribute WHERE attrelid='public.products'::regclass AND NOT attisdropped AND
        ((attname='description' AND atttypid='text'::regtype) OR (attname='expiry_date' AND atttypid='date'::regtype) OR
         (attname='is_active' AND atttypid='boolean'::regtype))) AS product_columns`);
    for (const [name,passed] of Object.entries(contracts)) assert.equal(passed,true,`Historical prefix contract mismatch: ${name}`);
    // Historical audit evidence, not a security acceptance criterion: the
    // consolidated function is privileged and its stock predicate lacks tenant scope.
    const {rows:[historicalSale]}=await db.query(`SELECT prosecdef, prosrc FROM pg_proc
      WHERE oid='public.create_full_sale(uuid,uuid,text,numeric,numeric,jsonb,numeric,text,numeric,numeric,text,text,text,numeric,uuid)'::regprocedure`);
    assert.ok(historicalSale.prosecdef);
    const stockUpdate=historicalSale.prosrc.match(/UPDATE products\s+SET[\s\S]*?;/i)?.[0];
    assert.ok(stockUpdate,'Historical sale stock update not found');
    assert.doesNotMatch(stockUpdate,/organization_id|store_id/i,'Historical stock predicate changed; reassess audit finding');
    console.log('Historical consolidated sale: privileged stock update lacks tenant/store predicate (P0 remediation open)');
  } finally { await db.query('ROLLBACK'); }
  assert.deepEqual(await policyState(),before,'Historical prefix leaked policy changes');
  const {rows:[rolledBack]}=await db.query("SELECT to_regclass('public.idx_single_admin') IS NULL AS clean");
  assert.ok(rolledBack.clean,'Historical constraint escaped transaction');
  console.log('Native historical prefix PASS: 120 migrations accounted for, 2 reconciled persistently in local snapshot, 117 exercised and rolled back (5 transaction wrappers adapted, 4 verified no-ops), 1 cron registration not executed');

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
