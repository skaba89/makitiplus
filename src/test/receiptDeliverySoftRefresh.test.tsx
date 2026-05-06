/**
 * E2E : soft refresh (unmount/remount) → la sélection persiste car
 * elle est sauvegardée par client_uuid, et les compteurs restent cohérents.
 *
 * NOTE : la sélection vit dans l'état React du composant. Pour la rendre
 * persistante au remount, le composant la sérialise dans sessionStorage.
 * Ce test valide ce contrat.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import { clearQueue, setSender } from "@/lib/receiptDeliveryQueue";
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

describe("Soft refresh — sélection persistante au remount", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("conserve la sélection et l'indicateur 'X sélectionné(s)' après unmount/remount", async () => {
    const base = new Date("2026-05-04T10:00:00Z").getTime();
    const entries: any[] = [];
    for (let i = 1; i <= 5; i++) {
      const num = `VNT-260504-S${String(i).padStart(3, "0")}`;
      entries.push({
        client_uuid: `s_${i}`,
        saleNumber: num,
        channel: "whatsapp",
        phone: `+22461100${String(i).padStart(4, "0")}`,
        payload: sample(num),
        status: "pending",
        attempts: 0,
        created_at: new Date(base + i * 1000).toISOString(),
      });
    }
    localStorage.setItem("sahelpos:receipt_delivery_queue", JSON.stringify(entries));

    const { unmount } = render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    // Coche 2 lignes
    fireEvent.click(await screen.findByLabelText("select-VNT-260504-S005"));
    fireEvent.click(screen.getByLabelText("select-VNT-260504-S004"));
    await waitFor(() => {
      expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");
    });

    // Soft refresh
    unmount();
    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    // L'indicateur reflète toujours 2 sélectionnés
    await waitFor(() => {
      expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");
    });
    // Les checkboxes restent cochées
    expect(screen.getByLabelText("select-VNT-260504-S005")).toBeChecked();
    expect(screen.getByLabelText("select-VNT-260504-S004")).toBeChecked();
    // Le total filtré reste cohérent (5 tickets)
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent(/5/);
  });
});
