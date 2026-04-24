import { describe, it, expect } from "vitest";
import { mergeStockDelta, lastWriteWins } from "@/lib/syncConflictResolver";

describe("mergeStockDelta", () => {
  it("additionne correctement les deltas concurrents", () => {
    // Stock initial connu : 100
    // Appareil A vend 5 → local_new = 95
    // Appareil B vend 3 → remote_new = 97
    // Résultat attendu : 92 (les 8 ventes prises en compte)
    expect(mergeStockDelta(100, 95, 97)).toBe(92);
  });

  it("ne descend jamais sous zéro", () => {
    expect(mergeStockDelta(10, 0, 0)).toBe(0);
    expect(mergeStockDelta(5, -2, 1)).toBe(0);
  });

  it("applique un réapprovisionnement local avec une vente distante", () => {
    // Stock 50, A ajoute +20 (local=70), B vend 5 (remote=45)
    // Attendu : 45 + (70-50) = 65
    expect(mergeStockDelta(50, 70, 45)).toBe(65);
  });
});

describe("lastWriteWins", () => {
  it("garde la version distante si plus récente", () => {
    const local = { name: "A", updated_at: "2026-01-01T10:00:00Z" };
    const remote = { name: "B", updated_at: "2026-01-01T11:00:00Z" };
    expect(lastWriteWins(local, remote)).toEqual(remote);
  });

  it("garde la version locale si plus récente", () => {
    const local = { name: "A", updated_at: "2026-01-02T10:00:00Z" };
    const remote = { name: "B", updated_at: "2026-01-01T10:00:00Z" };
    expect(lastWriteWins(local, remote)).toEqual(local);
  });

  it("préfère la version avec timestamp si l'autre est nulle", () => {
    const local = { name: "A", updated_at: null };
    const remote = { name: "B", updated_at: "2026-01-01T10:00:00Z" };
    expect(lastWriteWins(local, remote)).toEqual(remote);
  });
});
