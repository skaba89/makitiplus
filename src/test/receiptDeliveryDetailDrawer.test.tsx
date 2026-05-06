/**
 * E2E : drawer de détails — vérifie l'affichage de client_uuid, phone,
 * timestamps (created_at, sent_at, next_retry_at), last_error et payload JSON.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, getQueue, retryOne, setSender,
} from "@/lib/receiptDeliveryQueue";
import type { ReceiptData } from "@/utils/receiptGenerator";

const sample = (n: string): ReceiptData => ({
  saleNumber: n,
  date: new Date("2026-05-03T10:00:00Z"),
  items: [{ product_name: "Riz 1kg", quantity: 2, unit_price: 500, total_price: 1000 }],
  subtotal: 1000, total: 1000, paymentMethod: "cash",
  amountPaid: 1000, change: 0, businessName: "Boutique Détails",
});

const setOnline = (v: boolean) => {
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
};

describe("Drawer de détails — affichage complet d'une entrée", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("ouvre le drawer et affiche client_uuid, phone, timestamps, last_error, payload JSON", async () => {
    // 1) Crée une entrée offline (pending)
    const phone = "+22461199999";
    const sale = "VNT-260503-9001";
    const entry = enqueueOrSendReceipt("whatsapp", phone, sample(sale));

    // 2) Provoque un échec contrôlé pour avoir un last_error + next_retry_at
    setOnline(true);
    setSender(() => { throw new Error("e2e_simulated_failure"); });
    retryOne(entry.client_uuid, { force: true });

    const refreshed = getQueue().find((q) => q.client_uuid === entry.client_uuid)!;
    expect(refreshed.status).toBe("failed");
    expect(refreshed.last_error).toBe("e2e_simulated_failure");
    expect(refreshed.next_retry_at).toBeTruthy();

    // 3) Rend le panneau et ouvre le drawer
    render(
      <>
        <ReceiptDeliveryTrackingPanel />
        <Toaster />
      </>
    );

    const detailsBtn = await screen.findByTestId(`rt-details-${sale}`);
    fireEvent.click(detailsBtn);

    const drawer = await screen.findByTestId("rt-detail-drawer");
    const inDrawer = within(drawer);

    // client_uuid présent (et bien celui de l'entrée)
    expect(inDrawer.getByText(entry.client_uuid)).toBeInTheDocument();
    // téléphone (recipient)
    expect(inDrawer.getByText(phone)).toBeInTheDocument();
    // canal
    expect(inDrawer.getByText("whatsapp")).toBeInTheDocument();
    // last_error
    expect(inDrawer.getByText(/e2e_simulated_failure/)).toBeInTheDocument();
    // payload JSON (contient le businessName sérialisé, unique)
    expect(inDrawer.getByText(/Boutique Détails/)).toBeInTheDocument();
    // saleNumber apparaît au moins 2x (titre + payload JSON) → idempotence visuelle
    expect(inDrawer.getAllByText(new RegExp(sale)).length).toBeGreaterThanOrEqual(2);
    // libellés des timestamps (FR par défaut)
    expect(inDrawer.getByText("Créé le")).toBeInTheDocument();
    expect(inDrawer.getByText("Prochain essai")).toBeInTheDocument();
  });
});
