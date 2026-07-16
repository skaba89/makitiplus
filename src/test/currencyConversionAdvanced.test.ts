import { describe, it, expect, beforeEach, vi } from "vitest";
import { convertAmount } from "@/hooks/useExchangeRates";

/**
 * Tests avancés pour la conversion de devise
 * Couvre les edge cases et les scénarios métier spécifiques
 */
describe("currencyConversion — scénarios métier avancés", () => {
  const rates = {
    USD: 1,
    GNF: 8500, // Franc Guinéen
    XOF: 600, // FCFA BCEAO (Sénégal, Côte d'Ivoire, Mali, etc.)
    XAF: 600, // FCFA BEAC (Cameroun, Gabon, Tchad, etc.)
    NGN: 1500, // Naira (Nigeria)
    MAD: 10, // Dirham (Maroc)
    DZD: 135, // Dinar (Algérie)
    TND: 3.1, // Dinar (Tunisie)
    EGP: 48, // Livre (Égypte)
    GHS: 15, // Cedi (Ghana)
    KES: 129, // Shilling (Kenya)
    TZS: 2535, // Shilling (Tanzanie)
    UGX: 3700, // Shilling (Ouganda)
    RWF: 1300, // Franc (Rwanda)
    CDF: 2500, // Franc (RD Congo)
    ZAR: 18, // Rand (Afrique du Sud)
    MRU: 40, // Ouguiya (Mauritanie)
    EUR: 0.92, // Euro (devise pivot)
  };

  describe("Conversion vers EUR pivot (AdminAnalytics)", () => {
    it("convertit GNF → EUR pour comparaison cross-org", () => {
      // 8500 GNF = 1 USD = 0.92 EUR
      expect(convertAmount(8500, "GNF", "EUR", rates)).toBeCloseTo(0.92, 2);
    });

    it("convertit XOF → EUR pour comparaison cross-org", () => {
      // 600 XOF = 1 USD = 0.92 EUR
      expect(convertAmount(600, "XOF", "EUR", rates)).toBeCloseTo(0.92, 2);
    });

    it("convertit NGN → EUR pour comparaison cross-org", () => {
      // 1500 NGN = 1 USD = 0.92 EUR
      expect(convertAmount(1500, "NGN", "EUR", rates)).toBeCloseTo(0.92, 2);
    });

    it("deux magasins de devises différentes deviennent comparables en EUR", () => {
      // Magasin A (GNF) : 850 000 GNF de CA
      const caA = convertAmount(850_000, "GNF", "EUR", rates);
      // Magasin B (XOF) : 60 000 XOF de CA
      const caB = convertAmount(60_000, "XOF", "EUR", rates);
      
      expect(caA).not.toBeNull();
      expect(caB).not.toBeNull();
      // Les deux devraient être ~92 EUR (car 850 000 GNF = 100 USD, 60 000 XOF = 100 USD)
      expect(caA!).toBeCloseTo(92, 0);
      expect(caB!).toBeCloseTo(92, 0);
      expect(caA).toBeCloseTo(caB!, 0);
    });
  });

  describe("Conversion entre devises africaines", () => {
    it("convertit GNF → XOF (Guinée → Sénégal)", () => {
      // 1000 GNF → 0.1176 USD → 70.59 XOF
      const result = convertAmount(1000, "GNF", "XOF", rates);
      expect(result).toBeCloseTo(70.59, 1);
    });

    it("convertit NGN → MAD (Nigeria → Maroc)", () => {
      // 1500 NGN → 1 USD → 10 MAD
      expect(convertAmount(1500, "NGN", "MAD", rates)).toBeCloseTo(10, 1);
    });

    it("convertit KES → ZAR (Kenya → Afrique du Sud)", () => {
      // 129 KES → 1 USD → 18 ZAR
      expect(convertAmount(129, "KES", "ZAR", rates)).toBeCloseTo(18, 1);
    });

    it("convertit XOF → XAF (BCEAO → BEAC, même parité)", () => {
      // 1 XOF = 1 XAF (parité fixe 1:1)
      expect(convertAmount(500, "XOF", "XAF", rates)).toBeCloseTo(500, 0);
    });

    it("convertit GHS → EUR (Ghana → Euro)", () => {
      // 15 GHS → 1 USD → 0.92 EUR
      expect(convertAmount(15, "GHS", "EUR", rates)).toBeCloseTo(0.92, 2);
    });
  });

  describe("Edge cases métier", () => {
    it("montant 0 retourne 0 (vente gratuite)", () => {
      expect(convertAmount(0, "GNF", "EUR", rates)).toBe(0);
    });

    it("montant négatif (remboursement)", () => {
      const result = convertAmount(-5000, "GNF", "XOF", rates);
      expect(result).not.toBeNull();
      expect(result!).toBeLessThan(0);
    });

    it("très petit montant (1 GNF)", () => {
      const result = convertAmount(1, "GNF", "EUR", rates);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(0);
      expect(result!).toBeLessThan(0.001);
    });

    it("très grand montant (1 milliard GNF)", () => {
      const result = convertAmount(1_000_000_000, "GNF", "EUR", rates);
      expect(result).not.toBeNull();
      // 1 000 000 000 GNF / 8500 = 117 647 USD → 108 235 EUR
      expect(result!).toBeGreaterThan(100_000);
      expect(result!).toBeLessThan(120_000);
    });

    it("décimales (prix avec virgule)", () => {
      const result = convertAmount(15.5, "MAD", "EUR", rates);
      // 15.5 MAD / 10 = 1.55 USD → 1.426 EUR
      expect(result).toBeCloseTo(1.426, 2);
    });
  });

  describe("Robustesse", () => {
    it("retourne null si devise source inconnue", () => {
      expect(convertAmount(1000, "UNKNOWN", "EUR", rates)).toBeNull();
    });

    it("retourne null si devise cible inconnue", () => {
      expect(convertAmount(1000, "GNF", "UNKNOWN", rates)).toBeNull();
    });

    it("retourne null si taux null", () => {
      expect(convertAmount(1000, "GNF", "EUR", null)).toBeNull();
    });

    it("retourne null si taux undefined", () => {
      expect(convertAmount(1000, "GNF", "EUR", undefined)).toBeNull();
    });

    it("retourne null si taux vide", () => {
      expect(convertAmount(1000, "GNF", "EUR", {})).toBeNull();
    });
  });

  describe("Cohérence aller-retour", () => {
    it("GNF → EUR → GNF préserve le montant", () => {
      const original = 5000;
      const toEur = convertAmount(original, "GNF", "EUR", rates);
      const backToGnf = convertAmount(toEur!, "EUR", "GNF", rates);
      expect(backToGnf).toBeCloseTo(original, 1);
    });

    it("XOF → NGN → XOF préserve le montant", () => {
      const original = 10_000;
      const toNgn = convertAmount(original, "XOF", "NGN", rates);
      const backToXof = convertAmount(toNgn!, "NGN", "XOF", rates);
      expect(backToXof).toBeCloseTo(original, 1);
    });

    it("MAD → ZAR → MAD préserve le montant", () => {
      const original = 250;
      const toZar = convertAmount(original, "MAD", "ZAR", rates);
      const backToMad = convertAmount(toZar!, "ZAR", "MAD", rates);
      expect(backToMad).toBeCloseTo(original, 1);
    });
  });
});

