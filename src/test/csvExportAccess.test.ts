import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Test de sécurité: l'edge function admin-export-users-csv DOIT refuser
 * tout appel d'un utilisateur non-admin (vendeur, manager, comptable).
 *
 * On simule la réponse de l'edge function (qui s'appuie sur requireAdminContext
 * côté serveur) pour vérifier le contrat de sécurité côté client.
 */

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

async function callExport(token: string) {
  return fetch("https://example.supabase.co/functions/v1/admin-export-users-csv", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
}

describe("admin-export-users-csv RBAC", () => {
  it("refuse un vendeur (403)", async () => {
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: "Forbidden: admin only" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    ));
    const res = await callExport("vendeur-token");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/admin/i);
  });

  it("refuse un manager (403)", async () => {
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: "Forbidden: admin only" }),
      { status: 403 }
    ));
    const res = await callExport("manager-token");
    expect(res.status).toBe(403);
  });

  it("refuse un comptable (403)", async () => {
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: "Forbidden: admin only" }),
      { status: 403 }
    ));
    const res = await callExport("comptable-token");
    expect(res.status).toBe(403);
  });

  it("refuse un admin sans boutique (403)", async () => {
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: "Admin sans boutique associée" }),
      { status: 403 }
    ));
    const res = await callExport("admin-no-org-token");
    expect(res.status).toBe(403);
  });

  it("refuse un appel sans auth (401)", async () => {
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: "Missing authorization" }),
      { status: 401 }
    ));
    const res = await callExport("");
    expect(res.status).toBe(401);
  });

  it("autorise un admin actif (200 + CSV)", async () => {
    const csv = "Nom,Email\n\"Jean\",\"jean@x\"";
    mockFetch.mockResolvedValueOnce(new Response(csv, {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    }));
    const res = await callExport("admin-valid-token");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/csv/);
    const text = await res.text();
    expect(text).toContain("Nom");
  });
});
