/**
 * E2E : export CSV/PDF des tickets sélectionnés.
 * Vérifie que les colonnes (client_uuid, created_at, attempts,
 * last_error, next_retry_at) et les valeurs correspondent aux données locales.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, getQueue, setSender, retryOne,
} from "@/lib/receiptDeliveryQueue";
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

describe("Export sélection — CSV / PDF", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("CSV contient client_uuid, created_at, attempts, last_error, next_retry_at corrects", async () => {
    // 1 ticket pending + 1 ticket avec erreur (pour avoir last_error/next_retry_at)
    enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260504-E001"));
    enqueueOrSendReceipt("sms",      "+22461100002", sample("VNT-260504-E002"));
    // Force une erreur sur E002
    setSender(() => { throw new Error("network_down_test"); });
    const e2 = getQueue().find((q) => q.saleNumber === "VNT-260504-E002")!;
    setOnline(true);
    retryOne(e2.client_uuid, { force: true });
    setOnline(false);
    setSender(null);

    const queueSnap = getQueue();
    const e1 = queueSnap.find((q) => q.saleNumber === "VNT-260504-E001")!;
    const e2b = queueSnap.find((q) => q.saleNumber === "VNT-260504-E002")!;
    expect(e2b.last_error).toBe("network_down_test");
    expect(e2b.next_retry_at).toBeTruthy();

    // Intercepte le Blob généré par l'export
    let captured = "";
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      // jsdom : on lit le contenu via FileReader synchroniquement impossible
      // → on utilise blob.text() côté assertions
      (URL.createObjectURL as any)._lastBlob = blob;
      return "blob:mock";
    }) as any;
    URL.revokeObjectURL = vi.fn();
    // Désactive le click réel sur <a>
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { /* no-op */ };

    try {
      render(<ReceiptDeliveryTrackingPanel />);
      fireEvent.click(await screen.findByLabelText("select-VNT-260504-E001"));
      fireEvent.click(screen.getByLabelText("select-VNT-260504-E002"));

      fireEvent.click(screen.getByTestId("rt-export-selected-csv"));

      await waitFor(() => {
        expect((URL.createObjectURL as any)._lastBlob).toBeTruthy();
      });
      const blob: Blob = (URL.createObjectURL as any)._lastBlob;
      captured = await blob.text();
    } finally {
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }

    // Header contient bien la colonne client_uuid
    const [headerLine, ...rows] = captured.replace(/^\uFEFF/, "").split("\n");
    expect(headerLine).toContain("client_uuid");
    expect(headerLine).toContain("saleNumber");

    // Chaque ligne contient le client_uuid et created_at correspondants
    const joined = rows.join("\n");
    expect(joined).toContain(e1.client_uuid);
    expect(joined).toContain(e1.created_at);
    expect(joined).toContain(e2b.client_uuid);
    expect(joined).toContain(e2b.created_at);
    expect(joined).toContain(e2b.next_retry_at!);
    expect(joined).toContain("network_down_test");
    // attempts colonne présente (au moins "1")
    expect(joined).toMatch(/;1;/);
  });

  it("PDF — déclenche bien jsPDF.save avec un nom horodaté", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100010", sample("VNT-260504-P001"));
    const jsPDFmod: any = await import("jspdf");
    const saveSpy = vi.spyOn(jsPDFmod.default.prototype as any, "save");

    render(<ReceiptDeliveryTrackingPanel />);
    fireEvent.click(await screen.findByLabelText("select-VNT-260504-P001"));
    fireEvent.click(screen.getByTestId("rt-export-selected-pdf"));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
      const arg = saveSpy.mock.calls[0][0];
      expect(arg).toMatch(/^tickets_selection_\d{4}-\d{2}-\d{2}_\d{4}\.pdf$/);
    });
    saveSpy.mockRestore();
  });
});
