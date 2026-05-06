/**
 * E2E : confirmation dialogs — focus trap, Escape ferme, dismiss préserve la sélection.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, getQueue, setSender,
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

describe("Confirmation dialogs — accessibilité (focus, Escape, dismiss)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("Escape ferme le dialog 'Supprimer sélection' sans muter la file ni la sélection", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260504-K001"));
    enqueueOrSendReceipt("sms",      "+22461100002", sample("VNT-260504-K002"));
    expect(getQueue()).toHaveLength(2);

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    fireEvent.click(await screen.findByLabelText("select-VNT-260504-K001"));
    fireEvent.click(screen.getByLabelText("select-VNT-260504-K002"));
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");

    fireEvent.click(screen.getByTestId("rt-bulk-remove"));
    const dialog = await screen.findByTestId("rt-confirm-remove");
    expect(dialog).toBeInTheDocument();

    // Focus est piégé dans le dialog : le focus actif doit être à l'intérieur
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    // Escape ferme le dialog
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("rt-confirm-remove")).not.toBeInTheDocument();
    });

    // File et sélection inchangées
    expect(getQueue()).toHaveLength(2);
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");
  });

  it("Escape ferme le dialog 'Archiver doublons' sans rien archiver", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100010", sample("VNT-260504-K010"));
    enqueueOrSendReceipt("sms",      "+22461100011", sample("VNT-260504-K011"));
    const before = getQueue().map((q) => q.status).sort();

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    fireEvent.click(await screen.findByTestId("rt-archive-dup"));
    const dialog = await screen.findByTestId("rt-confirm-archive");
    expect(dialog).toBeInTheDocument();

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("rt-confirm-archive")).not.toBeInTheDocument();
    });

    expect(getQueue().map((q) => q.status).sort()).toEqual(before);
    expect(getQueue().filter((q) => q.status === "duplicate")).toHaveLength(0);
  });

  it("Dismiss via le bouton Annuler préserve la sélection (parité avec le test confirm-cancel existant)", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100020", sample("VNT-260504-K020"));
    enqueueOrSendReceipt("sms",      "+22461100021", sample("VNT-260504-K021"));

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    fireEvent.click(await screen.findByLabelText("select-VNT-260504-K020"));
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("rt-bulk-remove"));
    await screen.findByTestId("rt-confirm-remove");
    fireEvent.click(screen.getByTestId("rt-confirm-remove-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("rt-confirm-remove")).not.toBeInTheDocument();
    });
    expect(getQueue()).toHaveLength(2);
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("1");
  });
});
