/**
 * E2E : la sélection survit à un "hard refresh" (perte de sessionStorage,
 * conservation de localStorage). On simule en effaçant sessionStorage entre
 * deux montages tout en gardant localStorage intact.
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

describe("Hard refresh — sélection récupérée depuis localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("conserve la sélection cochée après un hard reload (sessionStorage vidé)", async () => {
    const base = new Date("2026-05-04T10:00:00Z").getTime();
    const entries: any[] = [];
    for (let i = 1; i <= 4; i++) {
      const num = `VNT-260504-H${String(i).padStart(3, "0")}`;
      entries.push({
        client_uuid: `h_${i}`,
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

    fireEvent.click(await screen.findByLabelText("select-VNT-260504-H004"));
    fireEvent.click(screen.getByLabelText("select-VNT-260504-H003"));
    await waitFor(() => {
      expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");
    });

    // Vérifie que la sélection est bien persistée en localStorage
    const stored = localStorage.getItem("sahelpos:receipt_delivery_selection");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).sort()).toEqual(["h_3", "h_4"]);

    // Simule un HARD reload : on démonte et on EFFACE sessionStorage
    unmount();
    sessionStorage.clear();

    // Remount → la sélection doit être restaurée depuis localStorage
    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    await waitFor(() => {
      expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");
    });
    expect(screen.getByLabelText("select-VNT-260504-H004")).toBeChecked();
    expect(screen.getByLabelText("select-VNT-260504-H003")).toBeChecked();
  });
});
