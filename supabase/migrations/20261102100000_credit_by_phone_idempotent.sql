-- ════════════════════════════════════════════════════════════════
-- Fix: increment_customer_credit_by_phone — idempotence + contrôle tenant
-- Date: 2026-11-02 — P0 (zéro doublon / sécurité multi-tenant)
--
-- Bug 1 (doublon de crédit) : la vente à crédit hors-ligne met en file
-- DEUX RPC : create_sale_with_limit (idempotente sur
-- (organization_id, sale_number) depuis 20260723130000) puis
-- increment_customer_credit_by_phone, qui ne l'est PAS. Si la réponse
-- du serveur est perdue après commit (3G/4G instable), la mutation est
-- rejouée à la synchronisation suivante → la dette du client est
-- comptée deux fois (customers.total_credit + 2 lignes customer_credits).
--
-- Bug 2 (multi-tenant) : la fonction est SECURITY DEFINER et accepte
-- p_organization_id tel quel, sans vérifier que l'appelant appartient
-- à cette organisation. Un utilisateur authentifié de l'org A pouvait
-- créer un client et une dette dans l'org B en passant son UUID.
--
-- Fix :
--   1. Colonne customer_credits.sale_number (nullable) + index UNIQUE
--      partiel (organization_id, sale_number) WHERE type = 'credit'
--      AND sale_number IS NOT NULL. Les lignes existantes ont
--      sale_number = NULL → aucune collision possible, aucun backfill.
--   2. Si une écriture de crédit existe déjà pour ce sale_number dans
--      l'org, la fonction renvoie le client existant sans rien
--      ré-incrémenter (rejeu = no-op). Course entre deux rejeux
--      concurrents : l'index unique fait échouer le second INSERT, qui
--      est intercepté AVANT l'incrément de total_credit.
--   3. Refus si l'appelant n'est ni membre de l'org, ni super_admin.
--
-- Non destructive : ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT
-- EXISTS, CREATE OR REPLACE avec signature identique. Aucune donnée
-- existante n'est modifiée.
-- ════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.customer_credits
  ADD COLUMN IF NOT EXISTS sale_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS customer_credits_org_sale_number_credit_unique
  ON public.customer_credits (organization_id, sale_number)
  WHERE type = 'credit' AND sale_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.increment_customer_credit_by_phone(
  p_customer_phone TEXT,
  p_customer_name TEXT,
  p_amount NUMERIC,
  p_organization_id UUID,
  p_sale_number TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_existing_customer_id UUID;
  v_sale_number TEXT := NULLIF(btrim(COALESCE(p_sale_number, '')), '');
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;
  IF p_customer_phone IS NULL OR p_customer_phone = '' THEN
    RAISE EXCEPTION 'Numéro de téléphone requis';
  END IF;

  -- Contrôle tenant : l'appelant doit appartenir à l'organisation ciblée
  -- (ou être super_admin, qui opère via le sélecteur d'organisation).
  IF NOT (public.is_member_of_organization(p_organization_id) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Accès refusé à cette organisation'
      USING ERRCODE = '42501';
  END IF;

  -- Idempotence : crédit déjà enregistré pour cette vente → no-op.
  IF v_sale_number IS NOT NULL THEN
    SELECT customer_id INTO v_existing_customer_id
    FROM public.customer_credits
    WHERE organization_id = p_organization_id
      AND sale_number = v_sale_number
      AND type = 'credit'
    LIMIT 1;

    IF v_existing_customer_id IS NOT NULL THEN
      RETURN v_existing_customer_id;
    END IF;
  END IF;

  INSERT INTO public.customers (name, phone, organization_id, user_id)
  VALUES (COALESCE(p_customer_name, p_customer_phone), p_customer_phone, p_organization_id, auth.uid())
  ON CONFLICT (organization_id, phone) WHERE phone IS NOT NULL AND phone != ''
  DO UPDATE SET name = COALESCE(EXCLUDED.name, public.customers.name)
  RETURNING id INTO v_customer_id;

  -- Écriture du mouvement AVANT l'incrément : si un rejeu concurrent a
  -- déjà inséré la même vente, l'index unique lève unique_violation et
  -- on sort sans toucher total_credit.
  BEGIN
    INSERT INTO public.customer_credits (
      user_id, customer_id, amount, type, description, organization_id, sale_number
    ) VALUES (
      auth.uid(), v_customer_id, p_amount, 'credit',
      'Vente crédit ' || COALESCE(v_sale_number, ''), p_organization_id, v_sale_number
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN v_customer_id;
  END;

  UPDATE public.customers
  SET total_credit = total_credit + p_amount, updated_at = NOW()
  WHERE id = v_customer_id AND organization_id = p_organization_id;

  RETURN v_customer_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_customer_credit_by_phone(TEXT, TEXT, NUMERIC, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_customer_credit_by_phone(TEXT, TEXT, NUMERIC, UUID, TEXT) TO authenticated;

COMMIT;
