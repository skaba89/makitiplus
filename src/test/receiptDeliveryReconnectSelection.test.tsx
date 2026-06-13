/**
 * E2E : sélection offline → reconnexion → flush automatique.
 * Vérifie qu'après synchronisation (les entrées passent à 'sent' / sont
 * pruned si certaines deviennent introuvables), la sélection ne contient
 * AUCUN ID fantôme et l'indicateur reste cohérent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, getQueue, setSender, removeOne,
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

describe("Reconnexion → sélection cohérente, pas d'IDs fantômes", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("offline: coche 3, simule reconnexion + suppression d'une entrée hors UI, puis vérifie qu'aucun ID fantôme ne subsiste", async () => {
    // Crée 3 entrées en offline
    const a = enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260504-R001"));
    const b = enqueueOrSendReceipt("sms",      "+22461100002", sample("VNT-260504-R002"));
    const c = enqueueOrSendReceipt("whatsapp", "+22461100003", sample("VNT-260504-R003"));
    expect(getQueue()).toHaveLength(3);

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    // Coche les 3 lignes
    fireEvent.click(await screen.findByLabelText("select-VNT-260504-R001"));
    fireEvent.click(screen.getByLabelText("select-VNT-260504-R002"));
    fireEvent.click(screen.getByLabelText("select-VNT-260504-R003"));
    await waitFor(() => {
      expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("3");
    });

    // Simule une reconnexion : revient online + une entrée disparaît
    // (par ex. nettoyée par un autre client / sync delta).
    setOnline(true);
    removeOne(b.client_uuid); // ID 'b' devient fantôme côté UI

    // Déclenche le rafraîchissement périodique du panneau (il appelle refresh()
    // qui prune les ghost UUIDs de la sélection).
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    // L'indicateur reflète maintenant 2 (et non 3) — l'ID fantôme a été retiré.
    await waitFor(() => {
      expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");
    });

    // Et le storage de sélection ne contient plus l'ID supprimé
    const stored = JSON.parse(
      localStorage.getItem("malikiplus:receipt_delivery_selection") ?? "[]",
    );
    expect(stored).not.toContain(b.client_uuid);
    expect(stored).toContain(a.client_uuid);
    expect(stored).toContain(c.client_uuid);

    // La file ne contient bien que 2 entrées
    expect(getQueue()).toHaveLength(2);
  });
});
