import { describe, it, expect } from "vitest";
import { computeTax } from "@/lib/taxUtils";

describe("computeTax", () => {
  it("retourne le prix tel quel quand le taux est 0", () => {
    const result = computeTax(1000, null, null);
    expect(result.rate).toBe(0);
    expect(result.ttc).toBe(1000);
    expect(result.ht).toBe(1000);
    expect(result.taxAmount).toBe(0);
  });

  it("calcule correctement la taxe avec un taux de 18%", () => {
    const result = computeTax(1180, 18, null);
    expect(result.rate).toBe(18);
    expect(result.ttc).toBe(1180);
    expect(result.ht).toBeCloseTo(1000, 1);
    expect(result.taxAmount).toBeCloseTo(180, 1);
  });

  it("utilise le taux du produit en priorité sur le taux org", () => {
    const result = computeTax(1100, 10, 18);
    expect(result.rate).toBe(10);
    expect(result.ht).toBeCloseTo(1000, 1);
  });

  it("utilise le taux org quand le taux produit est null", () => {
    const result = computeTax(1180, null, 18);
    expect(result.rate).toBe(18);
    expect(result.ht).toBeCloseTo(1000, 1);
  });

  it("utilise le taux org quand le taux produit est undefined", () => {
    const result = computeTax(1180, undefined, 18);
    expect(result.rate).toBe(18);
  });

  it("gère les taux négatifs en les ramenant à 0", () => {
    const result = computeTax(1000, -5, null);
    expect(result.rate).toBe(0);
    expect(result.ht).toBe(1000);
    expect(result.taxAmount).toBe(0);
  });

  it("gère les taux NaN en les ramenant à 0", () => {
    const result = computeTax(1000, NaN, null);
    expect(result.rate).toBe(0);
  });

  it("gère les taux Infinity en les ramenant à 0", () => {
    const result = computeTax(1000, Infinity, null);
    expect(result.rate).toBe(0);
  });

  it("calcule correctement avec un prix de 0", () => {
    const result = computeTax(0, 18, null);
    expect(result.ttc).toBe(0);
    expect(result.ht).toBe(0);
    expect(result.taxAmount).toBe(0);
  });

  it("calcule correctement avec de grands montants (GNF)", () => {
    // 1 000 000 GNF avec 18% TTC
    const result = computeTax(1180000, 18, null);
    expect(result.rate).toBe(18);
    expect(result.ttc).toBe(1180000);
    expect(result.ht).toBeCloseTo(1000000, -1);
  });
});
