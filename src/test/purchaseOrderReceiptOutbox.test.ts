import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgePurchaseReceipt, loadPendingPurchaseReceipt, preparePurchaseReceipt,
} from "@/lib/purchaseOrderReceiptOutbox";

const first = {
  organization_id: "tenant-a",
  actor_id: "actor-a",
  order_id: "order-a",
  items: [{ product_id: "product-a", quantity: 2 }],
  notes: null,
};
const second = { ...first, order_id: "order-b" };
let counter = 0;

beforeEach(async () => {
  // fake-indexeddb persists across tests in the same worker. Each case needs
  // a clean receipt outbox, otherwise previous pending UUIDs leak into it.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("makitiplus-po-receipt-outbox");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Reset IndexedDB impossible"));
    request.onblocked = () => reject(new Error("IndexedDB encore ouvert entre deux tests"));
  });
  counter = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}` });
});

describe("Durable supplier receipt outbox (not yet activated)", () => {
  it("persists exactly one immutable UUID and canonical payload for repeated retry", async () => {
    const submitted = await preparePurchaseReceipt(first);
    const retry = await preparePurchaseReceipt({ ...first, items: [...first.items].reverse() });
    expect(retry).toEqual(submitted);
    expect(counter).toBe(1);
    expect(await loadPendingPurchaseReceipt("tenant-a", "actor-a", "order-a")).toEqual(submitted);
  });

  it("rejects any changed amount or notes while a receipt is pending", async () => {
    const original = await preparePurchaseReceipt(first);
    await expect(preparePurchaseReceipt({ ...first, items: [{ product_id: "product-a", quantity: 3 }] }))
      .rejects.toThrow("Réception en attente différente");
    await expect(preparePurchaseReceipt({ ...first, notes: "new notes" }))
      .rejects.toThrow("Réception en attente différente");
    expect(await loadPendingPurchaseReceipt("tenant-a", "actor-a", "order-a")).toEqual(original);
    expect(counter).toBe(1);
  });

  it("isolates different actors and orders and never clears pending data on network failure", async () => {
    const a = await preparePurchaseReceipt(first);
    const b = await preparePurchaseReceipt(second);
    const c = await preparePurchaseReceipt({ ...first, actor_id: "actor-b" });
    expect(new Set([a.receipt_id, b.receipt_id, c.receipt_id]).size).toBe(3);
    expect(await loadPendingPurchaseReceipt("tenant-b", "actor-a", "order-a")).toBeUndefined();
    expect(await loadPendingPurchaseReceipt("tenant-a", "actor-a", "order-a")).toEqual(a);
  });

  it("acknowledges only the exact committed UUID; next business receipt gets a new UUID", async () => {
    const receipt = await preparePurchaseReceipt(first);
    await expect(acknowledgePurchaseReceipt({ ...receipt, receipt_id: "forged-uuid" }))
      .rejects.toThrow("Identifiant de réception différent");
    expect(await loadPendingPurchaseReceipt("tenant-a", "actor-a", "order-a")).toEqual(receipt);
    await acknowledgePurchaseReceipt(receipt);
    expect(await loadPendingPurchaseReceipt("tenant-a", "actor-a", "order-a")).toBeUndefined();
    const next = await preparePurchaseReceipt(first);
    expect(next.receipt_id).not.toBe(receipt.receipt_id);
  });

  it("serializes simultaneous same-order writes through IndexedDB to one durable UUID", async () => {
    const [a, b] = await Promise.all([
      preparePurchaseReceipt(first),
      preparePurchaseReceipt({ ...first, items: [...first.items] }),
    ]);
    expect(a).toEqual(b);
    expect(counter).toBe(1);
    expect(await loadPendingPurchaseReceipt("tenant-a", "actor-a", "order-a")).toEqual(a);
  });

  it("rejects concurrent conflicting drafts rather than replacing a pending receipt", async () => {
    const results = await Promise.allSettled([
      preparePurchaseReceipt(first),
      preparePurchaseReceipt({ ...first, items: [{ product_id: "product-a", quantity: 3 }] }),
    ]);
    const fulfilled = results.filter((x): x is PromiseFulfilledResult<Awaited<ReturnType<typeof preparePurchaseReceipt>>> => x.status === "fulfilled");
    const rejected = results.filter((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toContain("Réception en attente différente");
    expect(await loadPendingPurchaseReceipt("tenant-a", "actor-a", "order-a")).toEqual(fulfilled[0].value);
    expect(counter).toBe(1);
  });

  it("never acknowledges a changed payload even with a matching UUID", async () => {
    const original = await preparePurchaseReceipt(first);
    await expect(acknowledgePurchaseReceipt({
      ...original, items: [{ product_id: "product-a", quantity: 200 }],
    })).rejects.toThrow("Réception enregistrée modifiée");
    await expect(acknowledgePurchaseReceipt({
      ...original, organization_id: "tenant-b",
    })).rejects.toThrow("Réception enregistrée modifiée");
    expect(await loadPendingPurchaseReceipt("tenant-a", "actor-a", "order-a")).toEqual(original);
    await acknowledgePurchaseReceipt(original);
    expect(await loadPendingPurchaseReceipt("tenant-a", "actor-a", "order-a")).toBeUndefined();
  });

  it("rejects missing identity, empty, negative, fractional and duplicate product lines", async () => {
    await expect(preparePurchaseReceipt({ ...first, order_id: "" })).rejects.toThrow();
    for (const n of [0, -1, 0.5, Number.NaN]) {
      await expect(preparePurchaseReceipt({ ...first, items: [{ product_id: "product-a", quantity: n }] })).rejects.toThrow();
    }
    await expect(preparePurchaseReceipt({ ...first, items: [] })).rejects.toThrow();
    await expect(preparePurchaseReceipt({ ...first, items: [...first.items, ...first.items] })).rejects.toThrow();
  });

  it("normalizes item ordering without losing the committed receipt identity", async () => {
    const items = [{ product_id: "product-b", quantity: 1 }, { product_id: "product-a", quantity: 2 }];
    const stored = await preparePurchaseReceipt({ ...first, items });
    expect(stored.items.map(x => x.product_id)).toEqual(["product-a", "product-b"]);
    expect(await preparePurchaseReceipt({ ...first, items: [...items].reverse() })).toEqual(stored);
  });
});
