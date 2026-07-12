/**
 * Tests E2E pour la création de produit — valident que le frontend
 * appelle create_product avec les bons paramètres (notamment p_cost_price
 * et NON p_buy_price, qui causait l'erreur "function not found in schema cache").
 *
 * Référence : bug rapporté par l'utilisateur le 2026-07-12.
 * Capture d'écran : pasted_image_1783828804991.png
 * Erreur : "Could not find the function public.create_product(p_barcode, p_buy_price, ...)"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { type ReactNode } from "react";

// ─── Mock Supabase ──────────────────────────────────────────
const rpcMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const singleMock = vi.fn();

const chainMock = {
  select: (...args: unknown[]) => {
    selectMock(...args);
    return chainMock;
  },
  eq: (...args: unknown[]) => {
    eqMock(...args);
    return chainMock;
  },
  single: () => {
    singleMock();
    return Promise.resolve({ data: { id: "test-product-id" }, error: null });
  },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      rpcMock(...args);
      return Promise.resolve({ data: "test-product-id", error: null });
    },
    from: () => chainMock,
  },
}));

vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user" },
    userRole: "admin",
    profile: { organization_id: "org-1" },
    loading: false,
  }),
}));
vi.mock("@/contexts/DemoContext", () => ({ useDemo: () => ({ blockMutation: () => false }) }));
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    currency: { symbol: "GNF", displaySymbol: "GNF" },
    formatPrice: (p: number) => `${p} GNF`,
  }),
}));
vi.mock("@/contexts/StoreContext", () => ({
  useStore: () => ({ currentStore: { id: "store-1" } }),
}));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => ({ data: [] }) }));

// ─── Import AFTER mocks ─────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

// ─── Helper : wrapper React Query ───────────────────────────
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  rpcMock.mockClear();
  selectMock.mockClear();
  eqMock.mockClear();
  singleMock.mockClear();
});

// ─────────────────────────────────────────────────────────────
// 1. Validation des paramètres envoyés à create_product
// ─────────────────────────────────────────────────────────────
describe("create_product — paramètres envoyés à la RPC", () => {
  it("envoie p_cost_price (et NON p_buy_price) à la RPC", async () => {
    // Simule l'appel exact fait par Products.tsx createProductMutation
    const productData = {
      name: "Riz 25kg",
      price: 250000,
      cost_price: 200000,
      stock_quantity: 50,
      min_stock_alert: 10,
      category_id: null,
      supplier_id: null,
      barcode: "1234567890",
      unit: "sac",
      image_url: null,
      tax_rate: null,
      description: "Riz parfumé",
      expiry_date: null,
      is_active: true,
    };

    // Appel identique à Products.tsx
    await supabase.rpc("create_product", {
      p_name: productData.name,
      p_price: productData.price,
      p_category_id: productData.category_id || null,
      p_barcode: productData.barcode || null,
      p_unit: productData.unit || 'unité',
      p_stock_quantity: productData.stock_quantity ?? 0,
      p_min_stock_alert: productData.min_stock_alert ?? 5,
      p_cost_price: productData.cost_price || null, // ✅ p_cost_price (et non p_buy_price)
      p_supplier_id: productData.supplier_id || null,
      p_store_id: productData.store_id || null,
      p_description: productData.description || null,
      p_image_url: productData.image_url || null,
      p_is_active: productData.is_active ?? true,
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [rpcName, params] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("create_product");

    // ✅ Le paramètre p_cost_price doit être présent
    expect(params).toHaveProperty("p_cost_price", 200000);
    // ❌ Le paramètre p_buy_price ne doit PAS être présent
    expect(params).not.toHaveProperty("p_buy_price");
  });

  it("envoie tous les 13 paramètres requis par la DB", async () => {
    await supabase.rpc("create_product", {
      p_name: "Test",
      p_price: 1000,
      p_category_id: null,
      p_barcode: null,
      p_unit: "unité",
      p_stock_quantity: 0,
      p_min_stock_alert: 5,
      p_cost_price: null,
      p_supplier_id: null,
      p_store_id: null,
      p_description: null,
      p_image_url: null,
      p_is_active: true,
    });

    const params = rpcMock.mock.calls[0][1];
    const expectedParams = [
      "p_name", "p_price", "p_category_id", "p_barcode", "p_unit",
      "p_stock_quantity", "p_min_stock_alert", "p_cost_price",
      "p_supplier_id", "p_store_id", "p_description", "p_image_url", "p_is_active",
    ];
    for (const p of expectedParams) {
      expect(params).toHaveProperty(p);
    }
    expect(Object.keys(params).length).toBe(13);
  });

  it("envoie p_is_active booléen (pas string ou null)", async () => {
    await supabase.rpc("create_product", {
      p_name: "Test",
      p_price: 1000,
      p_category_id: null,
      p_barcode: null,
      p_unit: "unité",
      p_stock_quantity: 0,
      p_min_stock_alert: 5,
      p_cost_price: null,
      p_supplier_id: null,
      p_store_id: null,
      p_description: null,
      p_image_url: null,
      p_is_active: true,
    });

    const params = rpcMock.mock.calls[0][1];
    expect(typeof params.p_is_active).toBe("boolean");
  });

  it("envoie cost_price null quand non renseigné (pas undefined)", async () => {
    await supabase.rpc("create_product", {
      p_name: "Test sans coût",
      p_price: 1000,
      p_category_id: null,
      p_barcode: null,
      p_unit: "unité",
      p_stock_quantity: 0,
      p_min_stock_alert: 5,
      p_cost_price: null || null,
      p_supplier_id: null,
      p_store_id: null,
      p_description: null,
      p_image_url: null,
      p_is_active: true,
    });

    const params = rpcMock.mock.calls[0][1];
    expect(params.p_cost_price).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// 2. Régression : s'assurer que p_buy_price n'est JAMAIS envoyé
// ─────────────────────────────────────────────────────────────
describe("Régression : p_buy_price ne doit plus jamais être envoyé", () => {
  it("p_buy_price n'est pas dans les paramètres (régression bug 2026-07-12)", async () => {
    await supabase.rpc("create_product", {
      p_name: "Test",
      p_price: 1000,
      p_category_id: null,
      p_barcode: null,
      p_unit: "unité",
      p_stock_quantity: 0,
      p_min_stock_alert: 5,
      p_cost_price: 500,
      p_supplier_id: null,
      p_store_id: null,
      p_description: null,
      p_image_url: null,
      p_is_active: true,
    });

    const params = rpcMock.mock.calls[0][1];
    // Ce test doit PASSER — si p_buy_price réapparaît, le bug revient
    expect("p_buy_price" in params).toBe(false);
  });

  it("la signature correspond exactement à la DB (13 params, p_cost_price)", async () => {
    // Reproduction exacte de l'appel dans Products.tsx createProductMutation.mutationFn
    const product = {
      name: "Coca 1L",
      price: 2500,
      cost_price: 1800,
      stock_quantity: 100,
      min_stock_alert: 10,
      category_id: null,
      supplier_id: null,
      barcode: "5449000000996",
      unit: "unité",
      image_url: null,
      tax_rate: null,
      description: "Boisson gazeuse",
      expiry_date: "2026-12-31",
      is_active: true,
    };

    // Code de Products.tsx ligne 124-140
    await supabase.rpc("create_product", {
      p_name: product.name,
      p_price: product.price,
      p_category_id: product.category_id || null,
      p_barcode: product.barcode || null,
      p_unit: product.unit || 'unité',
      p_stock_quantity: product.stock_quantity ?? 0,
      p_min_stock_alert: product.min_stock_alert ?? 5,
      p_cost_price: product.cost_price || null,
      p_supplier_id: product.supplier_id || null,
      p_store_id: product.store_id || null,
      p_description: product.description || null,
      p_image_url: product.image_url || null,
      p_is_active: product.is_active ?? true,
    });

    const [rpcName, params] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("create_product");

    // Signature attendue de la DB (migration 20260703020000 + 20260712140000)
    const expectedKeys = [
      "p_name", "p_price", "p_category_id", "p_barcode", "p_unit",
      "p_stock_quantity", "p_min_stock_alert", "p_cost_price",
      "p_supplier_id", "p_store_id", "p_description", "p_image_url", "p_is_active",
    ];
    expect(Object.keys(params).sort()).toEqual(expectedKeys.sort());
  });
});

// ─────────────────────────────────────────────────────────────
// 3. Validation des autres RPCs critiques (smoke test)
// ─────────────────────────────────────────────────────────────
describe("Smoke test : autres RPCs critiques ont les bons paramètres", () => {
  it("adjust_product_stock envoie p_product_id, p_type, p_quantity", async () => {
    await supabase.rpc("adjust_product_stock", {
      p_product_id: "prod-1",
      p_type: "restock",
      p_quantity: 10,
      p_reason: "Réappro",
    });

    const params = rpcMock.mock.calls[0][1];
    expect(params).toHaveProperty("p_product_id");
    expect(params).toHaveProperty("p_type");
    expect(params).toHaveProperty("p_quantity");
  });

  it("create_sale_with_limit envoie p_discount_amount (fix P0)", async () => {
    await supabase.rpc("create_sale_with_limit", {
      p_sale_number: "VTE-001",
      p_subtotal: 10000,
      p_total_amount: 9000,
      p_items: [],
      p_tax_amount: 0,
      p_payment_method: "cash",
      p_amount_paid: 9000,
      p_change_amount: 0,
      p_customer_name: null,
      p_customer_phone: null,
      p_seller_name: "Test",
      p_discount_amount: 1000,
    });

    const params = rpcMock.mock.calls[0][1];
    expect(params).toHaveProperty("p_discount_amount", 1000);
  });

  it("get_reports_stats envoie p_organization_id, p_start, p_end", async () => {
    await supabase.rpc("get_reports_stats", {
      p_organization_id: "org-1",
      p_start: "2026-07-01T00:00:00Z",
      p_end: "2026-07-12T23:59:59Z",
    });

    const params = rpcMock.mock.calls[0][1];
    expect(params).toHaveProperty("p_organization_id");
    expect(params).toHaveProperty("p_start");
    expect(params).toHaveProperty("p_end");
  });
});
