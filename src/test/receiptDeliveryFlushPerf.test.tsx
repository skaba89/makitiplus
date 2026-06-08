/**
 * Test de performance — flush d'une grande file (300 entrées).
 * Vérifie que le throttling de refresh/progress maintient un temps
 * raisonnable (< 4s en CI jsdom) et que la progress bar termine à 100%.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, setSender, getQueue,
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

describe("Performance — flush grande file (300 entrées)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("traite 300 tickets en <4s et atteint 100% de progression", async () => {
    // Enfile 300 tickets offline (pas d'envoi immédiat)
    for (let i = 0; i < 300; i++) {
      enqueueOrSendReceipt(
        i % 2 === 0 ? "whatsapp" : "sms",
        `+2246110${String(i).padStart(4, "0")}`,
        sample(`VNT-260504-X${String(i).padStart(4, "0")}`),
      );
    }
    expect(getQueue()).toHaveLength(300);

    // Sender mock instantané — succès garanti
    setSender(() => { /* no-op success */ });
    setOnline(true);

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    const flushBtn = await screen.findByTestId("rt-flush-all");
    const start = performance.now();
    fireEvent.click(flushBtn);

    // Le bouton retry-all envoie tout — attend que la file soit pleinement "sent"
    await waitFor(() => {
      expect(getQueue().every((q) => q.status === "sent")).toBe(true);
    }, { timeout: 8000 });
    const elapsed = performance.now() - start;

    // Performance attendue : < 4000ms grâce au throttling de refresh
    expect(elapsed).toBeLessThan(4000);

    // Compteur final reflète bien 300 envoyés
    await waitFor(() => {
      expect(screen.getByTestId("rt-count-sent")).toHaveTextContent("300");
    });
  }, 15000);
});
