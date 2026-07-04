-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 3 : check_feature_access — renommer p_feature → p_feature_key
-- Le frontend envoie { p_feature_key: "exports" } mais la RPC attend p_feature
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_feature_access(p_feature_key TEXT)
RETURNS TABLE (allowed BOOLEAN, plan_id TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID; v_plan_id TEXT; v_allowed BOOLEAN;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable'; END IF;
  SELECT plan_id INTO v_plan_id FROM public.subscriptions WHERE organization_id = v_org_id AND status IN ('active','past_due','grace_period') ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN v_plan_id := 'croissance'; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.plans WHERE id = $1 AND %I = true)', p_feature_key) INTO v_allowed USING v_plan_id;
  RETURN QUERY SELECT v_allowed, v_plan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_feature_access(TEXT) TO authenticated;

SELECT 'Fix 3 (check_feature_access p_feature_key) appliqué' AS status;
