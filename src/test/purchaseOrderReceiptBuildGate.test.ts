import { describe, expect, it } from "vitest";
import { evaluateReceiptCutoverBuildGate } from "../../scripts/check-po-receipt-build-gate.mjs";

const v = {
  VITE_PO_RECEIPT_ONCE_ENABLED: "true",
  VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED: "true",
};
const trusted = {
  PO_RECEIPT_SERVER_CUTOVER_VERIFIED: "true",
  PO_RECEIPT_LEGACY_PWA_COMPAT_VERIFIED: "true",
};

describe("Receipt cutover build gate", () => {
  it("keeps every ordinary build allowed when new receipt flags are absent", () => {
    expect(evaluateReceiptCutoverBuildGate({}, {}).allowed).toBe(true);
    expect(evaluateReceiptCutoverBuildGate({
      VITE_PO_RECEIPT_ONCE_ENABLED: "false",
      VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED: "false",
    }, {}).allowed).toBe(true);
  });

  it("refuses one-sided cutover even if release attestations are provided", () => {
    expect(evaluateReceiptCutoverBuildGate({
      VITE_PO_RECEIPT_ONCE_ENABLED: "true",
    }, trusted).allowed).toBe(false);
    expect(evaluateReceiptCutoverBuildGate({
      VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED: "true",
    }, trusted).allowed).toBe(false);
  });

  it("blocks unsafe opt-in builds until both independent server and legacy-PWA checks are attested", () => {
    expect(evaluateReceiptCutoverBuildGate(v, {}).allowed).toBe(false);
    expect(evaluateReceiptCutoverBuildGate(v, {
      PO_RECEIPT_SERVER_CUTOVER_VERIFIED: "true",
    }).allowed).toBe(false);
    expect(evaluateReceiptCutoverBuildGate(v, {
      PO_RECEIPT_LEGACY_PWA_COMPAT_VERIFIED: "true",
    }).allowed).toBe(false);
    expect(evaluateReceiptCutoverBuildGate(v, trusted).allowed).toBe(true);
  });

  it("requires exact literal true, rejecting loose environment values", () => {
    for (const wrong of ["TRUE", "1", "yes", "", "false"]) {
      expect(evaluateReceiptCutoverBuildGate(v, {
        ...trusted,
        PO_RECEIPT_SERVER_CUTOVER_VERIFIED: wrong,
      }).allowed).toBe(false);
      expect(evaluateReceiptCutoverBuildGate(v, {
        ...trusted,
        PO_RECEIPT_LEGACY_PWA_COMPAT_VERIFIED: wrong,
      }).allowed).toBe(false);
    }
  });
});
