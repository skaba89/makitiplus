/**
 * E2E : "Supprimer sélection" → Annuler (Undo) restaure la file ET le
 * compteur de sélection à l'état précédent (snapshot).
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
  items: [{ product_name: "Riz", quantity: 1, unit_price: 500, total_price: 500 }],
  subtotal: 500, total: 500, paymentMethod: "cash",
  amountPaid: 500, change: 0, businessName: "B",
});

const setOnline = (v: boolean) =>
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });

describe("Undo bulk remove", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("restaure file et compteur de sélection après Annuler", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260504-U001"));
    enqueueOrSendReceipt("sms",      "+22461100002", sample("VNT-260504-U002"));
    enqueueOrSendReceipt("whatsapp", "+22461100003", sample("VNT-260504-U003"));
    const before = getQueue().map((q) => q.client_uuid).sort();
    expect(before).toHaveLength(3);

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    fireEvent.click(await screen.findByLabelText("select-VNT-260504-U001"));
    fireEvent.click(screen.getByLabelText("select-VNT-260504-U002"));
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");

    // Supprimer + confirmer
    fireEvent.click(screen.getByTestId("rt-bulk-remove"));
    fireEvent.click(await screen.findByTestId("rt-confirm-remove-ok"));
    await waitFor(() => expect(getQueue()).toHaveLength(1));
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("0");

    // Annuler via le toast
    const undoBtn = await screen.findByTestId("rt-undo");
    fireEvent.click(undoBtn);

    await waitFor(() => expect(getQueue()).toHaveLength(3));
    // Même UUIDs qu'avant
    expect(getQueue().map((q) => q.client_uuid).sort()).toEqual(before);
    // Sélection restaurée à 2
    await waitFor(() =>
      expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2"),
    );
  });
});
