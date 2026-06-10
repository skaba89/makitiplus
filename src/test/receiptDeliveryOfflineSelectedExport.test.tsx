/**
 * E2E offline-only : génère un CSV des tickets sélectionnés sans aucune
 * synchronisation (navigator.onLine=false, pas de sender), et vérifie que
 * les colonnes/valeurs correspondent EXACTEMENT aux données locales en file.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/receiptDeliverySelectedExport", async () => {
  const actual = await vi.importActual<typeof import("@/lib/receiptDeliverySelectedExport")>(
    "@/lib/receiptDeliverySelectedExport",
  );
  return { ...actual, exportSelectedHistoryPDF: vi.fn() };
});

import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, getQueue, setSender,
} from "@/lib/receiptDeliveryQueue";
import { exportSelectedHistoryPDF } from "@/lib/receiptDeliverySelectedExport";
import type { ReceiptData } from "@/utils/receiptGenerator";

const sample = (n: string): ReceiptData => ({
  saleNumber: n,
  date: new Date("2026-06-10T09:00:00Z"),
  items: [{ product_name: "Pain", quantity: 2, unit_price: 250, total_price: 500 }],
  subtotal: 500, total: 500, paymentMethod: "cash",
  amountPaid: 500, change: 0, businessName: "B",
});

const setOnline = (v: boolean) =>
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });

const captureBlobs = () => {
  const Orig: typeof Blob = (globalThis as any).Blob;
  const all: string[] = [];
  class Cap extends Orig {
    constructor(parts: any[] = [], opts: BlobPropertyBag = {}) {
      super(parts, opts);
      all.push((parts as any[]).map((p) => typeof p === "string" ? p : "").join(""));
    }
  }
  (globalThis as any).Blob = Cap;
  return { all, restore: () => { (globalThis as any).Blob = Orig; } };
};

describe("Export sélection — hors-ligne (sans sync)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);   // OFFLINE — aucune synchronisation possible
    setSender(null);    // Aucun sender installé → 100 % local
    (window as any).fetch = vi.fn(() => { throw new Error("network_disabled_in_test"); });
  });

  it("CSV hors-ligne : colonnes et valeurs == données locales en file", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100777", sample("VNT-260610-OFF1"));
    enqueueOrSendReceipt("sms",      "+22461100888", sample("VNT-260610-OFF2"));

    // Vérifie qu'aucune entrée n'a été envoyée (offline / no sender).
    const local = getQueue();
    expect(local.every((e) => e.status === "pending")).toBe(true);
    expect(local.every((e) => e.sent_at == null)).toBe(true);

    const cap = captureBlobs();
    (URL as any).createObjectURL = vi.fn(() => "blob:offline");
    (URL as any).revokeObjectURL = vi.fn();
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { /* no-op */ };

    try {
      render(<ReceiptDeliveryTrackingPanel />);
      // Statut visible "Hors ligne"
      expect(screen.getByTestId("rt-online-badge")).toHaveTextContent(/Hors|Offline/);

      fireEvent.click(await screen.findByLabelText("select-VNT-260610-OFF1"));
      fireEvent.click(screen.getByLabelText("select-VNT-260610-OFF2"));
      fireEvent.click(screen.getByTestId("rt-export-selected-csv"));

      await waitFor(() => expect(cap.all.length).toBeGreaterThan(0));
      const csv = cap.all[cap.all.length - 1].replace(/^\uFEFF/, "");
      const [header, ...rows] = csv.split("\n");

      // Colonnes attendues : présence stricte
      ["saleNumber", "client_uuid"].forEach((c) => expect(header).toContain(c));

      // Chaque ligne CSV contient EXACTEMENT les valeurs locales (uuid + created_at)
      local.forEach((e) => {
        const line = rows.find((r) => r.includes(e.client_uuid));
        expect(line, `row for ${e.saleNumber}`).toBeTruthy();
        expect(line).toContain(e.created_at);
        expect(line).toContain(e.saleNumber);
        expect(line).toContain(e.phone);
        // Pas de sent_at → colonne vide (deux ";;" consécutifs autour de sent_at)
        expect(line).not.toContain("2026-06-10T09:00:00.000Z"); // jamais "envoyé"
      });
    } finally {
      cap.restore();
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it("PDF hors-ligne : exportSelectedHistoryPDF reçoit les données locales sans sync", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100999", sample("VNT-260610-PDF1"));
    const local = getQueue();
    (exportSelectedHistoryPDF as any).mockClear?.();

    render(<ReceiptDeliveryTrackingPanel />);
    fireEvent.click(await screen.findByLabelText("select-VNT-260610-PDF1"));
    fireEvent.click(screen.getByTestId("rt-export-selected-pdf"));

    await waitFor(() => expect(exportSelectedHistoryPDF).toHaveBeenCalledTimes(1));
    const [rows] = (exportSelectedHistoryPDF as any).mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].client_uuid).toBe(local[0].client_uuid);
    expect(rows[0].created_at).toBe(local[0].created_at);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].sent_at).toBeFalsy();
  });
});
