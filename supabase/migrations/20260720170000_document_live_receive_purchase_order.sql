-- ════════════════════════════════════════════════════════════════
-- Documente la version RÉELLEMENT déployée de receive_purchase_order
-- Date: 2026-07-20
--
-- Cette fonction a été trouvée déployée sur Supabase avec une signature
-- (p_order_id, p_received_items, p_notes) totalement différente de celle
-- du dépôt (p_order_id, p_items — définie dans
-- 20260702130001_purchase_orders.sql / 20260703010000_p0_hotfix_migrations.sql,
-- qui attend une clé "quantity_received" au lieu de "quantity").
-- Aucun fichier de migration ne documentait cette version live — un
-- `supabase db reset` aurait recréé l'ancienne version incompatible.
--
-- src/components/purchase-orders/ReceiveOrderForm.tsx appelait la RPC
-- avec p_items (mauvais nom) et des objets {id, quantity_received} au
-- lieu de {product_id, quantity} — la réception de commande fournisseur
-- échouait donc systématiquement en production. Corrigé côté frontend
-- dans le même commit que cette migration.
--
-- Ce script se contente de RÉAFFIRMER la version live telle quelle
-- (récupérée via pg_get_functiondef sur le projet), pour que le code
-- du dépôt corresponde enfin à la réalité déployée. Aucun comportement
-- changé, aucune donnée modifiée.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_order_id UUID,
  p_received_items JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_item JSONB;
  v_new_stock INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM purchase_orders WHERE id = p_order_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  UPDATE purchase_orders
  SET status = 'received', notes = COALESCE(p_notes, notes), updated_at = NOW()
  WHERE id = p_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_received_items)
  LOOP
    UPDATE products
    SET stock_quantity = stock_quantity + (v_item->>'quantity')::INTEGER, updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID AND organization_id = v_org_id
    RETURNING stock_quantity INTO v_new_stock;

    INSERT INTO stock_movements (
      product_id, type, quantity, previous_quantity, new_quantity, reason, user_id, organization_id
    )
    VALUES (
      (v_item->>'product_id')::UUID,
      'restock',
      (v_item->>'quantity')::INTEGER,
      v_new_stock - (v_item->>'quantity')::INTEGER,
      v_new_stock,
      'Réception commande ' || (SELECT order_number FROM purchase_orders WHERE id = p_order_id),
      auth.uid(),
      v_org_id
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order(UUID, JSONB, TEXT) TO authenticated;
