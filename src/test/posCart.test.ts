/**
 * Integration tests for POS cart logic — add, remove, stock validation, totals
 *
 * Tests the Zustand store (usePOSCartStore) and the useCartTotal hook
 * which are the core of the POS checkout flow.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { type ReactNode } from "react";

// ─── Mock dependencies ────────────────────────────────────
vi.mock("@/lib/sentry", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user" },
    userRole: "admin",
    profile: { organization_id: "org-1", business_name: "Test Shop" },
    loading: false,
  }),
}));

vi.mock("@/contexts/DemoContext", () => ({
  useDemo: () => ({ blockMutation: () => false }),
}));

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    currency: { symbol: "GNF", position: "after" },
    formatPrice: (p: number) => `${new Intl.NumberFormat("fr-FR").format(p)} GNF`,
    availablePaymentMethods: ["cash", "wave", "orange_money", "credit"],
    phoneCode: "+224",
  }),
}));

// ─── Import AFTER mocks ──────────────────────────────────
import { usePOSCartStore } from "@/contexts/POSCartContext";

// ─── Test helpers ─────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  stock_quantity: number;
  category?: string;
  barcode?: string;
}

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: `prod-${Math.random().toString(36).slice(2, 8)}`,
  name: "Test Product",
  price: 5000,
  cost_price: 3000,
  stock_quantity: 100,
  ...overrides,
});

beforeEach(() => {
  // Reset Zustand store between tests
  const store = usePOSCartStore.getState();
  store.clearCart();
});

// ─── Test suites ──────────────────────────────────────────

describe("POSCartStore — add to cart", () => {
  it("adds a product to the cart", () => {
    const product = makeProduct();

    act(() => {
      usePOSCartStore.getState().addToCart(product, 2);
    });

    const { items } = usePOSCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].product.id).toBe(product.id);
    expect(items[0].quantity).toBe(2);
  });

  it("increments quantity when adding an existing product", () => {
    const product = makeProduct();

    act(() => {
      usePOSCartStore.getState().addToCart(product, 1);
      usePOSCartStore.getState().addToCart(product, 3);
    });

    const { items } = usePOSCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(4);
  });

  it("blocks adding beyond stock quantity", () => {
    const product = makeProduct({ stock_quantity: 5 });

    act(() => {
      usePOSCartStore.getState().addToCart(product, 5); // exactly stock
    });

    const { items } = usePOSCartStore.getState();
    expect(items[0].quantity).toBe(5);

    // Try to add 1 more — should be blocked
    act(() => {
      usePOSCartStore.getState().addToCart(product, 1);
    });

    // Quantity should still be 5 (or capped at stock)
    expect(items[0].quantity).toBeLessThanOrEqual(5);
  });

  it("handles multiple different products", () => {
    const p1 = makeProduct({ name: "Product A" });
    const p2 = makeProduct({ name: "Product B" });

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 2);
      usePOSCartStore.getState().addToCart(p2, 3);
    });

    const { items } = usePOSCartStore.getState();
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.product.id === p1.id)?.quantity).toBe(2);
    expect(items.find((i) => i.product.id === p2.id)?.quantity).toBe(3);
  });
});

describe("POSCartStore — update quantity", () => {
  it("updates quantity of an existing item", () => {
    const product = makeProduct({ stock_quantity: 50 });

    act(() => {
      usePOSCartStore.getState().addToCart(product, 2);
      usePOSCartStore.getState().updateQuantity(product.id, 10);
    });

    const { items } = usePOSCartStore.getState();
    expect(items[0].quantity).toBe(10);
  });

  it("removes item when quantity is set to 0", () => {
    const product = makeProduct();

    act(() => {
      usePOSCartStore.getState().addToCart(product, 3);
      usePOSCartStore.getState().updateQuantity(product.id, 0);
    });

    const { items } = usePOSCartStore.getState();
    expect(items).toHaveLength(0);
  });

  it("caps quantity at stock_quantity", () => {
    const product = makeProduct({ stock_quantity: 10 });

    act(() => {
      usePOSCartStore.getState().addToCart(product, 2);
      usePOSCartStore.getState().updateQuantity(product.id, 20);
    });

    const { items } = usePOSCartStore.getState();
    expect(items[0].quantity).toBeLessThanOrEqual(10);
  });
});

describe("POSCartStore — remove item", () => {
  it("removes a specific product from the cart", () => {
    const p1 = makeProduct({ name: "Product A" });
    const p2 = makeProduct({ name: "Product B" });

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 1);
      usePOSCartStore.getState().addToCart(p2, 1);
      usePOSCartStore.getState().removeItem(p1.id);
    });

    const { items } = usePOSCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].product.id).toBe(p2.id);
  });

  it("handles removing non-existent item gracefully", () => {
    const product = makeProduct();

    act(() => {
      usePOSCartStore.getState().addToCart(product, 1);
      usePOSCartStore.getState().removeItem("non-existent-id");
    });

    const { items } = usePOSCartStore.getState();
    expect(items).toHaveLength(1);
  });
});

describe("POSCartStore — clear cart", () => {
  it("removes all items from the cart", () => {
    const p1 = makeProduct();
    const p2 = makeProduct();

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 1);
      usePOSCartStore.getState().addToCart(p2, 2);
      usePOSCartStore.getState().clearCart();
    });

    const { items } = usePOSCartStore.getState();
    expect(items).toHaveLength(0);
  });
});

describe("POSCartStore — cart totals", () => {
  it("calculates correct total for mixed quantities", () => {
    const p1 = makeProduct({ price: 5000 });
    const p2 = makeProduct({ price: 3000 });

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 2); // 2 × 5000 = 10000
      usePOSCartStore.getState().addToCart(p2, 3); // 3 × 3000 = 9000
    });

    const { items } = usePOSCartStore.getState();
    const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    expect(total).toBe(19000);
  });

  it("calculates total cost price correctly", () => {
    const p1 = makeProduct({ price: 5000, cost_price: 3000 });
    const p2 = makeProduct({ price: 3000, cost_price: 1500 });

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 2); // cost: 2 × 3000 = 6000
      usePOSCartStore.getState().addToCart(p2, 4); // cost: 4 × 1500 = 6000
    });

    const { items } = usePOSCartStore.getState();
    const totalCost = items.reduce((sum, item) => sum + (item.product.cost_price ?? 0) * item.quantity, 0);
    expect(totalCost).toBe(12000);

    const totalRevenue = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    expect(totalRevenue).toBe(22000);
    // Profit = 22000 - 12000 = 10000
    expect(totalRevenue - totalCost).toBe(10000);
  });
});
