/**
 * Receipt RPC expects incremental quantities, not already-received totals.
 * Never interpret the persisted quantity_received as a fresh receipt amount.
 */
export interface ReceiptLine {
  product_id: string | null;
  quantity_ordered: number;
  quantity_received: number;
}

export function remainingToReceive(line: ReceiptLine): number {
  return Math.max(0, line.quantity_ordered - line.quantity_received);
}

export function buildReceiptPayload<T extends ReceiptLine & { quantity_to_receive: number }>(
  lines: T[],
): Array<{ product_id: string; quantity: number }> {
  const payload: Array<{ product_id: string; quantity: number }> = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const quantity = line.quantity_to_receive;
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > remainingToReceive(line)) {
      throw new Error("Quantité à recevoir invalide");
    }
    if (quantity === 0) continue;
    if (!line.product_id) throw new Error("Produit manquant pour la réception");
    if (seen.has(line.product_id)) {
      throw new Error("Produit dupliqué dans les lignes de réception");
    }
    seen.add(line.product_id);
    payload.push({ product_id: line.product_id, quantity });
  }
  if (payload.length === 0) throw new Error("Aucune quantité à réceptionner");
  return payload;
}
