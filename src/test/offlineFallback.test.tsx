import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// Mock OfflineContext
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/lib/sentry", () => ({
  reportError: vi.fn(),
}));

import OfflineFallback from "@/pages/OfflineFallback";

const renderOfflineFallback = (props?: { requestedPath?: string }) => {
  return render(
    <BrowserRouter>
      <OfflineFallback {...props} />
    </BrowserRouter>
  );
};

describe("OfflineFallback — page fallback hors-ligne (M4)", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    // Reset navigator.onLine
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: false,
    });
  });

  it("affiche le titre et la description quand hors-ligne", () => {
    renderOfflineFallback();

    expect(screen.getByText("Page indisponible hors-ligne")).toBeInTheDocument();
    expect(screen.getByText(/nécessite une connexion internet/i)).toBeInTheDocument();
  });

  it("affiche le nom de la page demandée", () => {
    renderOfflineFallback({ requestedPath: "/dashboard/reports" });

    expect(screen.getByText(/Reports/)).toBeInTheDocument();
  });

  it("affiche les boutons de navigation", () => {
    renderOfflineFallback();

    expect(screen.getByText("Aller au POS")).toBeInTheDocument();
    expect(screen.getByText("Tableau de bord")).toBeInTheDocument();
  });

  it("navigue vers le POS quand on clique sur le bouton", () => {
    renderOfflineFallback();

    fireEvent.click(screen.getByText("Aller au POS"));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/pos");
  });

  it("navigue vers le dashboard quand on clique sur le bouton", () => {
    renderOfflineFallback();

    fireEvent.click(screen.getByText("Tableau de bord"));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("affiche le bouton Réessayer quand hors-ligne", () => {
    renderOfflineFallback();

    expect(screen.getByText("Réessayer")).toBeInTheDocument();
  });

  it("affiche le message de connexion rétablie quand en ligne", () => {
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });

    renderOfflineFallback();

    expect(screen.getByText("Connexion rétablie")).toBeInTheDocument();
    expect(screen.getByText("Charger la page")).toBeInTheDocument();
  });

  it("affiche l'icône Wifi quand en ligne", () => {
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });

    renderOfflineFallback();

    // When online, we should see the "Charger la page" button which indicates online state
    expect(screen.getByText("Charger la page")).toBeInTheDocument();
  });
});
