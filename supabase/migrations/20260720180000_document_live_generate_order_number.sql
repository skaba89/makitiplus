-- ════════════════════════════════════════════════════════════════
-- Documente la version RÉELLEMENT déployée de generate_order_number
-- Date: 2026-07-20
--
-- Comme receive_purchase_order (20260720170000), cette fonction est
-- déployée sur Supabase avec une signature différente de celle du
-- dépôt (20260702130001_purchase_orders.sql : generate_order_number(p_org_id UUID)).
-- La version live ne prend qu'un p_prefix optionnel et détermine
-- l'organisation elle-même via get_user_organization_id().
--
-- src/pages/PurchaseOrders.tsx appelait la RPC avec { p_org_id: ... },
-- un paramètre que la fonction live n'accepte pas — la génération du
-- numéro de commande échouait donc à chaque création de commande
-- fournisseur. Corrigé côté frontend dans le même commit.
--
-- Réaffirme la version live telle quelle (récupérée via
-- pg_get_functiondef, lecture seule). Aucun comportement changé.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_order_number(
  p_prefix TEXT DEFAULT 'CMD'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num BIGINT;
  org_id UUID;
BEGIN
  org_id := public.get_user_organization_id();
  IF org_id IS NOT NULL THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+$') AS BIGINT)), 0) + 1
      INTO next_num FROM public.purchase_orders WHERE organization_id = org_id;
  ELSE
    next_num := 1;
  END IF;
  RETURN p_prefix || '-' || LPAD(next_num::TEXT, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_order_number(TEXT) TO authenticated;
