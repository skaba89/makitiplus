/**
 * Explicit Supabase adapter for the proposed idempotent supplier receipt RPC.
 *
 * Deliberately not bound to ReceiveOrderForm while the server migration and
 * old-PWA cutover are pending. Never retry via receive_purchase_order.
 */
import { getSupabaseClient } from "@/integrations/supabase/client";
import type { SendReceiptOnce } from "./purchaseOrderReceiptTransport";

export type ReceiptOnceArguments = Parameters<SendReceiptOnce>[0];
export type ReceiptRpcResult = {
  error: { message: string; code?: string } | null;
};
export type ReceiptRpcClient = {
  rpc(name: "receive_purchase_order_once", args: ReceiptOnceArguments): PromiseLike<ReceiptRpcResult>;
};

/**
 * Do not infer successful commits from a network response that contains an
 * error, or from an undefined response. The caller must preserve its outbox.
 */
export function makeReceiptOnceSender(client: ReceiptRpcClient): SendReceiptOnce {
  return async (request) => {
    const result = await client.rpc("receive_purchase_order_once", {
      p_order_id: request.p_order_id,
      p_received_items: request.p_received_items.map(item => ({ ...item })),
      p_receipt_id: request.p_receipt_id,
      p_notes: request.p_notes,
    });
    if (!result || result.error) {
      throw new Error(result?.error?.message ?? "Réception sans réponse serveur confirmée");
    }
    return { committed: true };
  };
}

/**
 * This adapter is intentionally inactive. After the new database RPC is
 * deployed and confirmed, use it only through the existing IndexedDB outbox
 * orchestration (submitPurchaseReceipt / retryPendingPurchaseReceipt).
 *
 * Supabase generated types will be regenerated during the server cutover.
 * Until then, this narrow shape represents the reviewed future RPC contract.
 */
export function createSupabaseReceiptOnceSender(): SendReceiptOnce {
  const client = getSupabaseClient() as unknown as ReceiptRpcClient;
  return makeReceiptOnceSender(client);
}
