import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// Données : 25 entrées multi-canaux pour tester pagination & tri stables
const mockData = [
  ...Array.from({ length: 13 }, (_, i) => ({
    id: `email-${i}`,
    user_id: i % 2 === 0 ? "u1" : "u2",
    channel: "email",
    destination: `mail${i}@example.com`,
    created_at: new Date(Date.UTC(2026, 3, 5 + i, 8)).toISOString(),
    expires_at: new Date(Date.UTC(2026, 4, 5 + i, 8)).toISOString(),
    used_at: i === 2 ? new Date(Date.UTC(2026, 3, 6, 9)).toISOString() : null,
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `sms-${i}`,
    user_id: i % 2 === 0 ? "u3" : "u1",
    channel: "sms",
    destination: `+22177${String(1000000 + i).slice(-7)}`,
    created_at: new Date(Date.UTC(2026, 3, 1 + i, 7)).toISOString(),
    expires_at: i === 0
      ? new Date(Date.UTC(2020, 0, 1, 0)).toISOString() // expiré
      : new Date(Date.UTC(2026, 4, 1 + i, 7)).toISOString(),
    used_at: null,
  })),
].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({ limit: () => Promise.resolve({ data: mockData, error: null }) }),
      }),
    }),
  },
}));

import { ResetTokensPanel } from "@/components/users/ResetTokensPanel";

const users = [
  { user_id: "u1", name: "Alice Dupont" },
  { user_id: "u2", name: "Babacar Diop" },
  { user_id: "u3", name: "Charlie Sow" },
];

const renderPanel = async () => {
  render(<ResetTokensPanel users={users} />);
  await waitFor(() => {
    // En attente du chargement (au moins un email récent visible — page 1, tri desc)
    expect(screen.getByText(/mail12@example.com/)).toBeInTheDocument();
  });
};

const getCreatedDates = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[4]?.textContent ?? "");

const isSortedDesc = (dates: string[]) => {
  // Format : "dd MMM yyyy HH:mm" en français → on s'en remet à la position dans mockData
  // Vérifie via parsing fr → comparer ms
  const parsed = dates.map((d) => {
    // ex "05 avr. 2026 08:00"
    const months: Record<string, number> = {
      "janv.": 0, "févr.": 1, "mars": 2, "avr.": 3, "mai": 4, "juin": 5,
      "juil.": 6, "août": 7, "sept.": 8, "oct.": 9, "nov.": 10, "déc.": 11,
    };
    const m = d.match(/(\d+)\s+(\S+)\s+(\d+)\s+(\d+):(\d+)/);
    if (!m) return 0;
    return new Date(+m[3], months[m[2]] ?? 0, +m[1], +m[4], +m[5]).getTime();
  });
  for (let i = 1; i < parsed.length; i++) if (parsed[i] > parsed[i - 1]) return false;
  return true;
};

describe("ResetTokensPanel e2e — filtres répétés, tri stable & pagination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("garde le tri par date desc lors de filtrages successifs par recherche", async () => {
    await renderPanel();

    // Initial : tous canaux
    expect(isSortedDesc(getCreatedDates())).toBe(true);

    const search = screen.getByPlaceholderText(/Rechercher email/i);

    // Filtrage par "mail" → uniquement les emails
    fireEvent.change(search, { target: { value: "@example.com" } });
    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((r) => expect(r.textContent).toMatch(/@example.com/));
    });
    expect(isSortedDesc(getCreatedDates())).toBe(true);

    // Changer la recherche pour viser les SMS
    fireEvent.change(search, { target: { value: "+22177" } });
    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((r) => expect(r.textContent).toMatch(/\+22177/));
    });
    expect(isSortedDesc(getCreatedDates())).toBe(true);

    // Re-élargir et vérifier que le tri tient
    fireEvent.change(search, { target: { value: "" } });
    await waitFor(() => expect(getCreatedDates().length).toBeGreaterThan(5));
    expect(isSortedDesc(getCreatedDates())).toBe(true);
  });

  it("réinitialise la page courante à 1 lors de saisies successives email/téléphone/utilisateur", async () => {
    await renderPanel();

    // Aller à la page 2 (25 items > 10/page)
    const next = screen.getByLabelText(/Go to next page/i);
    fireEvent.click(next);
    await waitFor(() => {
      const active = screen.getByRole("link", { current: "page" });
      expect(active.textContent).toBe("2");
    });

    const search = screen.getByPlaceholderText(/Rechercher email/i);

    // 1. Recherche par email
    fireEvent.change(search, { target: { value: "mail12@example.com" } });
    await waitFor(() => {
      expect(screen.getByText("mail12@example.com")).toBeInTheDocument();
      // Toutes les lignes affichées contiennent "mail12"
      const rows = screen.getAllByRole("row").slice(1);
      rows.forEach((r) => expect(r.textContent).toMatch(/mail12/));
    });

    // 2. Effacer puis rechercher par téléphone
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.change(search, { target: { value: "+22177" } });
    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((r) => expect(r.textContent).toMatch(/\+22177/));
    });
    // Page courante = 1
    const active1 = screen.queryByRole("link", { current: "page" });
    if (active1) expect(active1.textContent).toBe("1");

    // 3. Effacer puis rechercher par utilisateur
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.change(search, { target: { value: "Charlie" } });
    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((r) => expect(r.textContent).toMatch(/Charlie Sow/));
    });
  });
});
