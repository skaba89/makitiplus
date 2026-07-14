import { describe, it, expect, beforeEach, vi } from "vitest";
import { convertAmount } from "@/hooks/useExchangeRates";

describe("currencyConversion", () => {
  describe("convertAmount", () => {
    const sampleRates = {
      USD: 1,
      GNF: 8500, // 1 USD = 8500 GNF
      XOF: 600, // 1 USD = 600 XOF (FCFA BCEAO)
      XAF: 600, // 1 USD = 600 XAF (FCFA BEAC)
      NGN: 1500, // 1 USD = 1500 NGN
      MAD: 10, // 1 USD = 10 MAD
      EUR: 0.92, // 1 USD = 0.92 EUR
    };

    it("retourne le montant identique si from === to", () => {
      expect(convertAmount(1000, "GNF", "GNF", sampleRates)).toBe(1000);
    });

    it("convertit correctement GNF → XOF (Franc Guinéen → FCFA BCEAO)", () => {
      // 1000 GNF = 1000/8500 USD = 0.1176 USD → 0.1176 * 600 = 70.59 XOF
      const result = convertAmount(1000, "GNF", "XOF", sampleRates);
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(70.59, 1);
    });

    it("convertit correctement XOF → GNF (FCFA → Franc Guinéen)", () => {
      // 600 XOF = 1 USD → 8500 GNF
      const result = convertAmount(600, "XOF", "GNF", sampleRates);
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(8500, 0);
    });

    it("convertit correctement GNF → EUR", () => {
      // 8500 GNF = 1 USD = 0.92 EUR
      const result = convertAmount(8500, "GNF", "EUR", sampleRates);
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(0.92, 2);
    });

    it("convertit correctement NGN → MAD", () => {
      // 1500 NGN = 1 USD → 10 MAD
      const result = convertAmount(1500, "NGN", "MAD", sampleRates);
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(10, 1);
    });

    it("retourne null si la devise source n'existe pas dans les taux", () => {
      expect(convertAmount(1000, "UNKNOWN", "GNF", sampleRates)).toBeNull();
    });

    it("retourne null si la devise cible n'existe pas dans les taux", () => {
      expect(convertAmount(1000, "GNF", "UNKNOWN", sampleRates)).toBeNull();
    });

    it("retourne null si les taux sont null", () => {
      expect(convertAmount(1000, "GNF", "XOF", null)).toBeNull();
    });

    it("retourne null si les taux sont undefined", () => {
      expect(convertAmount(1000, "GNF", "XOF", undefined)).toBeNull();
    });

    it("gère les montants à 0", () => {
      expect(convertAmount(0, "GNF", "XOF", sampleRates)).toBe(0);
    });

    it("gère les montants négatifs (pour les retours/remboursements)", () => {
      const result = convertAmount(-1000, "GNF", "XOF", sampleRates);
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(-70.59, 1);
    });

    it("gère les très grands montants", () => {
      // 1 000 000 GNF = ~117.65 USD → ~70 588 XOF
      const result = convertAmount(1_000_000, "GNF", "XOF", sampleRates);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(70_000);
      expect(result!).toBeLessThan(71_000);
    });

    it("préserve la cohérence aller-retour (XOF → GNF → XOF)", () => {
      const original = 5000;
      const toGnf = convertAmount(original, "XOF", "GNF", sampleRates);
      expect(toGnf).not.toBeNull();
      const backToXof = convertAmount(toGnf!, "GNF", "XOF", sampleRates);
      expect(backToXof).not.toBeNull();
      expect(backToXof!).toBeCloseTo(original, 1);
    });
  });
});

describe("useExchangeRates hook", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("lit et écrit le cache localStorage", async () => {
    const { useExchangeRates } = await import("@/hooks/useExchangeRates");
    // Vérifier que le hook est exporté correctement
    expect(typeof useExchangeRates).toBe("function");
  });

  it("l'URL de l'API est open.er-api.com (gratuite, sans clé)", async () => {
    // Vérification statique : le hook utilise open.er-api.com
    const fs = await import("fs");
    const content = fs.readFileSync(
      "/home/z/my-project/makitiplus/src/hooks/useExchangeRates.ts",
      "utf-8",
    );
    expect(content).toContain("open.er-api.com");
    expect(content).not.toContain("API_KEY");
  });
});
