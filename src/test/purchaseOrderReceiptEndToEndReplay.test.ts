import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPendingPurchaseReceipt } from "@/lib/purchaseOrderReceiptOutbox";
import { retryPendingPurchaseReceipt, submitPurchaseReceipt } from "@/lib/purchaseOrderReceiptTransport";
import {
  makeReceiptOnceSender,
  type ReceiptRpcClient,
} from "@/lib/purchaseOrderReceiptSupabaseAdapter";

const receipt = {
  organization_id: "tenant-integration",
  actor_id: "manager-integration",
  order_id: "po-integration",
  items: [{ product_id: "sku-b", quantity: 1 }, { product_id: "sku-a", quantity: 2 }],
  notes: "Reçu quai 2",
};
let uuidCounter = 0;
const pending = () => loadPendingPurchaseReceipt(
  receipt.organization_id, receipt.actor_id, receipt.order_id,
);
beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase("makitiplus-po-receipt-outbox");
    deletion.onsuccess = () => resolve();
    deletion.onerror = () => reject(deletion.error ?? new Error("IndexedDB cleanup failed"));
    deletion.onblocked = () => reject(new Error("IndexedDB connection leaked between tests"));
  });
  uuidCounter = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
  });
});

describe("Receipt outbox → Supabase adapter (inactive until server rollout)", () => {
  it("keeps the identical UUID after server commit but lost response, then acknowledges an exact replay", async () => {
    const serverCommitted = new Map<string, string>();
    let stock = 0;
    let responseLost = true;
    const rpc = vi.fn<ReceiptRpcClient["rpc"]>().mockImplementation(async (name, args) => {
      expect(name).toBe("receive_purchase_order_once");
      const payload = JSON.stringify({
        order: args.p_order_id, items: args.p_received_items, notes: args.p_notes,
      });
      const prior = serverCommitted.get(args.p_receipt_id);
      if (prior && prior !== payload) return { error: { code: "23505", message: "UUID replay conflict" } };
      if (!prior) {
        serverCommitted.set(args.p_receipt_id, payload);
        stock += args.p_received_items.reduce((sum, line) => sum + line.quantity, 0);
      }
      if (responseLost) { responseLost = false; throw new Error("Connection closed after COMMIT"); }
      return { error: null };
    });
    const sender = makeReceiptOnceSender({ rpc });
    await expect(submitPurchaseReceipt(receipt, sender)).rejects.toThrow("Connection closed");
    expect(stock).toBe(3);
    const stored = await pending();
    expect(stored?.receipt_id).toBe("00000000-0000-4000-8000-000000000001");
    expect(stored?.items).toEqual([{ product_id: "sku-a", quantity: 2 }, { product_id: "sku-b", quantity: 1 }]);

    await expect(retryPendingPurchaseReceipt(receipt, sender)).resolves.toBe(true);
    expect(stock).toBe(3);
    expect(serverCommitted.size).toBe(1);
    expect(uuidCounter).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]);
    expect(await pending()).toBeUndefined();
  });

  it("does not send a modified payload while an uncertain receipt remains pending", async () => {
    const rpc = vi.fn<ReceiptRpcClient["rpc"]>().mockRejectedValue(new Error("offline"));
    const sender = makeReceiptOnceSender({ rpc });
    await expect(submitPurchaseReceipt(receipt, sender)).rejects.toThrow("offline");
    await expect(submitPurchaseReceipt({
      ...receipt, items: [{ product_id: "sku-a", quantity: 3 }],
    }, sender)).rejects.toThrow("Réception en attente différente");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(uuidCounter).toBe(1);
    expect(await pending()).toBeDefined();
  });

  it("keeps a failed SQL request in IndexedDB without invoking the legacy RPC", async () => {
    const rpc = vi.fn<ReceiptRpcClient["rpc"]>().mockResolvedValue({
      error: { code: "42501", message: "Accès refusé à la réception" },
    });
    await expect(submitPurchaseReceipt(receipt, makeReceiptOnceSender({ rpc })))
      .rejects.toThrow("Accès refusé");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("receive_purchase_order_once");
    expect((await pending())?.receipt_id).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("recovers after a missing server response, even if input item order changes", async () => {
    const rpc = vi.fn<ReceiptRpcClient["rpc"]>()
      .mockResolvedValueOnce(undefined as never)
      .mockResolvedValueOnce({ error: null });
    const sender = makeReceiptOnceSender({ rpc });
    await expect(submitPurchaseReceipt(receipt, sender)).rejects.toThrow("sans réponse");
    await expect(submitPurchaseReceipt({
      ...receipt, items: [...receipt.items].reverse(),
    }, sender)).resolves.toBeUndefined();
    expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]);
    expect(uuidCounter).toBe(1);
    expect(await pending()).toBeUndefined();
  });
});
