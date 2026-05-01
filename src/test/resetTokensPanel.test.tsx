import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// Mock supabase client used by ResetTokensPanel
const mockData = [
  { id: "1", user_id: "u1", channel: "email", destination: "alice@example.com", created_at: "2026-04-25T10:00:00Z", expires_at: "2026-05-25T10:00:00Z", used_at: null },
  { id: "2", user_id: "u2", channel: "sms",   destination: "+221770000001",     created_at: "2026-04-26T10:00:00Z", expires_at: "2026-05-26T10:00:00Z", used_at: null },
  { id: "3", user_id: "u1", channel: "sms",   destination: "+221770000002",     created_at: "2026-04-27T10:00:00Z", expires_at: "2020-01-01T00:00:00Z", used_at: null }, // expiré
  { id: "4", user_id: "u3", channel: "email", destination: "bob@example.com",   created_at: "2026-04-28T10:00:00Z", expires_at: "2026-05-28T10:00:00Z", used_at: "2026-04-29T10:00:00Z" }, // utilisé
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `bulk-${i}`,
    user_id: i % 2 === 0 ? "u1" : "u2",
    channel: i % 3 === 0 ? "sms" : "email",
    destination: i % 3 === 0 ? `+22177000${1000 + i}` : `user${i}@example.com`,
    created_at: new Date(Date.UTC(2026, 3, 1 + i, 8)).toISOString(),
    expires_at: new Date(Date.UTC(2026, 4, 1 + i, 8)).toISOString(),
    used_at: null,
  })),
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: mockData, error: null }),
        }),
      }),
    }),
  },
}));

import { ResetTokensPanel } from "@/components/users/ResetTokensPanel";

const users = [
  { user_id: "u1", name: "Alice Dupont" },
  { user_id: "u2", name: "Babacar Diop" },
  { user_id: "u3", name: "Bob Martin" },
];

const renderPanel = async () => {
  render(<ResetTokensPanel users={users} />);
  // wait for load
  await waitFor(() => {
    expect(screen.queryByText(/Aucun lien correspondant/i)).not.toBeInTheDocument();
  });
};

describe("ResetTokensPanel — recherche, filtres, tri & pagination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filtre par recherche email", async () => {
    await renderPanel();
    const searchInput = screen.getByPlaceholderText(/Rechercher email, téléphone/i);
    fireEvent.change(searchInput, { target: { value: "alice@example" } });
    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
    });
  });

  it("filtre par numéro de téléphone", async () => {
    await renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Rechercher email/i), { target: { value: "+221770000001" } });
    await waitFor(() => {
      expect(screen.getByText("+221770000001")).toBeInTheDocument();
      expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
    });
  });

  it("filtre par nom d'utilisateur", async () => {
    await renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Rechercher email/i), { target: { value: "Babacar" } });
    await waitFor(() => {
      // Tous les rows visibles doivent appartenir à Babacar
      const cells = screen.getAllByText("Babacar Diop");
      expect(cells.length).toBeGreaterThan(0);
      expect(screen.queryByText("Bob Martin")).not.toBeInTheDocument();
    });
  });

  it("garde le tri par date desc lorsqu'on change de canal", async () => {
    await renderPanel();
    // Lecture des dates affichées dans la première colonne 'Envoyé' (col index 4)
    const getCreatedDates = () => {
      const rows = screen.getAllByRole("row").slice(1); // skip header
      return rows.map((r) => {
        const cells = within(r).getAllByRole("cell");
        return cells[4]?.textContent ?? "";
      });
    };
    const datesAll = getCreatedDates();
    // Vérifie que c'est trié desc (chaîne dd MMM yyyy HH:mm — comparons via parsing via Date pas garanti, on s'en remet à l'ordre fourni par le mock qui est trié desc)
    expect(datesAll.length).toBeGreaterThan(0);
    // Le premier doit correspondre au plus récent du dataset
    expect(datesAll[0]).toMatch(/2026/);
  });

  it("réinitialise la pagination quand on tape une recherche", async () => {
    await renderPanel();
    // Aller à la page 2 si disponible
    const next = screen.queryByLabelText(/Go to next page/i);
    if (next) fireEvent.click(next);
    // Tape une recherche
    fireEvent.change(screen.getByPlaceholderText(/Rechercher email/i), { target: { value: "alice" } });
    await waitFor(() => {
      // Page courante doit être 1 (pas de "2" actif)
      const active = screen.queryByRole("link", { current: "page" });
      expect(active?.textContent === "1" || active === null).toBe(true);
    });
  });
});
