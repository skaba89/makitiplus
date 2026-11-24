import { describe, expect, it } from "vitest";
import { isPoReceiptOnceEnabled } from "@/lib/purchaseOrderReceiptFeatureGate";

describe("Supplier receipt cutover requires explicit deployment approval", () => {
  it("defaults to disabled without environment approvals", () => {
    expect(isPoReceiptOnceEnabled({})).toBe(false);
  });

  it("refuses rollout when only one approval is provided", () => {
    expect(isPoReceiptOnceEnabled({ VITE_PO_RECEIPT_ONCE_ENABLED: "true" })).toBe(false);
    expect(isPoReceiptOnceEnabled({ VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED: "true" })).toBe(false);
  });

  it("requires exactly two literal true values", () => {
    expect(isPoReceiptOnceEnabled({
      VITE_PO_RECEIPT_ONCE_ENABLED: "true",
      VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED: "true",
    })).toBe(true);
    for (const unsafe of ["false", "TRUE", "1", ""]) {
      expect(isPoReceiptOnceEnabled({
        VITE_PO_RECEIPT_ONCE_ENABLED: unsafe,
        VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED: "true",
      })).toBe(false);
    }
  });
});