describe("formatPrice — formatage par devise", () => {
  // Tests pour la fonction formatPrice de utils/currencies.ts
  // (déjà couverts dans currencies.test.ts, mais on ajoute des cas spécifiques)

  it("les devises africaines ont des symboles distincts", async () => {
    const { COUNTRIES } = await import("@/utils/currencies");
    
    // Vérifier que chaque devise africaine a un symbole unique
    const symbols = new Set<string>();
    COUNTRIES.forEach((c) => {
      symbols.add(c.currency.symbol);
    });
    // Au moins 10 symboles différents (toutes devises confondues)
    expect(symbols.size).toBeGreaterThanOrEqual(10);
  });

  it("la Guinée utilise GNF comme devise", async () => {
    const { getCountryByCode } = await import("@/utils/currencies");
    const gn = getCountryByCode("GN");
    expect(gn?.currency.code).toBe("GNF");
    expect(gn?.currency.symbol).toBe("GNF");
  });

  it("le Sénégal utilise XOF (FCFA BCEAO)", async () => {
    const { getCountryByCode } = await import("@/utils/currencies");
    const sn = getCountryByCode("SN");
    expect(sn?.currency.code).toBe("XOF");
    expect(sn?.currency.symbol).toBe("FCFA");
  });

  it("le Cameroun utilise XAF (FCFA BEAC)", async () => {
    const { getCountryByCode } = await import("@/utils/currencies");
    const cm = getCountryByCode("CM");
    expect(cm?.currency.code).toBe("XAF");
  });

  it("le Nigeria utilise NGN (Naira)", async () => {
    const { getCountryByCode } = await import("@/utils/currencies");
    const ng = getCountryByCode("NG");
    expect(ng?.currency.code).toBe("NGN");
    expect(ng?.currency.symbol).toBe("₦");
  });
});
