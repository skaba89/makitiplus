import { describe, it, expect } from "vitest";
import {
  formatPrice,
  getCountryByCode,
  getCurrencyByCode,
  UNIQUE_CURRENCIES,
  DEFAULT_CURRENCY,
  COUNTRIES,
} from "@/utils/currencies";

describe("currencies.ts", () => {
  describe("formatPrice", () => {
    it("formate un prix avec GNF (position after)", () => {
      const gnf = { code: "GNF", symbol: "GNF", displaySymbol: "GNF", name: "Franc Guinéen", position: "after" as const, decimals: 0 };
      const result = formatPrice(5000, gnf);
      expect(result).toContain("5");
      expect(result).toContain("000");
      expect(result).toContain("GNF");
    });

    it("formate un prix avec FCFA (position after)", () => {
      const xof = { code: "XOF", symbol: "FCFA", displaySymbol: "F", name: "Franc CFA", position: "after" as const, decimals: 0 };
      const result = formatPrice(1500, xof);
      expect(result).toContain("1");
      expect(result).toContain("500");
      expect(result).toContain("F");
    });

    it("formate un prix avec NGN (position before)", () => {
      const ngn = { code: "NGN", symbol: "₦", displaySymbol: "₦", name: "Naira", position: "before" as const, decimals: 2 };
      const result = formatPrice(1500, ngn);
      expect(result).toContain("₦");
      expect(result).toContain("1");
    });

    it("formate les grands montants avec séparateur de milliers", () => {
      const gnf = { code: "GNF", symbol: "GNF", displaySymbol: "GNF", name: "Franc Guinéen", position: "after" as const, decimals: 0 };
      const result = formatPrice(1000000, gnf);
      expect(result).toContain("000");
      expect(result).toContain("GNF");
    });

    it("formate 0 correctement", () => {
      const gnf = { code: "GNF", symbol: "GNF", displaySymbol: "GNF", name: "Franc Guinéen", position: "after" as const, decimals: 0 };
      const result = formatPrice(0, gnf);
      expect(result).toContain("0");
      expect(result).toContain("GNF");
    });

    it("respecte les décimales pour MAD", () => {
      const mad = { code: "MAD", symbol: "DH", displaySymbol: "DH", name: "Dirham", position: "after" as const, decimals: 2 };
      const result = formatPrice(15.5, mad);
      expect(result).toContain("15,50");
    });
  });

  describe("getCountryByCode", () => {
    it("retourne la Guinée pour GN", () => {
      const country = getCountryByCode("GN");
      expect(country?.name).toBe("Guinée");
      expect(country?.currency.code).toBe("GNF");
    });

    it("retourne le Sénégal pour SN", () => {
      const country = getCountryByCode("SN");
      expect(country?.name).toBe("Sénégal");
      expect(country?.currency.code).toBe("XOF");
    });

    it("retourne undefined pour un code invalide", () => {
      const country = getCountryByCode("XX");
      expect(country).toBeUndefined();
    });
  });

  describe("getCurrencyByCode", () => {
    it("retourne le GNF pour le code GNF", () => {
      const currency = getCurrencyByCode("GNF");
      expect(currency?.name).toBe("Franc Guinéen");
      expect(currency?.displaySymbol).toBe("GNF");
    });

    it("retourne le XOF pour le code XOF", () => {
      const currency = getCurrencyByCode("XOF");
      expect(currency?.symbol).toBe("FCFA");
    });

    it("retourne undefined pour un code invalide", () => {
      const currency = getCurrencyByCode("EUR");
      expect(currency).toBeUndefined();
    });
  });

  describe("DEFAULT_CURRENCY", () => {
    it("est le Franc Guinéen", () => {
      expect(DEFAULT_CURRENCY.code).toBe("GNF");
      expect(DEFAULT_CURRENCY.displaySymbol).toBe("GNF");
      expect(DEFAULT_CURRENCY.position).toBe("after");
      expect(DEFAULT_CURRENCY.decimals).toBe(0);
    });
  });

  describe("UNIQUE_CURRENCIES", () => {
    it("ne contient pas de doublons de codes", () => {
      const codes = UNIQUE_CURRENCIES.map((c) => c.code);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });

    it("contient au moins 15 devises africaines", () => {
      expect(UNIQUE_CURRENCIES.length).toBeGreaterThanOrEqual(15);
    });
  });

  describe("COUNTRIES", () => {
    it("contient au moins 27 pays africains", () => {
      expect(COUNTRIES.length).toBeGreaterThanOrEqual(27);
    });

    it("tous les pays ont un code à 2 lettres", () => {
      for (const country of COUNTRIES) {
        expect(country.code).toHaveLength(2);
      }
    });

    it("tous les pays ont une devise avec les champs requis", () => {
      for (const country of COUNTRIES) {
        expect(country.currency.code).toBeTruthy();
        expect(country.currency.symbol).toBeTruthy();
        expect(country.currency.displaySymbol).toBeTruthy();
        expect(country.currency.name).toBeTruthy();
        expect(["before", "after"]).toContain(country.currency.position);
        expect(typeof country.currency.decimals).toBe("number");
      }
    });

    it("la Guinée a bien le displaySymbol GNF (pas F)", () => {
      const gn = COUNTRIES.find((c) => c.code === "GN");
      expect(gn?.currency.displaySymbol).toBe("GNF");
    });
  });
});
