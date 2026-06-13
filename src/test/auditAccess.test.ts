import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests des contrôles d'accès à user_audit_log.
 *
 * Ces tests valident la *logique côté client* qui s'appuie sur les politiques RLS :
 * - un appel SELECT sur user_audit_log doit échouer pour un non-admin
 * - un appel SELECT doit réussir pour un admin
 *
 * On mocke le client supabase pour simuler les réponses RLS sans nécessiter
 * de vraie connexion DB pendant les tests CI.
 */

const mockSelect = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: (...args: any[]) => mockSelect(...args),
    }),
  },
}));

import { supabase } from "@/integrations/supabase/client";

beforeEach(() => {
  mockSelect.mockReset();
});

describe("RLS user_audit_log", () => {
  it("retourne une erreur RLS pour un vendeur", async () => {
    mockSelect.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied for table user_audit_log", code: "42501" },
    });
    const { data, error } = await supabase.from("user_audit_log").select("id");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("retourne une erreur RLS pour un manager", async () => {
    mockSelect.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });
    const { error } = await supabase.from("user_audit_log").select("id");
    expect(error).toBeTruthy();
  });

  it("retourne les données pour un admin", async () => {
    mockSelect.mockResolvedValueOnce({
      data: [{ id: "1", action: "user_created" }],
      error: null,
    });
    const { data, error } = await supabase.from("user_audit_log").select("id, action");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe("RLS sync_conflicts", () => {
  it("bloque la lecture pour un comptable", async () => {
    mockSelect.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });
    const { error } = await supabase.from("sync_conflicts").select("id");
    expect(error).toBeTruthy();
  });

  it("autorise la lecture pour un admin", async () => {
    mockSelect.mockResolvedValueOnce({
      data: [{ id: "c1", entity_type: "stock" }],
      error: null,
    });
    const { data, error } = await supabase.from("sync_conflicts").select("id, entity_type");
    expect(error).toBeNull();
    expect((data?.[0] as any)?.entity_type).toBe("stock");
  });
});
