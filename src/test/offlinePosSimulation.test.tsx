import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock useCurrency
vi.mock("@/hooks/useCurrency", () => ({
  useCurrency: () => ({
    currency: { symbol: "GNF", position: "after" },
    formatPrice: (p: number) => `${new Intl.NumberFormat("fr-FR").format(p)} GNF`,
    availablePaymentMethods: ["cash", "wave", "orange_money"],
    phoneCode: "+221",
  }),
}));

// Mock toast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { OfflinePOSSimulationPanel } from "@/components/sync/OfflinePOSSimulationPanel";

describe("OfflinePOSSimulationPanel — flux complet caisse offline → reconnexion", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("enregistre des ventes en mode offline avec étiquette « sync pending »", async () => {
    render(<OfflinePOSSimulationPanel />);

    // Passer offline
    fireEvent.click(screen.getByRole("button", { name: /Hors ligne/i }));

    // Ajouter 3 ventes
    const addBtn = screen.getByTestId("offline-add-sale");
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByTestId("pending-count").textContent).toBe("3");
      expect(screen.getByTestId("synced-count").textContent).toBe("0");
    });
    // Au moins un badge "sync pending" affiché
    expect(screen.getAllByText(/sync pending/i).length).toBeGreaterThan(0);
  });

  it("synchronise les ventes pending sans créer de doublons à la reconnexion", async () => {
    render(<OfflinePOSSimulationPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Hors ligne/i }));

    const addBtn = screen.getByTestId("offline-add-sale");
    for (let i = 0; i < 4; i++) fireEvent.click(addBtn);

    await waitFor(() => expect(screen.getByTestId("pending-count").textContent).toBe("4"));

    // Reconnecter
    fireEvent.click(screen.getByTestId("reconnect-sync-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("pending-count").textContent).toBe("0");
      expect(screen.getByTestId("synced-count").textContent).toBe("4");
    });

    // Rapport affiché : 0 doublon
    expect(screen.getByText(/Aucun doublon/i)).toBeInTheDocument();
    expect(screen.getByText(/Insérées côté serveur/i)).toBeInTheDocument();
  });

  it("persiste les ventes pending via localStorage entre les rendus", async () => {
    const { unmount } = render(<OfflinePOSSimulationPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Hors ligne/i }));
    fireEvent.click(screen.getByTestId("offline-add-sale"));
    await waitFor(() => expect(screen.getByTestId("pending-count").textContent).toBe("1"));
    unmount();

    render(<OfflinePOSSimulationPanel />);
    await waitFor(() => {
      // La vente précédente est rechargée depuis localStorage
      expect(screen.getByTestId("pending-count").textContent).toBe("1");
    });
  });
});
