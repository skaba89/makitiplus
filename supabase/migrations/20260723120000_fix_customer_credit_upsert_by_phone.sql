-- ════════════════════════════════════════════════════════════════
-- Fix: crédit client par téléphone — cassé en ligne ET hors-ligne
-- Date: 2026-07-23 — P3 (gap-closing)
--
-- Bug 1a (EN LIGNE, jamais remarqué avant) : useOfflineSale.ts (chemin
-- ONLINE) fait, pour une vente à crédit avec un numéro de téléphone :
--   supabase.from("customers").upsert(data, { onConflict: "phone,organization_id" })
-- Vérifié en base live (pg_constraint sur public.customers) : AUCUNE
-- contrainte UNIQUE n'existe sur (organization_id, phone) — seulement la
-- PK sur id et les FK. PostgREST/Postgres exige qu'ON CONFLICT (col1, col2)
-- corresponde à une contrainte UNIQUE ou un index unique réel, sinon
-- l'erreur 42P10 "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification" est levée. Le code appelant avale déjà cette
-- erreur silencieusement (`if (!custErr && upsertedCustomer)`), donc
-- customerId reste null, et tout le bloc crédit (insert customer_credits +
-- RPC increment_customer_credit) est skippé sans jamais remonter d'erreur
-- à l'utilisateur : une vente à crédit pour un NOUVEAU client identifié
-- par téléphone n'enregistre jamais son crédit, en ligne comme hors-ligne.
--
-- Bug 1b (HORS LIGNE) : le chemin OFFLINE appelle la RPC
-- increment_customer_credit avec les paramètres p_customer_phone,
-- p_customer_name, p_amount, p_organization_id, p_sale_number — aucun ne
-- correspond à la signature réellement déployée
-- increment_customer_credit(p_customer_id uuid, p_amount numeric)
-- (vérifié via pg_get_functiondef, un seul overload existe). Échec garanti
-- ("function not found in schema cache") à chaque synchronisation.
--
-- Vérifié : aucun doublon (organization_id, phone) existant en base
-- (SELECT ... GROUP BY ... HAVING COUNT(*) > 1 → 0 ligne) — l'ajout de la
-- contrainte est donc sûr, aucun backfill ni suppression nécessaire.
--
-- Fix : une contrainte UNIQUE partielle (ignore les téléphones NULL/vides,
-- plusieurs clients peuvent légitimement ne pas avoir de téléphone) + une
-- nouvelle RPC increment_customer_credit_by_phone qui fait l'upsert client
-- ET l'incrément de crédit de façon atomique, appelable identiquement en
-- ligne et hors-ligne (remplace le dance en 2 étapes actuel).
-- ════════════════════════════════════════════════════════════════

-- 1. Contrainte UNIQUE (partielle — ignore NULL et chaîne vide)
CREATE UNIQUE INDEX IF NOT EXISTS customers_org_phone_unique
  ON public.customers (organization_id, phone)
  WHERE phone IS NOT NULL AND phone != '';

-- 2. RPC atomique find-or-create + incrément crédit
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

  INSERT INTO public.customers (name, phone, organization_id, user_id)
  VALUES (COALESCE(p_customer_name, p_customer_phone), p_customer_phone, p_organization_id, auth.uid())
  ON CONFLICT (organization_id, phone) WHERE phone IS NOT NULL AND phone != ''
  DO UPDATE SET name = COALESCE(EXCLUDED.name, public.customers.name)
  RETURNING id INTO v_customer_id;

  UPDATE public.customers
  SET total_credit = total_credit + p_amount, updated_at = NOW()
  WHERE id = v_customer_id AND organization_id = p_organization_id;

  INSERT INTO public.customer_credits (
    user_id, customer_id, amount, type, description, organization_id
  ) VALUES (
    auth.uid(), v_customer_id, p_amount, 'credit',
    'Vente crédit ' || COALESCE(p_sale_number, ''), p_organization_id
  );

  RETURN v_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_customer_credit_by_phone(TEXT, TEXT, NUMERIC, UUID, TEXT) TO authenticated;
