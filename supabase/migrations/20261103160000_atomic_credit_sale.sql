-- MKP-003 (2026-11-03): a credit sale and its debt MUST commit together.
-- New RPC: no changes to historical sale RPC signatures, no existing row mutation.
-- Depends on 20260723130000_fix_sale_idempotency and
-- 20261102100000_credit_by_phone_idempotent.
-- PostgreSQL executes the called create_sale_with_limit and the customer ledger
-- inside this function's transaction. Any raised exception rolls BOTH back.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_credit_sale_atomic(
  p_sale_number TEXT,
  p_subtotal NUMERIC,
  p_total_amount NUMERIC,
  p_items JSONB,
  p_tax_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'credit',
  p_amount_paid NUMERIC DEFAULT 0,
  p_change_amount NUMERIC DEFAULT 0,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0,
  p_store_id UUID DEFAULT NULL,
  p_payment_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $mkp003$
DECLARE
  v_org_id UUID := public.get_user_organization_id();
  v_user_id UUID := auth.uid();
  v_sale_id UUID;
  v_sale public.sales%ROWTYPE;
  v_phone TEXT := NULLIF(btrim(p_customer_phone), '');
  v_name TEXT := NULLIF(btrim(p_customer_name), '');
  v_customer_id UUID;
  v_existing_credit UUID;
  v_matching_customers INTEGER;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL OR
     NOT (public.is_member_of_organization(v_org_id) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Accès refusé à cette organisation' USING ERRCODE = '42501';
  END IF;
  IF p_payment_method IS DISTINCT FROM 'credit' THEN
    RAISE EXCEPTION 'Méthode de paiement invalide pour une vente à crédit';
  END IF;
  IF p_sale_number IS NULL OR btrim(p_sale_number) = '' OR
     p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Numéro et montant positif requis pour une vente à crédit';
  END IF;
  IF v_name IS NULL AND v_phone IS NULL THEN
    RAISE EXCEPTION 'Nom ou téléphone client obligatoire pour une vente à crédit';
  END IF;

  -- Avoid a replay hitting a plan quota before discovering an already
  -- committed sale. For a brand-new sale, keep every existing plan/stock
  -- check in create_sale_with_limit, unchanged.
  SELECT * INTO v_sale
  FROM public.sales
  WHERE organization_id = v_org_id AND sale_number = p_sale_number
  FOR UPDATE;

  IF NOT FOUND THEN
    v_sale_id := public.create_sale_with_limit(
      p_sale_number => p_sale_number,
      p_subtotal => p_subtotal,
      p_total_amount => p_total_amount,
      p_items => p_items,
      p_tax_amount => p_tax_amount,
      p_payment_method => p_payment_method,
      p_amount_paid => p_amount_paid,
      p_change_amount => p_change_amount,
      p_customer_name => p_customer_name,
      p_customer_phone => p_customer_phone,
      p_seller_name => p_seller_name,
      p_discount_amount => p_discount_amount,
      p_store_id => p_store_id,
      p_payment_reference => p_payment_reference
    );
    -- Serializes concurrent retries and also checks the resolved tenant.
    SELECT * INTO STRICT v_sale
    FROM public.sales
    WHERE id = v_sale_id AND organization_id = v_org_id
    FOR UPDATE;
  ELSE
    v_sale_id := v_sale.id;
  END IF;

  -- Reject a caller trying to reuse another sale's idempotency key.
  IF v_sale.payment_method::TEXT <> 'credit' OR
     v_sale.total_amount IS DISTINCT FROM p_total_amount OR
     COALESCE(NULLIF(btrim(v_sale.customer_phone), ''), '') <>
       COALESCE(v_phone, '') OR
     COALESCE(NULLIF(btrim(v_sale.customer_name), ''), '') <>
       COALESCE(v_name, '') THEN
    RAISE EXCEPTION 'Conflit sur le numéro de vente existant'
      USING ERRCODE = '23505';
  END IF;

  -- Existing credit from the old two-RPC offline flow? A replay must be a
  -- no-op. The partial unique index prevents two ledger entries per sale.
  SELECT customer_id INTO v_existing_credit
  FROM public.customer_credits
  WHERE organization_id = v_org_id AND sale_number = p_sale_number
    AND type = 'credit'
  FOR UPDATE;
  IF FOUND THEN
    RETURN v_sale_id;
  END IF;

  IF v_phone IS NOT NULL THEN
    INSERT INTO public.customers (name, phone, organization_id, user_id)
    VALUES (COALESCE(v_name, v_phone), v_phone, v_org_id, v_user_id)
    ON CONFLICT (organization_id, phone)
      WHERE phone IS NOT NULL AND phone != ''
    DO UPDATE SET name = COALESCE(EXCLUDED.name, public.customers.name)
    RETURNING id INTO v_customer_id;
  ELSE
    -- A name-only customer is supported, but do not silently select an
    -- arbitrary customer when names are ambiguous in one organization.
    SELECT count(*) INTO v_matching_customers
    FROM public.customers
    WHERE organization_id = v_org_id AND phone IS NULL AND name = v_name;
    IF v_matching_customers > 1 THEN
      RAISE EXCEPTION 'Plusieurs clients portent ce nom : préciser le téléphone';
    ELSIF v_matching_customers = 1 THEN
      SELECT id INTO v_customer_id
      FROM public.customers
      WHERE organization_id = v_org_id AND phone IS NULL AND name = v_name
      FOR UPDATE;
    ELSE
      INSERT INTO public.customers (name, phone, organization_id, user_id)
      VALUES (v_name, NULL, v_org_id, v_user_id)
      RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  -- INSERT then customer balance update is one DB transaction; any failure
  -- (constraint, trigger, stock or permission) rolls back sale + all writes.
  INSERT INTO public.customer_credits (
    user_id, customer_id, sale_id, amount, type, description,
    organization_id, sale_number
  ) VALUES (
    v_user_id, v_customer_id, v_sale_id, p_total_amount, 'credit',
    'Vente crédit ' || p_sale_number, v_org_id, p_sale_number
  );

  UPDATE public.customers
  SET total_credit = total_credit + p_total_amount, updated_at = NOW()
  WHERE id = v_customer_id AND organization_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client introuvable après écriture du crédit';
  END IF;

  RETURN v_sale_id;
END;
$mkp003$;

REVOKE ALL ON FUNCTION public.create_credit_sale_atomic(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC,
  TEXT, TEXT, TEXT, NUMERIC, UUID, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_credit_sale_atomic(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC,
  TEXT, TEXT, TEXT, NUMERIC, UUID, TEXT
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_credit_sale_atomic(
  TEXT, NUMERIC, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, NUMERIC,
  TEXT, TEXT, TEXT, NUMERIC, UUID, TEXT
) TO authenticated;

COMMIT;
