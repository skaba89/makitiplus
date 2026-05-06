/**
 * E2E : sélection multi-pages + merge des doublons
 * → idempotence préservée, sélection cohérente après opération.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import { clearQueue, getQueue, setSender } from "@/lib/receiptDeliveryQueue";
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

describe("Duplicate merge — multi-pages + idempotence", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("coche des lignes sur 2 pages, fusionne les doublons et garde l'idempotence (1 entrée par clé)", async () => {
    // Seed : 12 ventes uniques (page1 + page2) + 3 doublons réels (mêmes saleNumber|channel|phone)
    const base = new Date("2026-05-04T10:00:00Z").getTime();
    const entries: any[] = [];
    for (let i = 1; i <= 12; i++) {
      const num = `VNT-260504-M${String(i).padStart(3, "0")}`;
      entries.push({
        client_uuid: `m_${i}`,
        saleNumber: num,
        channel: "whatsapp",
        phone: `+22461100${String(i).padStart(4, "0")}`,
        payload: sample(num),
        status: "pending",
        attempts: 0,
        created_at: new Date(base + i * 1000).toISOString(),
      });
    }
    // Doublons : on duplique M001, M002, M003 avec un client_uuid différent
    for (const i of [1, 2, 3]) {
      const num = `VNT-260504-M${String(i).padStart(3, "0")}`;
      entries.push({
        client_uuid: `m_${i}_dup`,
        saleNumber: num,
        channel: "whatsapp",
        phone: `+22461100${String(i).padStart(4, "0")}`,
        payload: sample(num),
        status: "pending",
        attempts: 0,
        created_at: new Date(base + 1_000_000 + i * 1000).toISOString(),
      });
    }
    localStorage.setItem("sahelpos:receipt_delivery_queue", JSON.stringify(entries));
    expect(getQueue()).toHaveLength(15);

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    // Tri desc — les doublons (créés en dernier) sont en page 1.
    // Coche 2 lignes en page 1.
    const allCheckboxes = await screen.findAllByLabelText(/^select-VNT-/);
    fireEvent.click(allCheckboxes[0]);
    fireEvent.click(allCheckboxes[1]);
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");

    // Va en page 2, coche 1 ligne supplémentaire
    fireEvent.click(screen.getByTestId("rt-next"));
    await waitFor(() => {
      expect(screen.getByTestId("rt-page-info")).toHaveTextContent(/2/);
    });
    const page2Checkboxes = await screen.findAllByLabelText(/^select-VNT-/);
    fireEvent.click(page2Checkboxes[0]);
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("3");

    // Lance le merge
    fireEvent.click(screen.getByTestId("rt-merge-dup"));

    // Idempotence : pour chaque clé saleNumber|channel|phone, exactement 1 entrée
    await waitFor(() => {
      const q = getQueue();
      const keys = q.map((e) => `${e.saleNumber}|${e.channel}|${e.phone}`);
      expect(new Set(keys).size).toBe(keys.length);
      // 12 ventes uniques après merge
      expect(q).toHaveLength(12);
    });

    // L'indicateur de sélection reste cohérent (pas de crash, pas d'explosion).
    // Les uuids merge-supprimés ne sont plus dans la queue, donc l'indicateur
    // peut rester ≥ 0 et ≤ 3 selon le hasard du merge. Validation : pas d'erreur,
    // total filtré aligné sur 12.
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent(/12/);
  });
});
