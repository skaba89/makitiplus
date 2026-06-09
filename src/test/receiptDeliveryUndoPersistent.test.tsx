/**
 * Test E2E — Undo persistant
 *   1. Sélectionne + supprime des tickets.
 *   2. Démonte (remount) le panneau immédiatement (simule un changement de
 *      route ou un re-render pendant la sync).
 *   3. Vérifie que la bannière d'undo persistant est visible AVEC un
 *      countdown affiché.
 *   4. Clique sur Annuler → la file et la sélection sont restaurées.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, getQueue, setSender,
} from "@/lib/receiptDeliveryQueue";
import { clearUndo, loadUndo } from "@/lib/receiptDeliveryUndo";
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

describe("Undo persistant — survit au remount + countdown affiché", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    clearUndo();
    setOnline(false);
    setSender(null);
  });

  it("affiche la bannière d'undo après remount et restaure la file", async () => {
    enqueueOrSendReceipt("whatsapp", "+224611000001", sample("VNT-260504-A001"));
    enqueueOrSendReceipt("whatsapp", "+224611000002", sample("VNT-260504-A002"));
    expect(getQueue()).toHaveLength(2);

    const view = render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    // Sélectionne tout puis supprime
    fireEvent.click(await screen.findByTestId("rt-select-all"));
    fireEvent.click(screen.getByTestId("rt-bulk-remove"));
    fireEvent.click(await screen.findByTestId("rt-confirm-remove-ok"));

    await waitFor(() => {
      expect(getQueue()).toHaveLength(0);
    });

    // Undo persisté en localStorage
    const persisted = loadUndo();
    expect(persisted).not.toBeNull();
    expect(persisted!.action).toBe("remove");
    expect(persisted!.snapshot).toHaveLength(2);
    expect(persisted!.selection).toHaveLength(2);

    // Démonte le panneau (simule remount / changement de route)
    view.unmount();
    cleanup();

    // Re-render
    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    // Bannière visible + countdown
    const banner = await screen.findByTestId("rt-undo-banner");
    expect(banner).toBeTruthy();
    const countdown = screen.getByTestId("rt-undo-countdown");
    expect(countdown.textContent ?? "").toMatch(/\d+s/);

    // Clique sur l'action de la bannière → restauration
    fireEvent.click(screen.getByTestId("rt-undo-banner-action"));

    await waitFor(() => {
      expect(getQueue()).toHaveLength(2);
    });
    // Sélection précédente restaurée → compteur revient à 2
    await waitFor(() => {
      const cnt = screen.getByTestId("rt-selected-count");
      expect(cnt.textContent ?? "").toContain("2");
    });
    // Store d'undo purgé
    expect(loadUndo()).toBeNull();
  });
});
