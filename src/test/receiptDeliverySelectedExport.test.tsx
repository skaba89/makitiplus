/**
 * E2E : export CSV/PDF des tickets sélectionnés.
 * Vérifie que les colonnes (client_uuid, created_at, attempts,
 * last_error, next_retry_at) et les valeurs correspondent aux données locales.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock partiel : seul exportSelectedHistoryPDF est mocké (jsPDF instable en jsdom).
// exportSelectedHistoryCSV reste la vraie implémentation → assertions sur le contenu.
vi.mock("@/lib/receiptDeliverySelectedExport", async () => {
  const actual = await vi.importActual<typeof import("@/lib/receiptDeliverySelectedExport")>(
    "@/lib/receiptDeliverySelectedExport",
  );
  return {
    ...actual,
    exportSelectedHistoryPDF: vi.fn(),
  };
});

import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, getQueue, setSender, retryOne,
} from "@/lib/receiptDeliveryQueue";
import { exportSelectedHistoryPDF } from "@/lib/receiptDeliverySelectedExport";
import type { ReceiptData } from "@/utils/receiptGenerator";

const sample = (n: string): ReceiptData => ({
  saleNumber: n,
  date: new Date("2026-05-04T10:00:00Z"),
  items: [{ product_name: "Riz", quantity: 1, unit_price: 500, total_price: 500 }],
  subtotal: 500, total: 500, paymentMethod: "cash",
  amountPaid: 500, change: 0, businessName: "B",
});

const setOnline = (v: boolean) =>
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });

/** Patche Blob pour récupérer son contenu (jsdom n'expose pas blob.text fiablement). */
const installBlobCapture = () => {
  const OrigBlob: typeof Blob = (globalThis as any).Blob;
  const captured: { parts: any[]; type: string }[] = [];
  class CapturingBlob extends OrigBlob {
    __content: string;
    constructor(parts: any[] = [], opts: BlobPropertyBag = {}) {
      super(parts, opts);
      this.__content = (parts as any[])
        .map((p) => (typeof p === "string" ? p : ""))
        .join("");
      captured.push({ parts: parts as any[], type: opts.type ?? "" });
    }
  }
  (globalThis as any).Blob = CapturingBlob;
  return {
    captured,
    restore: () => { (globalThis as any).Blob = OrigBlob; },
    lastText: () => captured[captured.length - 1]?.parts
      .map((p) => (typeof p === "string" ? p : ""))
      .join("") ?? "",
  };
};

describe("Export sélection — CSV / PDF", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("CSV contient client_uuid, created_at, attempts, last_error, next_retry_at corrects", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260504-E001"));
    enqueueOrSendReceipt("sms",      "+22461100002", sample("VNT-260504-E002"));
    setSender(() => { throw new Error("network_down_test"); });
    const e2 = getQueue().find((q) => q.saleNumber === "VNT-260504-E002")!;
    setOnline(true);
    retryOne(e2.client_uuid, { force: true });
    setOnline(false);
    setSender(null);

    const e1 = getQueue().find((q) => q.saleNumber === "VNT-260504-E001")!;
    const e2b = getQueue().find((q) => q.saleNumber === "VNT-260504-E002")!;
    expect(e2b.last_error).toBe("network_down_test");
    expect(e2b.next_retry_at).toBeTruthy();

    const blobCap = installBlobCapture();
    (URL as any).createObjectURL = vi.fn(() => "blob:mock");
    (URL as any).revokeObjectURL = vi.fn();
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { /* no-op */ };

    try {
      render(<ReceiptDeliveryTrackingPanel />);
      fireEvent.click(await screen.findByLabelText("select-VNT-260504-E001"));
      fireEvent.click(screen.getByLabelText("select-VNT-260504-E002"));
      fireEvent.click(screen.getByTestId("rt-export-selected-csv"));

      await waitFor(() => expect(blobCap.captured.length).toBeGreaterThan(0));
      const csv = blobCap.lastText();

      const [headerLine, ...rows] = csv.replace(/^\uFEFF/, "").split("\n");
      expect(headerLine).toContain("client_uuid");
      expect(headerLine).toContain("saleNumber");

      const joined = rows.join("\n");
      expect(joined).toContain(e1.client_uuid);
      expect(joined).toContain(e1.created_at);
      expect(joined).toContain(e2b.client_uuid);
      expect(joined).toContain(e2b.created_at);
      expect(joined).toContain(e2b.next_retry_at!);
      expect(joined).toContain("network_down_test");
      expect(joined).toMatch(/;1;/); // colonne attempts = 1
    } finally {
      blobCap.restore();
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it("PDF — génère un Blob application/pdf pour la sélection", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100010", sample("VNT-260504-P001"));
    const p1 = getQueue().find((q) => q.saleNumber === "VNT-260504-P001")!;

    const blobCap = installBlobCapture();
    (URL as any).createObjectURL = vi.fn(() => "blob:mock");
    (URL as any).revokeObjectURL = vi.fn();
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { /* no-op */ };

    try {
      render(<ReceiptDeliveryTrackingPanel />);
      fireEvent.click(await screen.findByLabelText("select-VNT-260504-P001"));
      fireEvent.click(screen.getByTestId("rt-export-selected-pdf"));

      await waitFor(() => {
        expect(
          blobCap.captured.some((b) => b.type.includes("pdf")),
        ).toBe(true);
      });
      // Le PDF contient bien le client_uuid quelque part dans le flux brut
      const pdfBlob = blobCap.captured.find((b) => b.type.includes("pdf"))!;
      const raw = pdfBlob.parts
        .map((p) => {
          if (typeof p === "string") return p;
          if (p instanceof ArrayBuffer) return new TextDecoder().decode(p);
          if (ArrayBuffer.isView(p)) return new TextDecoder().decode(p as any);
          return "";
        })
        .join("");
      expect(raw).toContain(p1.client_uuid);
    } finally {
      blobCap.restore();
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
