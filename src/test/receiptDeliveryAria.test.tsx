/**
 * E2E : accessibilité — aria-live sur l'indicateur de sélection,
 * aria-label sur les dialogs de confirmation, role="status" présent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, setSender,
} from "@/lib/receiptDeliveryQueue";
import type { ReceiptData } from "@/utils/receiptGenerator";

const sample = (n: string): ReceiptData => ({
  saleNumber: n,
  date: new Date("2026-05-04T10:00:00Z"),
  items: [{ product_name: "Riz 1kg", quantity: 2, unit_price: 500, total_price: 1000 }],
  subtotal: 1000, total: 1000, paymentMethod: "cash",
  amountPaid: 1000, change: 0, businessName: "Boutique",
});

const setOnline = (v: boolean) => {
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
};

describe("Accessibilité (ARIA) — indicateur sélection + dialogs", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("l'indicateur de sélection expose role=status, aria-live=polite et un aria-label descriptif", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260504-A001"));
    enqueueOrSendReceipt("sms",      "+22461100002", sample("VNT-260504-A002"));

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    const indicator = await screen.findByTestId("rt-selected-count");
    expect(indicator).toHaveAttribute("role", "status");
    expect(indicator).toHaveAttribute("aria-live", "polite");
    expect(indicator).toHaveAttribute("aria-atomic", "true");
    // aria-label inclut le total de tickets filtrés
    expect(indicator.getAttribute("aria-label")).toMatch(/2/);
  });

  it("les dialogs de confirmation exposent un aria-label descriptif", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260504-A010"));

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    fireEvent.click(await screen.findByLabelText("select-VNT-260504-A010"));
    fireEvent.click(screen.getByTestId("rt-bulk-remove"));

    const removeDialog = await screen.findByTestId("rt-confirm-remove");
    expect(removeDialog).toHaveAttribute("aria-label");
    expect(removeDialog.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(5);

    // Annule pour ouvrir l'autre dialog
    fireEvent.click(screen.getByTestId("rt-confirm-remove-cancel"));

    fireEvent.click(screen.getByTestId("rt-archive-dup"));
    const archiveDialog = await screen.findByTestId("rt-confirm-archive");
    expect(archiveDialog).toHaveAttribute("aria-label");
    expect(archiveDialog.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(5);
  });

  it("la zone de bulk actions expose role=region avec un aria-label", async () => {
    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);
    const region = await screen.findByRole("region", { name: /actions/i });
    expect(region).toBeInTheDocument();
  });
});
