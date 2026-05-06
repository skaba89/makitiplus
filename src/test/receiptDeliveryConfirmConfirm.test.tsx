/**
 * E2E : confirme réellement "Supprimer sélection" et "Archiver doublons"
 * → vérifie que la file est bien mutée (suppression / statut duplicate).
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

describe("Confirmations OK — la file est réellement mutée", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("Confirmer 'Supprimer sélection' supprime bien les entrées cochées", async () => {
    enqueueOrSendReceipt("whatsapp", "+22461100001", sample("VNT-260504-A001"));
    enqueueOrSendReceipt("sms",      "+22461100002", sample("VNT-260504-A002"));
    enqueueOrSendReceipt("whatsapp", "+22461100003", sample("VNT-260504-A003"));
    expect(getQueue()).toHaveLength(3);

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    fireEvent.click(await screen.findByLabelText("select-VNT-260504-A001"));
    fireEvent.click(screen.getByLabelText("select-VNT-260504-A002"));
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");

    fireEvent.click(screen.getByTestId("rt-bulk-remove"));
    await screen.findByTestId("rt-confirm-remove");
    fireEvent.click(screen.getByTestId("rt-confirm-remove-ok"));

    await waitFor(() => {
      expect(getQueue()).toHaveLength(1);
    });
    // Seule A003 subsiste
    expect(getQueue()[0].saleNumber).toBe("VNT-260504-A003");
    // La sélection est vidée après l'action
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("0");
  });

  it("Confirmer 'Archiver doublons' marque les redondants comme 'duplicate'", async () => {
    const r1 = enqueueOrSendReceipt("whatsapp", "+22461100010", sample("VNT-260504-B001"));
    const cloned = {
      ...r1,
      client_uuid: r1.client_uuid + "_dup",
      created_at: new Date(Date.now() + 1000).toISOString(),
    };
    const raw = JSON.parse(localStorage.getItem("sahelpos:receipt_delivery_queue") ?? "[]");
    raw.push(cloned);
    localStorage.setItem("sahelpos:receipt_delivery_queue", JSON.stringify(raw));
    expect(getQueue()).toHaveLength(2);
    expect(getQueue().filter((q) => q.status === "duplicate")).toHaveLength(0);

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    fireEvent.click(await screen.findByTestId("rt-archive-dup"));
    await screen.findByTestId("rt-confirm-archive");
    fireEvent.click(screen.getByTestId("rt-confirm-archive-ok"));

    await waitFor(() => {
      expect(getQueue().filter((q) => q.status === "duplicate")).toHaveLength(1);
    });
    // Toujours 2 entrées (archivage = marque, pas suppression)
    expect(getQueue()).toHaveLength(2);
  });
});
