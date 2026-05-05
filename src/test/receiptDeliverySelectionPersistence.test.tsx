/**
 * E2E : sélection persistante à travers filtre/recherche/page, indicateur
 * "X sélectionné(s) sur tout le résultat", puis clic sur "Effacer la sélection".
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { ReceiptDeliveryTrackingPanel } from "@/components/sync/ReceiptDeliveryTrackingPanel";
import {
  enqueueOrSendReceipt, clearQueue, setSender,
} from "@/lib/receiptDeliveryQueue";
import type { ReceiptData } from "@/utils/receiptGenerator";

const sample = (n: string, biz = "Boutique"): ReceiptData => ({
  saleNumber: n,
  date: new Date("2026-05-03T10:00:00Z"),
  items: [{ product_name: "Riz 1kg", quantity: 2, unit_price: 500, total_price: 1000 }],
  subtotal: 1000, total: 1000, paymentMethod: "cash",
  amountPaid: 1000, change: 0, businessName: biz,
});

const setOnline = (v: boolean) => {
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
};

describe("Sélection persistante + indicateur global + Effacer la sélection", () => {
  beforeEach(() => {
    localStorage.clear();
    clearQueue();
    setOnline(false);
    setSender(null);
  });

  it("conserve les coches lors du changement de page/filtre/recherche, puis 'Effacer' vide tout", async () => {
    // 15 entrées → 2 pages à 10/page. Tri par date desc : la dernière insérée
    // apparaît en haut de la liste. On insère FIND en DERNIER pour qu'il soit
    // en page 1 (et reste seul après filtre "FIND").
    for (let i = 1; i <= 14; i++) {
      const num = `VNT-260503-${String(i).padStart(4, "0")}`;
      enqueueOrSendReceipt("whatsapp", `+2246110${String(i).padStart(4, "0")}`, sample(num));
    }
    enqueueOrSendReceipt("whatsapp", "+22499999999", sample("VNT-260503-FIND", "FindMe"));

    render(<><ReceiptDeliveryTrackingPanel /><Toaster /></>);

    // 1) Coche 2 lignes sur la 1ʳᵉ page
    fireEvent.click(await screen.findByLabelText("select-VNT-260503-FIND"));
    fireEvent.click(screen.getByLabelText("select-VNT-260503-0001"));
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("2");
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent(
      /sur tout le résultat/i,
    );

    // 2) Va sur la page 2 → coche encore 1 ligne
    fireEvent.click(screen.getByTestId("rt-next"));
    await waitFor(() => {
      expect(screen.getByTestId("rt-page-info")).toHaveTextContent(/2/);
    });
    // une ligne de la page 2 (au moins VNT-260503-0011 existe)
    const page2Row = screen.getByLabelText("select-VNT-260503-0011");
    fireEvent.click(page2Row);
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("3");

    // 3) Change la recherche → la liste est filtrée mais la sélection persiste
    fireEvent.change(screen.getByTestId("rt-search"), { target: { value: "FIND" } });
    await waitFor(() => {
      expect(screen.getByTestId("rt-page-info")).toHaveTextContent(/1/);
    });
    // La sélection ne doit PAS être effacée par le filtre
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("3");
    // L'indicateur global mentionne bien le total filtré (1 ticket visible)
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent(/1\s*Ticket/i);

    // 4) Clic sur "Effacer la sélection" → tout se vide
    fireEvent.click(screen.getByTestId("rt-clear-selection"));
    expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("0");

    // Le bouton "Effacer" disparaît quand selected.size === 0
    expect(screen.queryByTestId("rt-clear-selection")).not.toBeInTheDocument();

    // 5) Retour à "all" → vérifie que rien n'est resté coché ailleurs
    fireEvent.change(screen.getByTestId("rt-search"), { target: { value: "" } });
    await waitFor(() => {
      // toujours 0
      expect(screen.getByTestId("rt-selected-count")).toHaveTextContent("0");
    });
  });
});
