-- ════════════════════════════════════════════════════════════════════════════
-- SaaS Metrics RPCs for Admin Analytics
-- ════════════════════════════════════════════════════════════════════════════
-- Provides MRR, churn rate, conversion rate, plan distribution, and more
-- Only accessible to super_admin users (checked via is_super_admin())
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. get_saas_overview ───────────────────────────────────────────────
-- High-level SaaS KPIs: total orgs, active subs, MRR, ARR, plan distribution
CREATE OR REPLACE FUNCTION public.get_saas_overview()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_orgs BIGINT;
  v_active_paid BIGINT;
  v_trial BIGINT;
  v_grace_period BIGINT;
  v_read_only BIGINT;
  v_expired BIGINT;
  v_mrr NUMERIC;
  v_plan_distribution JSONB;
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  -- Total organizations
  SELECT COUNT(*) INTO v_total_orgs FROM organizations;

  -- Count by subscription status
  SELECT
    COUNT(*) FILTER (WHERE s.plan_id != 'starter' AND s.status = 'active'),
    COUNT(*) FILTER (WHERE s.trial_ends_at IS NOT NULL AND s.trial_ends_at > NOW() AND s.status = 'active'),
    COUNT(*) FILTER (WHERE s.status = 'grace_period'),
    COUNT(*) FILTER (WHERE s.status = 'read_only'),
    COUNT(*) FILTER (WHERE s.status = 'expired')
  INTO v_active_paid, v_trial, v_grace_period, v_read_only, v_expired
  FROM subscriptions s;

  -- MRR: sum of monthly prices for active paid subscriptions
  SELECT COALESCE(SUM(
    CASE
      WHEN s.plan_id = 'croissance' THEN 2900  -- $29 in cents
      WHEN s.plan_id = 'enterprise' THEN 7900  -- $79 in cents
      ELSE 0
    END
  ), 0) INTO v_mrr
  FROM subscriptions s
  WHERE s.status = 'active' AND s.plan_id != 'starter';

  -- Plan distribution
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_plan_distribution
  FROM (
    SELECT
      s.plan_id,
      p.name AS plan_name,
      COUNT(*) AS count,
      COUNT(*) FILTER (WHERE s.status = 'active') AS active_count,
      COUNT(*) FILTER (WHERE s.status = 'grace_period') AS grace_period_count,
      COUNT(*) FILTER (WHERE s.status = 'read_only') AS read_only_count,
      COUNT(*) FILTER (WHERE s.status = 'expired') AS expired_count,
      COUNT(*) FILTER (WHERE s.status = 'cancelled') AS cancelled_count
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    GROUP BY s.plan_id, p.name
    ORDER BY p.sort_order
  ) t;

  RETURN jsonb_build_object(
    'total_organizations', v_total_orgs,
    'active_paid_subscriptions', v_active_paid,
    'trial_subscriptions', v_trial,
    'grace_period_subscriptions', v_grace_period,
    'read_only_subscriptions', v_read_only,
    'expired_subscriptions', v_expired,
    'mrr_cents', v_mrr,
    'arr_cents', v_mrr * 12,
    'plan_distribution', v_plan_distribution,
    'free_to_paid_ratio', CASE WHEN v_total_orgs > 0
      THEN ROUND((v_active_paid::NUMERIC / v_total_orgs) * 100, 1)
      ELSE 0 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_saas_overview() TO authenticated;


-- ─── 2. get_saas_churn_metrics ──────────────────────────────────────────
-- Churn rate, cancellations, and conversion over time periods
CREATE OR REPLACE FUNCTION public.get_saas_churn_metrics(
  p_period_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
  v_total_at_start BIGINT;
  v_cancelled_in_period BIGINT;
  v_new_paid_in_period BIGINT;
  v_churn_rate NUMERIC;
  v_conversion_rate NUMERIC;
  v_total_signups BIGINT;
  v_monthly_churn JSONB;
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  v_period_start := NOW() - (p_period_days || ' days')::INTERVAL;

  -- Total paid at start of period (approximation based on events)
  SELECT COUNT(DISTINCT organization_id) INTO v_total_at_start
  FROM subscription_events
  WHERE event_type IN ('upgraded', 'checkout_completed', 'created')
    AND created_at < v_period_start
    AND organization_id NOT IN (
      SELECT DISTINCT organization_id FROM subscription_events
      WHERE event_type IN ('cancelled', 'auto_downgraded')
        AND created_at < v_period_start
    );

  -- Cancellations in period
  SELECT COUNT(DISTINCT organization_id) INTO v_cancelled_in_period
  FROM subscription_events
  WHERE event_type IN ('cancelled', 'auto_downgraded')
    AND created_at >= v_period_start;

  -- New paid subscriptions in period
  SELECT COUNT(DISTINCT organization_id) INTO v_new_paid_in_period
  FROM subscription_events
  WHERE event_type IN ('upgraded', 'checkout_completed')
    AND created_at >= v_period_start;

  -- Total signups in period
  SELECT COUNT(DISTINCT organization_id) INTO v_total_signups
  FROM subscription_events
  WHERE event_type = 'created'
    AND created_at >= v_period_start;

  -- Churn rate
  v_churn_rate := CASE WHEN v_total_at_start > 0
    THEN ROUND((v_cancelled_in_period::NUMERIC / v_total_at_start) * 100, 2)
    ELSE 0 END;

  -- Conversion rate (new paid / total signups)
  v_conversion_rate := CASE WHEN v_total_signups > 0
    THEN ROUND((v_new_paid_in_period::NUMERIC / v_total_signups) * 100, 2)
    ELSE 0 END;

  -- Monthly churn breakdown (last 6 months)
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_monthly_churn
  FROM (
    SELECT
      TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
      COUNT(DISTINCT CASE WHEN event_type IN ('cancelled', 'auto_downgraded') THEN organization_id END) AS churned,
      COUNT(DISTINCT CASE WHEN event_type IN ('upgraded', 'checkout_completed') THEN organization_id END) AS new_paid,
      COUNT(DISTINCT CASE WHEN event_type = 'created' THEN organization_id END) AS signups
    FROM subscription_events
    WHERE created_at >= NOW() - INTERVAL '6 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY DATE_TRUNC('month', created_at)
  ) r;

  RETURN jsonb_build_object(
    'period_days', p_period_days,
    'total_paid_at_start', v_total_at_start,
    'cancelled_in_period', v_cancelled_in_period,
    'new_paid_in_period', v_new_paid_in_period,
    'total_signups', v_total_signups,
    'churn_rate_pct', v_churn_rate,
    'conversion_rate_pct', v_conversion_rate,
    'monthly_breakdown', v_monthly_churn
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_saas_churn_metrics(INTEGER) TO authenticated;


-- ─── 3. get_saas_revenue_metrics ────────────────────────────────────────
-- Revenue breakdown by plan, MRR trend
CREATE OR REPLACE FUNCTION public.get_saas_revenue_metrics()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_mrr BIGINT := 0;
  v_revenue_by_plan JSONB;
  v_monthly_revenue JSONB;
BEGIN
  -- Verify super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  -- MRR: sum of monthly prices for all active paid subscriptions
  SELECT COALESCE(SUM(p.price_monthly), 0) INTO v_total_mrr
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.status = 'active' AND p.price_monthly > 0;

  -- Revenue by plan
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_revenue_by_plan
  FROM (
    SELECT
      p.id AS plan_id,
      p.name AS plan_name,
      COUNT(s.id) AS active_subscriptions,
      p.price_monthly AS price_monthly_cents,
      COUNT(s.id) * p.price_monthly AS mrr_cents
    FROM plans p
    LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'active'
    WHERE p.price_monthly > 0
    GROUP BY p.id, p.name, p.price_monthly
    ORDER BY p.sort_order
  ) r;

  -- Monthly revenue from payments (last 6 months)
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_monthly_revenue
  FROM (
    SELECT
      TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
      SUM(amount) AS total_cents,
      COUNT(*) AS payment_count,
      COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
    FROM stripe_payments
    WHERE created_at >= NOW() - INTERVAL '6 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY DATE_TRUNC('month', created_at)
  ) r;

  RETURN jsonb_build_object(
    'mrr_cents', v_total_mrr,
    'arr_cents', v_total_mrr * 12,
    'revenue_by_plan', v_revenue_by_plan,
    'monthly_revenue', v_monthly_revenue
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_saas_revenue_metrics() TO authenticated;
