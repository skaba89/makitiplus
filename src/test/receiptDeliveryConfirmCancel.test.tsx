/**
 * E2E : confirmations "Supprimer sélection" et "Archiver doublons" — clic Annuler
 * → rien n'est supprimé/archivé et la sélection reste intacte.
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
  date: new Date("2026-05-03T10:00:00Z"),
  items: [{ product_name: "Riz 1kg", quantity: 2, unit_price: 500, total_price: 1000 }],
  subtotal: 1000, total: 1000, paymentMethod: "cash",
  amountPaid: 1000, change: 0, businessName: "Boutique Confirm",
});

const setOnline = (v: boolean) => {
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
};

describe("Confirmations Supprimer/Archiver — clic Annuler n'altère rien", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("Annuler 'Supprimer sélection' ne supprime rien et préserve la sélection", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260503-A001"));
    enqueueOrSendReceipt("sms",      "+22461100002", sample("VNT-260503-A002"));
    enqueueOrSendReceipt("whatsapp", "+22461100003", sample("VNT-260503-A003"));
    expect(getQueue()).toHaveLength(3);

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    // Coche 2 lignes
    fireEvent.click(await screen.findByLabelText("select-VNT-260503-A001"));
    fireEvent.click(screen.getByLabelText("select-VNT-260503-A002"));
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");

    // Ouvre le dialog Supprimer
    fireEvent.click(screen.getByTestId("rt-bulk-remove"));
    const dialog = await screen.findByTestId("rt-confirm-remove");
    expect(dialog).toBeInTheDocument();

    // Annuler
    fireEvent.click(screen.getByTestId("rt-confirm-remove-cancel"));
    await waitFor(() => {
      expect(screen.queryByTestId("rt-confirm-remove")).not.toBeInTheDocument();
    });

    // Rien supprimé, sélection inchangée
    expect(getQueue()).toHaveLength(3);
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");
  });

  it("Annuler 'Archiver doublons' ne marque rien comme duplicate", async () => {
    // Crée un vrai doublon en bypassant l'idempotence (manipulation directe du localStorage)
    const r1 = enqueueOrSendReceipt("whatsapp", "+22461100010", sample("VNT-260503-B001"));
    const cloned = { ...r1, client_uuid: r1.client_uuid + "_dup", created_at: new Date().toISOString() };
    const raw = JSON.parse(localStorage.getItem("malikiplus:receipt_delivery_queue") ?? "[]");
    raw.push(cloned);
    localStorage.setItem("malikiplus:receipt_delivery_queue", JSON.stringify(raw));
    expect(getQueue()).toHaveLength(2);
    const beforeStatuses = getQueue().map((q) => q.status).sort();

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    fireEvent.click(await screen.findByTestId("rt-archive-dup"));
    const dialog = await screen.findByTestId("rt-confirm-archive");
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("rt-confirm-archive-cancel"));
    await waitFor(() => {
      expect(screen.queryByTestId("rt-confirm-archive")).not.toBeInTheDocument();
    });

    // File inchangée : aucun statut passé à 'duplicate'
    const after = getQueue();
    expect(after).toHaveLength(2);
    expect(after.map((q) => q.status).sort()).toEqual(beforeStatuses);
    expect(after.filter((q) => q.status === "duplicate")).toHaveLength(0);
  });
});
