-- ════════════════════════════════════════════════════════════════
-- Documente 3 fonctions trouvées déployées sans migration correspondante
-- Date: 2026-07-22 — P1.2 (audit national de production, script de
-- détection scripts/check_rpc_signature_drift.py)
--
-- ensure_user_has_organization, select_plan et update_organization_subscription
-- existent en base (confirmé via pg_get_functiondef, lecture seule) mais
-- n'apparaissaient dans AUCUN fichier de migration du dépôt — dérive SQL
-- directe non documentée, même schéma de problème que
-- 20260720170000_document_live_receive_purchase_order.sql et
-- 20260720180000_document_live_generate_order_number.sql.
--
-- Recherche dans src/ : aucune des 3 n'est appelée par le frontend actuel
-- (seule admin_update_organization_subscription — fonction distincte,
-- avec le préfixe admin_ — est utilisée dans Billing.tsx et
-- OrganizationManagement.tsx). Il s'agit vraisemblablement de vestiges
-- d'un flux antérieur (self-service select_plan / update_organization_subscription
-- remplacé par le flux admin_* actuel), toujours actifs en base mais non
-- routés côté client. Aucun risque fonctionnel actif identifié.
--
-- Ce script réaffirme les 3 définitions live telles quelles (récupérées via
-- pg_get_functiondef). Aucun comportement changé, aucune donnée modifiée.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ensure_user_has_organization(p_org_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_org_name_final TEXT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id LIMIT 1;

  IF p_org_name IS NOT NULL AND length(trim(p_org_name)) > 0 THEN
    v_org_name_final := trim(p_org_name);
  ELSE
    v_org_name_final := coalesce(split_part(v_user_email, '@', 1), 'Mon Organisation');
  END IF;

  INSERT INTO public.organizations (
    name, owner_user_id, country, currency, subscription_plan
  ) VALUES (
    v_org_name_final, v_user_id, 'GN', 'GNF', 'starter'
  ) RETURNING id INTO v_org_id;

  UPDATE public.profiles
  SET organization_id = v_org_id
  WHERE user_id = v_user_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin');
  END IF;

  RETURN v_org_id;
END;
 $function$;

CREATE OR REPLACE FUNCTION public.select_plan(p_plan_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID := auth.uid(); v_org_id UUID; v_sub_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Non authentifie'; END IF;
  IF p_plan_id IS NULL OR p_plan_id NOT IN ('croissance', 'enterprise') THEN RAISE EXCEPTION 'Plan invalide'; END IF;
  SELECT organization_id INTO v_org_id FROM public.profiles WHERE user_id = v_user_id AND is_active = true LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Aucune organisation trouvee'; END IF;
  INSERT INTO public.subscriptions (organization_id, plan_id, status, billing_period, current_period_start, current_period_end)
  VALUES (v_org_id, p_plan_id, 'active', 'monthly', NOW(), NOW() + INTERVAL '30 days')
  ON CONFLICT (organization_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', current_period_start = NOW(), updated_at = NOW()
  RETURNING id INTO v_sub_id;
  RETURN v_sub_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_organization_subscription(p_plan_id text, p_status text DEFAULT 'active'::text, p_duration text DEFAULT '1 month'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_old_plan TEXT;
  v_event_type TEXT;
  v_period_end TIMESTAMPTZ;
  v_billing_period TEXT;
  v_sub_id UUID;
BEGIN
  -- Get caller's organization
  SELECT organization_id INTO v_org_id
  FROM profiles WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for current user';
  END IF;

  -- Validate plan exists
  IF NOT EXISTS (SELECT 1 FROM plans WHERE id = p_plan_id AND is_active) THEN
    RAISE EXCEPTION 'Invalid plan_id: %', p_plan_id;
  END IF;

  -- Calculate period end
  IF p_duration = '1 year' THEN
    v_period_end := NOW() + INTERVAL '1 year';
    v_billing_period := 'yearly';
  ELSE
    v_period_end := NOW() + INTERVAL '1 month';
    v_billing_period := 'monthly';
  END IF;

  -- Get current subscription info
  SELECT plan_id, id INTO v_old_plan, v_sub_id
  FROM subscriptions WHERE organization_id = v_org_id;

  IF v_sub_id IS NOT NULL THEN
    -- Update existing
    UPDATE subscriptions SET
      plan_id = p_plan_id,
      status = p_status,
      current_period_start = NOW(),
      current_period_end = v_period_end,
      billing_period = v_billing_period,
      updated_at = NOW()
    WHERE organization_id = v_org_id;

    IF v_old_plan IS DISTINCT FROM p_plan_id THEN
      IF p_plan_id > v_old_plan THEN
        v_event_type := 'upgraded';
      ELSE
        v_event_type := 'downgraded';
      END IF;
    ELSE
      v_event_type := 'renewed';
    END IF;

    INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
    VALUES (v_org_id, v_event_type, v_old_plan, p_plan_id, auth.uid(),
      jsonb_build_object('new_status', p_status, 'duration', p_duration));
  ELSE
    -- Create new
    INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start, current_period_end, billing_period)
    VALUES (v_org_id, p_plan_id, p_status, NOW(), v_period_end, v_billing_period)
    RETURNING id INTO v_sub_id;

    INSERT INTO subscription_events (organization_id, event_type, from_plan, to_plan, performed_by, metadata)
    VALUES (v_org_id, 'created', NULL, p_plan_id, auth.uid(),
      jsonb_build_object('status', p_status, 'duration', p_duration));
  END IF;

  -- Update legacy cache
  UPDATE organizations SET
    subscription_plan = p_plan_id,
    subscription_expires_at = v_period_end,
    updated_at = NOW()
  WHERE id = v_org_id;

  RETURN jsonb_build_object('success', TRUE, 'plan_id', p_plan_id, 'period_end', v_period_end);
END;
$function$;
