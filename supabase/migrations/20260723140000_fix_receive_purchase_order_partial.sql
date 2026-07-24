-- ════════════════════════════════════════════════════════════════
-- Fix: receive_purchase_order — réception partielle non persistée
-- Date: 2026-07-23 — P3 (gap-closing)
--
-- Bugs (vérifiés via pg_get_functiondef sur la version live) :
-- 1. status = 'received' est posé INCONDITIONNELLEMENT, même quand les
--    quantités reçues sont inférieures aux quantités commandées. L'UI de
--    ReceiveOrderForm.tsx autorise explicitement une quantité reçue
--    partielle par ligne (Input avec max={quantity_ordered}), et le
--    statut "partial" existe dans le type PurchaseOrders.tsx mais n'est
--    jamais écrit par cette fonction.
-- 2. purchase_order_items.quantity_received n'est JAMAIS mis à jour —
--    seuls products.stock_quantity et stock_movements le sont. Rouvrir
--    le formulaire de réception affiche donc toujours la quantité
--    COMMANDÉE comme pré-remplie (quantity_received: item.quantity_received
--    || item.quantity_ordered retombe systématiquement sur quantity_ordered
--    puisque la colonne réelle n'est jamais renseignée) — aucune trace
--    fiable de ce qui a été réellement livré vs en attente.
--
-- Fix : persister purchase_order_items.quantity_received par ligne
-- (cumulatif — une commande peut être reçue en plusieurs fois), et ne
-- marquer 'received' que si TOUTES les lignes ont reçu au moins la
-- quantité commandée ; sinon 'partial'. Logique de décrément de stock et
-- d'écriture stock_movements strictement inchangée.
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
  v_all_received BOOLEAN;
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_received_items)
  LOOP
    UPDATE products
    SET stock_quantity = stock_quantity + (v_item->>'quantity')::INTEGER, updated_at = NOW()
    WHERE id = (v_item->>'product_id')::UUID AND organization_id = v_org_id
    RETURNING stock_quantity INTO v_new_stock;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

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

    -- Cumule la quantité reçue par ligne (une commande peut être reçue en
    -- plusieurs passages) — bornée à quantity_ordered pour ne jamais
    -- afficher plus que ce qui a été commandé même en cas de sur-saisie.
    UPDATE purchase_order_items
    SET quantity_received = LEAST(
      quantity_ordered,
      COALESCE(quantity_received, 0) + (v_item->>'quantity')::INTEGER
    )
    WHERE purchase_order_id = p_order_id
      AND product_id = (v_item->>'product_id')::UUID;
  END LOOP;

  -- Statut : 'received' seulement si toutes les lignes sont entièrement
  -- reçues, sinon 'partial'.
  SELECT NOT EXISTS (
    SELECT 1 FROM purchase_order_items
    WHERE purchase_order_id = p_order_id
      AND COALESCE(quantity_received, 0) < quantity_ordered
  ) INTO v_all_received;

  UPDATE purchase_orders
  SET status = (CASE WHEN v_all_received THEN 'received' ELSE 'partial' END)::po_status,
      notes = COALESCE(p_notes, notes),
      updated_at = NOW()
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order(UUID, JSONB, TEXT) TO authenticated;
