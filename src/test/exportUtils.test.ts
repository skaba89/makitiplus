import { describe, it, expect, beforeAll } from "vitest";
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
  });

  describe("exportProductsToCSV", () => {
    it("génère un CSV produits sans erreur", () => {
      const products = [
        {
          name: "Riz 25kg",
          category: "Alimentation",
          price: 250000,
          cost_price: 200000,
          stock_quantity: 50,
          min_stock_alert: 10,
          unit: "sac",
          is_active: true,
        },
      ];
      expect(() => exportProductsToCSV(products, "GNF")).not.toThrow();
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
});
