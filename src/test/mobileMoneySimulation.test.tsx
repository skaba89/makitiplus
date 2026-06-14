import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/hooks/useCurrency", () => ({
  useCurrency: () => ({
    currency: { symbol: "GNF", position: "after" },
    formatPrice: (p: number) => `${new Intl.NumberFormat("fr-FR").format(p)} GNF`,
    availablePaymentMethods: ["cash", "wave", "orange_money"],
    phoneCode: "+221",
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { MobileMoneySimulationPanel } from "@/components/sync/MobileMoneySimulationPanel";

describe("MobileMoneySimulationPanel — flux QR → encaissement → webhook → succès/échec → remboursement", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  const renderPanel = () => render(<MobileMoneySimulationPanel />);
  const flush = async (ms = 1500) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
      await Promise.resolve();
    });
  };

  it("génère un QR, déclenche le webhook et marque la transaction comme succès (en ligne)", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    await flush();
    expect(screen.getByTestId("mm-success").textContent).toBe("1");
    expect(screen.getByTestId("mm-failed").textContent).toBe("0");
  });

  it("retourne un statut échec quand 'Forcer échec' est coché", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("mm-force-fail"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    await flush();
    expect(screen.getByTestId("mm-failed").textContent).toBe("1");
    expect(screen.getByTestId("mm-success").textContent).toBe("0");
  });

  it("mode offline → reconnexion : envoie les paiements en file et déclenche les webhooks", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("mm-offline-btn"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));

    expect(screen.getByTestId("mm-pending").textContent).toBe("3");

    fireEvent.click(screen.getByTestId("mm-reconnect"));
    await flush(2000);

    expect(screen.getByTestId("mm-success").textContent).toBe("3");
    expect(screen.getByTestId("mm-pending").textContent).toBe("0");
  });

  it("permet le remboursement d'un paiement réussi", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    await flush();
    expect(screen.getByTestId("mm-success").textContent).toBe("1");

    const refundBtn = screen.getAllByText(/Rembourser/i)[0];
    fireEvent.click(refundBtn);

    expect(screen.getByTestId("mm-refunded").textContent).toBe("1");
    expect(screen.getByTestId("mm-success").textContent).toBe("0");
  });

  it("idempotence : plusieurs reconnects ne doublent jamais les paiements", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("mm-offline-btn"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    expect(screen.getByTestId("mm-pending").textContent).toBe("2");

    fireEvent.click(screen.getByTestId("mm-reconnect"));
    await flush(2000);
    expect(screen.getByTestId("mm-success").textContent).toBe("2");

    // Refaire 2 reconnects à vide
    fireEvent.click(screen.getByTestId("mm-offline-btn"));
    fireEvent.click(screen.getByTestId("mm-reconnect"));
    await flush();
    fireEvent.click(screen.getByTestId("mm-reconnect"));
    await flush();

    // Toujours 2 succès
    expect(screen.getByTestId("mm-success").textContent).toBe("2");
    expect(screen.getByTestId("mm-pending").textContent).toBe("0");
  });
});
