import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@/hooks/useCurrency", () => ({
  useCurrency: () => ({
    currency: { symbol: "FCFA", position: "after" },
    formatPrice: (p: number) => `${new Intl.NumberFormat("fr-FR").format(p)} FCFA`,
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
    vi.useFakeTimers();
  });

  const renderPanel = () => render(<MobileMoneySimulationPanel />);

  it("génère un QR, déclenche le webhook et marque la transaction comme succès (en ligne)", async () => {
    renderPanel();

    fireEvent.click(screen.getByTestId("mm-generate-qr"));

    // Webhook simulé après 800ms
    await act(async () => { vi.advanceTimersByTime(900); });

    await waitFor(() => {
      expect(screen.getByTestId("mm-success").textContent).toBe("1");
    });
    expect(screen.getByTestId("mm-failed").textContent).toBe("0");
  });

  it("retourne un statut échec quand 'Forcer échec' est coché", async () => {
    renderPanel();

    fireEvent.click(screen.getByTestId("mm-force-fail"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));

    await act(async () => { vi.advanceTimersByTime(900); });

    await waitFor(() => {
      expect(screen.getByTestId("mm-failed").textContent).toBe("1");
    });
    expect(screen.getByTestId("mm-success").textContent).toBe("0");
  });

  it("mode offline → reconnexion : envoie les paiements en file et déclenche les webhooks", async () => {
    renderPanel();

    // Passer offline
    fireEvent.click(screen.getByTestId("mm-offline-btn"));

    // Encaisser 3 paiements offline
    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));

    await waitFor(() => {
      expect(screen.getByTestId("mm-pending").textContent).toBe("3");
    });

    // Reconnecter
    fireEvent.click(screen.getByTestId("mm-reconnect"));

    // Webhooks (800ms chacun, déclenchés en parallèle)
    await act(async () => { vi.advanceTimersByTime(1500); });

    await waitFor(() => {
      expect(screen.getByTestId("mm-success").textContent).toBe("3");
      expect(screen.getByTestId("mm-pending").textContent).toBe("0");
    });
  });

  it("permet le remboursement d'un paiement réussi", async () => {
    renderPanel();

    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    await act(async () => { vi.advanceTimersByTime(900); });

    await waitFor(() => expect(screen.getByTestId("mm-success").textContent).toBe("1"));

    const refundBtn = screen.getAllByText(/Rembourser/i)[0];
    fireEvent.click(refundBtn);

    await waitFor(() => {
      expect(screen.getByTestId("mm-refunded").textContent).toBe("1");
      expect(screen.getByTestId("mm-success").textContent).toBe("0");
    });
  });

  it("idempotence : plusieurs reconnects ne doublent jamais les paiements", async () => {
    renderPanel();

    fireEvent.click(screen.getByTestId("mm-offline-btn"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));
    fireEvent.click(screen.getByTestId("mm-generate-qr"));

    await waitFor(() => expect(screen.getByTestId("mm-pending").textContent).toBe("2"));

    // Premier reconnect
    fireEvent.click(screen.getByTestId("mm-reconnect"));
    await act(async () => { vi.advanceTimersByTime(1500); });

    await waitFor(() => expect(screen.getByTestId("mm-success").textContent).toBe("2"));
    const totalAfter1 = screen.getByTestId("mm-success").textContent;

    // 2e et 3e reconnect (rien à pousser)
    fireEvent.click(screen.getByTestId("mm-offline-btn"));
    fireEvent.click(screen.getByTestId("mm-reconnect"));
    await act(async () => { vi.advanceTimersByTime(1500); });
    fireEvent.click(screen.getByTestId("mm-reconnect"));
    await act(async () => { vi.advanceTimersByTime(1500); });

    // Toujours 2 succès — aucun doublon
    expect(screen.getByTestId("mm-success").textContent).toBe(totalAfter1);
    expect(screen.getByTestId("mm-pending").textContent).toBe("0");
  });
});
