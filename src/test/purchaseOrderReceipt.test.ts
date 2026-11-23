import { describe, expect, it } from "vitest";
import { buildReceiptPayload, remainingToReceive } from "@/lib/purchaseOrderReceipt";

describe("Purchase order incremental receipt payload", () => {
  const line = (received: number, toReceive: number, ordered = 10) => ({
    product_id: "p-1",
    quantity_ordered: ordered,
    quantity_received: received,
    quantity_to_receive: toReceive,
  });

  it("starts from the remaining amount, not the cumulative received quantity", () => {
    expect(remainingToReceive(line(4, 6))).toBe(6);
    expect(buildReceiptPayload([line(4, 6)])).toEqual([{ product_id: "p-1", quantity: 6 }]);
  });

  it("allows partial increments and skips zero increments", () => {
    expect(buildReceiptPayload([line(4, 2), { ...line(0, 0), product_id: "p-2" }]))
      .toEqual([{ product_id: "p-1", quantity: 2 }]);
  });

  it("rejects over-receipt, negative, fractional, and empty requests", () => {
    for (const amount of [7, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildReceiptPayload([line(4, amount)])).toThrow();
    }
    expect(() => buildReceiptPayload([line(10, 1)])).toThrow();
    expect(() => buildReceiptPayload([line(10, 0)])).toThrow("Aucune quantité");
  });

  it("rejects missing or duplicate products", () => {
    expect(() => buildReceiptPayload([{ ...line(0, 1), product_id: null }])).toThrow("Produit manquant");
    expect(() => buildReceiptPayload([line(0, 1), line(0, 2)])).toThrow("dupliqué");
  });
});
