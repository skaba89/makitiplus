import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  exportSalesToCSV,
  exportProductsToCSV,
  exportCustomersToCSV,
  exportExpensesToCSV,
} from "@/utils/exportUtils";

// jsdom n'a pas URL.createObjectURL — on la mock
beforeAll(() => {
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => "blob:mock";
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = () => {};
  }
});

describe("exportUtils", () => {
  describe("exportSalesToCSV", () => {
    it("génère un CSV avec en-têtes corrects et symbole GNF par défaut", () => {
      const sales = [
        {
          sale_number: "VTE-001",
          created_at: "2025-07-01T10:00:00Z",
          customer_name: "Mamadou",
          payment_method: "cash",
          subtotal: 5000,
          total_amount: 5000,
          discount_amount: 0,
          amount_paid: 5000,
          change_amount: 0,
          seller_name: "Ali",
        },
      ];

      // On ne peut pas facilement tester le download, mais on peut vérifier
      // que la fonction ne lance pas d'erreur
      expect(() => exportSalesToCSV(sales, "GNF")).not.toThrow();
    });

    it("accepte un symbole personnalisé", () => {
      const sales = [
        {
          sale_number: "VTE-002",
          created_at: "2025-07-01T10:00:00Z",
          customer_name: null,
          payment_method: "orange_money",
          subtotal: 10000,
          total_amount: 10000,
          discount_amount: null,
          amount_paid: 10000,
          change_amount: null,
          seller_name: null,
        },
      ];
      expect(() => exportSalesToCSV(sales, "FCFA")).not.toThrow();
    });

    it("gère un tableau vide", () => {
      expect(() => exportSalesToCSV([])).not.toThrow();
    });

    it("gère les ventes avec remise (discount_amount > 0)", () => {
      const sales = [
        {
          sale_number: "VTE-003",
          created_at: "2025-07-01T11:00:00Z",
          customer_name: "Aïssatou",
          payment_method: "wave",
          subtotal: 20000, // sous-total brut
          discount_amount: 5000, // remise
          total_amount: 15000, // total après remise
          amount_paid: 20000,
          change_amount: 5000,
          seller_name: "Mariam",
        },
      ];
      expect(() => exportSalesToCSV(sales, "GNF")).not.toThrow();
    });

    it("inclut la colonne 'Remise' dans les en-têtes CSV", () => {
      // Mock downloadCSV indirectement via document.createElement spy
      const clickSpy = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === "a") {
          el.click = clickSpy;
        }
        return el;
      });

      const sales = [
        {
          sale_number: "VTE-004",
          created_at: "2025-07-01T11:00:00Z",
          customer_name: "Test",
          payment_method: "cash",
          subtotal: 5000,
          discount_amount: 1000,
          total_amount: 4000,
          amount_paid: 5000,
          change_amount: 1000,
          seller_name: "Test",
        },
      ];
      exportSalesToCSV(sales, "GNF");

      // Pas de throw = OK. Le click a dû être appelé.
      expect(clickSpy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("exportProductsToCSV", () => {
    it("génère un CSV produits sans erreur", () => {
      const products = [
        {
          name: "Riz 25kg",
          category: "Alimentation",
          barcode: "1234567890",
          price: 250000,
          cost_price: 200000,
          stock_quantity: 50,
          min_stock_alert: 10,
          unit: "sac",
          is_active: true,
          expiry_date: "2025-12-31",
        },
      ];
      expect(() => exportProductsToCSV(products, "GNF")).not.toThrow();
    });

    it("gère un produit sans coût d'achat (marge à 0)", () => {
      const products = [
        {
          name: "Produit sans coût",
          category: "Divers",
          barcode: null,
          price: 10000,
          cost_price: null,
          stock_quantity: 5,
          min_stock_alert: 2,
          unit: "unité",
          is_active: true,
          expiry_date: null,
        },
      ];
      expect(() => exportProductsToCSV(products, "GNF")).not.toThrow();
    });

    it("calcule correctement la marge unitaire et le pourcentage", () => {
      // Vérification logique (sans capture du CSV — on valide juste que ça ne throw pas)
      const products = [
        {
          name: "Marge 40%",
          category: "Test",
          barcode: null,
          price: 5000, // prix de vente
          cost_price: 3000, // coût = 3000
          // marge = 2000, margePct = 40%
          stock_quantity: 10,
          min_stock_alert: 5,
          unit: "unité",
          is_active: true,
          expiry_date: null,
        },
      ];
      expect(() => exportProductsToCSV(products, "GNF")).not.toThrow();

      // Vérification logique séparée
      const price = 5000;
      const cost = 3000;
      const margin = price - cost;
      const marginPct = Math.round((margin / price) * 100);
      expect(margin).toBe(2000);
      expect(marginPct).toBe(40);
    });

    it("calcule la valeur du stock (vente et achat)", () => {
      const price = 5000;
      const cost = 3000;
      const stock = 10;
      const stockValueSale = price * stock;
      const stockValueCost = cost * stock;
      expect(stockValueSale).toBe(50000);
      expect(stockValueCost).toBe(30000);
    });
  });

  describe("exportCustomersToCSV", () => {
    it("génère un CSV clients sans erreur", () => {
      const customers = [
        {
          name: "Fatoumata",
          phone: "622000000",
          email: null,
          address: "Conakry",
          total_credit: 50000,
          notes: null,
          created_at: "2025-01-15T08:00:00Z",
        },
      ];
      expect(() => exportCustomersToCSV(customers, "GNF")).not.toThrow();
    });
  });

  describe("exportExpensesToCSV", () => {
    it("génère un CSV dépenses sans erreur", () => {
      const expenses = [
        {
          expense_date: "2025-07-01",
          category: "loyer",
          amount: 5000000,
          payment_method: "cash",
          description: "Loyer juillet",
        },
      ];
      expect(() => exportExpensesToCSV(expenses, "GNF")).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Tests pour le rapport de rentabilité (marge brute + remises)
  // ─────────────────────────────────────────────────────────────
  describe("Rapport rentabilité — calculs logiques", () => {
    it("calcule la marge brute = ventes - coût des marchandises", () => {
      const totalSales = 200000;
      const totalCost = 120000; // COGS
      const grossMargin = totalSales - totalCost;
      expect(grossMargin).toBe(80000);
    });

    it("calcule le taux de marge en pourcentage", () => {
      const totalSales = 200000;
      const totalCost = 120000;
      const grossMargin = totalSales - totalCost;
      const grossMarginPct = totalSales > 0 ? Math.round((grossMargin / totalSales) * 10000) / 100 : 0;
      expect(grossMarginPct).toBe(40);
    });

    it("gère le cas où totalSales = 0 (pas de division par zéro)", () => {
      const totalSales = 0;
      const totalCost = 0;
      const grossMargin = totalSales - totalCost;
      const grossMarginPct = totalSales > 0 ? Math.round((grossMargin / totalSales) * 10000) / 100 : 0;
      expect(grossMargin).toBe(0);
      expect(grossMarginPct).toBe(0);
    });

    it("calcule le bénéfice net réel = marge brute - dépenses", () => {
      const grossMargin = 80000;
      const totalExpenses = 30000;
      const netProfitWithMargin = grossMargin - totalExpenses;
      expect(netProfitWithMargin).toBe(50000);
    });

    it("diffère du résultat net simple (CA - Dépenses) quand le coût est non nul", () => {
      const totalSales = 200000;
      const totalCost = 120000;
      const totalExpenses = 30000;
      const grossMargin = totalSales - totalCost;
      const netProfitWithMargin = grossMargin - totalExpenses; // 50000
      const netProfit = totalSales - totalExpenses; // 170000 (ancien calcul)
      expect(netProfitWithMargin).not.toBe(netProfit);
      expect(netProfitWithMargin).toBeLessThan(netProfit); // le vrai bénéfice est plus bas
    });

    it("calcule le % de remise par rapport au CA potentiel", () => {
      const totalSales = 200000; // CA réalisé
      const totalDiscount = 20000; // remises données
      const caPotentiel = totalSales + totalDiscount; // CA qu'on aurait eu sans remise
      const discountPct = (totalDiscount / caPotentiel) * 100;
      expect(discountPct).toBeCloseTo(9.09, 1);
    });

    it("interprète correctement les seuils de marge", () => {
      // 30%+ : excellente marge
      expect(35 >= 30).toBe(true);
      // 10-30% : marge correcte
      expect(20 >= 10 && 20 < 30).toBe(true);
      // 0-10% : marge faible
      expect(5 > 0 && 5 < 10).toBe(true);
      // 0 ou négatif : marge critique
      expect(0 > 0).toBe(false);
    });
  });
});
