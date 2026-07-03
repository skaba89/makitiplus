-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC : Vérifier quelles RPCs sont installées et lesquelles manquent
-- Execute dans : Supabase Dashboard -> SQL Editor -> New Query
-- ═══════════════════════════════════════════════════════════════════════════════

-- Vérification des 39 RPCs attendues
SELECT
  fn AS expected_rpc,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = fn AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN 'OK' ELSE 'MANQUANTE' END AS status
FROM unnest(ARRAY[
  'get_user_organization_id', 'is_member_of_organization', 'generate_sale_number',
  'create_full_sale', 'process_credit_payment', 'adjust_product_stock',
  'increment_customer_credit', 'register_user', 'get_customer_stats',
  'get_expense_stats', 'get_categories', 'get_product_stats',
  'get_supplier_stats', 'get_dashboard_stats', 'get_top_products',
  'get_reports_stats', 'get_low_stock_products', 'get_next_category_sort_order',
  'create_product', 'create_store', 'invite_user', 'create_sale_with_limit',
  'select_plan', 'get_plans', 'check_plan_limit', 'check_feature_access',
  'get_organization_subscription', 'check_account_status', 'touch_last_login',
  'admin_exists', 'get_organization_stores', 'set_current_store',
  'generate_order_number', 'receive_purchase_order',
  'get_admin_stores_summary', 'get_admin_article_ranking',
  'get_admin_stock_movements', 'get_admin_sales_trend', 'get_admin_payment_distribution'
]) AS fn
ORDER BY status, fn;
