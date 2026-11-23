import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPendingPurchaseReceipt,
} from "@/lib/purchaseOrderReceiptOutbox";
import {
  retryPendingPurchaseReceipt,
  submitPurchaseReceipt,
  type SendReceiptOnce,
} from "@/lib/purchaseOrderReceiptTransport";

const base = {
  organization_id: "transport-tenant",
  actor_id: "transport-actor",
  order_id: "transport-order",
  items: [{ product_id: "transport-product", quantity: 2 }],
  notes: null,
};
let count = 0;

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("makitiplus-po-receipt-outbox");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB reset error"));
    request.onblocked = () => reject(new Error("IndexedDB remained opened"));
  });
  count = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `00000000-0000-4000-8000-${String(++count).padStart(12, "0")}`,
  });
});

describe("Inactive receipt transport contract", () => {
  it("keeps UUID and payload when the server response is lost, then retries without a second UUID", async () => {
    const attempted = vi.fn<SendReceiptOnce>()
      .mockRejectedValueOnce(new Error("Network lost after server commit"))
      .mockResolvedValueOnce({ committed: true });
    await expect(submitPurchaseReceipt(base, attempted)).rejects.toThrow("Network lost");
    const pending = await loadPendingPurchaseReceipt(base.organization_id, base.actor_id, base.order_id);
    expect(pending).toBeDefined();
    expect(count).toBe(1);
    await expect(retryPendingPurchaseReceipt(base, attempted)).resolves.toBe(true);
    expect(attempted).toHaveBeenCalledTimes(2);
    expect(attempted.mock.calls[0][0]).toEqual(attempted.mock.calls[1][0]);
    expect(attempted.mock.calls[0][0].p_receipt_id).toBe(pending?.receipt_id);
    expect(await loadPendingPurchaseReceipt(base.organization_id, base.actor_id, base.order_id)).toBeUndefined();
    expect(count).toBe(1);
  });

  it("does not acknowledge an unknown or explicitly uncommitted response", async () => {
    const sender = vi.fn<SendReceiptOnce>().mockResolvedValue({ committed: false });
    await expect(submitPurchaseReceipt(base, sender)).rejects.toThrow("non confirmée");
    const pending = await loadPendingPurchaseReceipt(base.organization_id, base.actor_id, base.order_id);
    expect(pending).toBeDefined();
    expect(count).toBe(1);
    await expect(retryPendingPurchaseReceipt(base, async () => ({ committed: true }))).resolves.toBe(true);
    expect(await loadPendingPurchaseReceipt(base.organization_id, base.actor_id, base.order_id)).toBeUndefined();
  });

  it("prevents a different payload from replacing an uncertain pending receipt", async () => {
    await expect(submitPurchaseReceipt(base, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    await expect(submitPurchaseReceipt({
      ...base, items: [{ product_id: "transport-product", quantity: 3 }],
    }, async () => ({ committed: true }))).rejects.toThrow("Réception en attente différente");
    expect((await loadPendingPurchaseReceipt(base.organization_id, base.actor_id, base.order_id))?.items)
      .toEqual(base.items);
  });

  it("does not call the sender when there is no pending receipt", async () => {
    const sender = vi.fn<SendReceiptOnce>();
    await expect(retryPendingPurchaseReceipt(base, sender)).resolves.toBe(false);
    expect(sender).not.toHaveBeenCalled();
  });
});
