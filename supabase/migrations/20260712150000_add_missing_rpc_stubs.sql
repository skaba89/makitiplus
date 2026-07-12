-- ============================================================
-- Migration : stubs pour RPCs manquants (WhatsApp + generate_sale_number)
-- Date: 2026-07-12
-- ============================================================
-- Objectif:
--   L'audit E2E a révélé 6 RPCs appelés par le frontend mais
--   non définis en DB. Cette migration crée des stubs pour :
--   - generate_sale_number : accorder à authenticated (était service_role only)
--   - get_whatsapp_config / save_whatsapp_config / get_whatsapp_stats
--   - get_stripe_customer / get_payment_history
--
--   Ces stubs retournent des valeurs nulles/vides pour que le frontend
--   ne crash pas. Quand les features seront réellement déployées,
--   les fonctions réelles remplaceront ces stubs.
--
-- Sécurité:
--   - SECURITY DEFINER + search_path = public pour les fonctions qui
--     touchent aux données
--   - GRANT EXECUTE TO authenticated
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. generate_sale_number — accorder à authenticated
-- (existait déjà mais seulement grant à service_role, ce qui causait
--  une erreur côté frontend. Le frontend a un fallback mais c'est
--  mieux d'avoir le vrai format serveur.)
-- ════════════════════════════════════════════════════════════════
-- Recréer la fonction avec grant à authenticated
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_year TEXT;
  v_count INTEGER;
  v_sale_number TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.sales
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

  v_sale_number := 'VTE-' || v_year || '-' || LPAD(v_count::TEXT, 6, '0');
  RETURN v_sale_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_sale_number() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 2. WhatsApp stubs (feature non déployée — retourne null/zéros)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_whatsapp_config()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Feature non déployée — retourne null pour que le frontend affiche
  -- "WhatsApp non configuré" au lieu de crasher.
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_config() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_whatsapp_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Feature non déployée — retourne des zéros
  RETURN jsonb_build_object(
    'total_sent', 0,
    'total_delivered', 0,
    'total_failed', 0,
    'today_sent', 0,
    'receipts', 0,
    'custom', 0,
    'is_configured', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_whatsapp_config(
  p_phone_number_id TEXT DEFAULT NULL,
  p_business_account_id TEXT DEFAULT NULL,
  p_access_token TEXT DEFAULT NULL,
  p_whatsapp_phone TEXT DEFAULT NULL,
  p_auto_send_receipt BOOLEAN DEFAULT false,
  p_auto_send_message TEXT DEFAULT NULL,
  p_template_language TEXT DEFAULT 'fr',
  p_template_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Feature non déployée — retourne false pour indiquer que la config
  -- n'a pas été sauvegardée. Le frontend affichera un message d'erreur
  -- propre au lieu de crasher.
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_whatsapp_config(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT
) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. Stripe stubs (feature non déployée en Afrique — paiement mobile money)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_stripe_customer()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Stripe non configuré — retourne null
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stripe_customer() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_history(p_limit INTEGER DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Stripe non configuré — retourne un tableau vide
  RETURN '[]'::JSONB;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_history(INTEGER) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- Done — tous les RPCs appelés par le frontend existent maintenant en DB
-- ════════════════════════════════════════════════════════════════
