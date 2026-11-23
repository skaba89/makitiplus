/**
 * Transport-independent receipt orchestration, deliberately NOT wired to the
 * live form or deployed RPC. Never fall back to the non-idempotent legacy RPC.
 */
import {
  acknowledgePurchaseReceipt,
  loadPendingPurchaseReceipt,
  preparePurchaseReceipt,
  type PendingPurchaseReceipt,
  type PurchaseReceiptLine,
} from "./purchaseOrderReceiptOutbox";

export type ReceiptCommitResponse = { committed: true } | { committed: false };

export type SendReceiptOnce = (request: Readonly<{
  p_order_id: string;
  p_received_items: ReadonlyArray<PurchaseReceiptLine>;
  p_receipt_id: string;
  p_notes: string | null;
}>) => Promise<ReceiptCommitResponse>;

export interface ReceiptIdentity {
  organization_id: string;
  actor_id: string;
  order_id: string;
}

/**
 * Requires an injected transport explicitly bound to receive_purchase_order_once.
 * Callers MUST NOT inject legacy receive_purchase_order; it cannot deduplicate.
 */
export async function deliverPendingPurchaseReceipt(
  receipt: PendingPurchaseReceipt,
  sendOnce: SendReceiptOnce,
): Promise<void> {
  const response = await sendOnce({
    p_order_id: receipt.order_id,
    p_received_items: receipt.items.map(item => ({ ...item })),
    p_receipt_id: receipt.receipt_id,
    p_notes: receipt.notes,
  });
  if (response?.committed !== true) {
    throw new Error("Réception non confirmée par le serveur : conservation pour rejeu");
  }
  // Only a confirmed commit or identical receipt replay permits removing the
  // IndexedDB entry. A rejected/unknown response leaves the original UUID.
  await acknowledgePurchaseReceipt(receipt);
}

/**
 * Existing pending operations cannot be overwritten with new line quantities.
 * Even on a recoverable network failure, IndexedDB preserves the request.
 */
export async function submitPurchaseReceipt(
  input: ReceiptIdentity & { items: PurchaseReceiptLine[]; notes?: string | null },
  sendOnce: SendReceiptOnce,
): Promise<void> {
  const receipt = await preparePurchaseReceipt(input);
  await deliverPendingPurchaseReceipt(receipt, sendOnce);
}

/** Recover and resend an unchanged saved request after reconnect/restart. */
export async function retryPendingPurchaseReceipt(
  identity: ReceiptIdentity,
  sendOnce: SendReceiptOnce,
): Promise<boolean> {
  const pending = await loadPendingPurchaseReceipt(
    identity.organization_id, identity.actor_id, identity.order_id,
  );
  if (!pending) return false;
  await deliverPendingPurchaseReceipt(pending, sendOnce);
  return true;
}
