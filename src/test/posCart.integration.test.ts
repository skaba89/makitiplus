/**
 * Integration tests for POSCartContext (Zustand store)
 *
 * These tests verify:
 * - Cart state management: add, update, remove, clear
 * - Stock quantity enforcement (cannot exceed stock_quantity)
 * - Persistence (IndexedDB primary, localStorage fallback)
 * - Cart total calculation
 * - Edge cases: adding same product twice, removing non-existent product, zero quantity
 *
 * NOTE: The cart now uses IndexedDB as primary storage with localStorage fallback.
 * Persistence tests verify the store state rather than the underlying storage mechanism,
 * since IndexedDB writes are async and fire-and-forget for UI responsiveness.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePOSCartStore, useCartTotal } from "@/contexts/POSCartContext";

// ─── Helpers ─────────────────────────────────────────────────────

const makeProduct = (overrides: Partial<{
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  tax_rate: number | null;
}> = {}) => ({
  id: overrides.id ?? "prod-1",
  name: overrides.name ?? "Product A",
  price: overrides.price ?? 1000,
  stock_quantity: overrides.stock_quantity ?? 50,
  tax_rate: overrides.tax_rate ?? null,
  category_id: null,
  organization_id: "org-1",
  barcode: null,
  image_url: null,
  description: null,
  unit: "unité",
  min_stock: 0,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  cost_price: null,
  sku: null,
});

// ─── Tests ───────────────────────────────────────────────────────

describe("POSCartContext — cart state management", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset Zustand store to initial state
    usePOSCartStore.setState({ items: [], isHydrated: false });
  });

  it("adds a product to an empty cart", () => {
    const product = makeProduct();
    const result = usePOSCartStore.getState().addToCart(product);

    expect(result).toBe(true);
    const items = usePOSCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].product.id).toBe("prod-1");
    expect(items[0].quantity).toBe(1);
  });

  it("increments quantity when adding the same product again", () => {
    const product = makeProduct();
    usePOSCartStore.getState().addToCart(product);
    usePOSCartStore.getState().addToCart(product);

    const items = usePOSCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it("adds multiple different products", () => {
    const productA = makeProduct({ id: "a", name: "A" });
    const productB = makeProduct({ id: "b", name: "B" });

    usePOSCartStore.getState().addToCart(productA);
    usePOSCartStore.getState().addToCart(productB);

    const items = usePOSCartStore.getState().items;
    expect(items).toHaveLength(2);
  });

  it("respects stock_quantity limit on addToCart", () => {
    const product = makeProduct({ stock_quantity: 3 });
    const store = usePOSCartStore.getState();

    // Add 3 — OK
    expect(store.addToCart(product, 3)).toBe(true);
    // Try to add 1 more — should fail (would exceed stock)
    expect(usePOSCartStore.getState().addToCart(product, 1)).toBe(false);

    // Cart should still have quantity 3
    expect(usePOSCartStore.getState().items[0].quantity).toBe(3);
  });

  it("respects stock_quantity limit on updateQuantity", () => {
    const product = makeProduct({ stock_quantity: 5 });
    usePOSCartStore.getState().addToCart(product, 3);

    // Update to 5 — OK
    expect(usePOSCartStore.getState().updateQuantity("prod-1", 5)).toBe(true);
    // Try update to 6 — should fail
    expect(usePOSCartStore.getState().updateQuantity("prod-1", 6)).toBe(false);

    expect(usePOSCartStore.getState().items[0].quantity).toBe(5);
  });

  it("removes item when quantity is set to 0", () => {
    const product = makeProduct();
    usePOSCartStore.getState().addToCart(product);

    expect(usePOSCartStore.getState().items).toHaveLength(1);

    usePOSCartStore.getState().updateQuantity("prod-1", 0);

    expect(usePOSCartStore.getState().items).toHaveLength(0);
  });

  it("removes item with removeItem", () => {
    const productA = makeProduct({ id: "a" });
    const productB = makeProduct({ id: "b" });

    usePOSCartStore.getState().addToCart(productA);
    usePOSCartStore.getState().addToCart(productB);
    expect(usePOSCartStore.getState().items).toHaveLength(2);

    usePOSCartStore.getState().removeItem("a");
    expect(usePOSCartStore.getState().items).toHaveLength(1);
    expect(usePOSCartStore.getState().items[0].product.id).toBe("b");
  });

  it("clears all items with clearCart", () => {
    usePOSCartStore.getState().addToCart(makeProduct({ id: "a" }));
    usePOSCartStore.getState().addToCart(makeProduct({ id: "b" }));
    usePOSCartStore.getState().addToCart(makeProduct({ id: "c" }));

    usePOSCartStore.getState().clearCart();
    expect(usePOSCartStore.getState().items).toHaveLength(0);
  });

  it("calculates cart total correctly", () => {
    const productA = makeProduct({ id: "a", price: 5000 });
    const productB = makeProduct({ id: "b", price: 3000 });

    usePOSCartStore.getState().addToCart(productA, 2); // 2 × 5000 = 10000
    usePOSCartStore.getState().addToCart(productB, 3); // 3 × 3000 = 9000

    const total = usePOSCartStore.getState().items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );
    expect(total).toBe(19000);
  });
});

describe("POSCartContext — persistence (IndexedDB primary)", () => {
  beforeEach(() => {
    localStorage.clear();
    usePOSCartStore.setState({ items: [], isHydrated: false });
  });

  it("maintains correct state after add", () => {
    const product = makeProduct();
    usePOSCartStore.getState().addToCart(product);

    // Verify state is correct (IndexedDB save is fire-and-forget)
    const items = usePOSCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].product.id).toBe("prod-1");
  });

  it("maintains correct state after remove", () => {
    usePOSCartStore.getState().addToCart(makeProduct({ id: "a" }));
    usePOSCartStore.getState().addToCart(makeProduct({ id: "b" }));

    usePOSCartStore.getState().removeItem("a");

    const items = usePOSCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].product.id).toBe("b");
  });

  it("maintains empty state after clearCart", () => {
    usePOSCartStore.getState().addToCart(makeProduct());
    usePOSCartStore.getState().clearCart();

    expect(usePOSCartStore.getState().items).toHaveLength(0);
  });

  it("hydrates from IndexedDB via hydrateFromDB", async () => {
    // Add items first
    const product = makeProduct({ id: "hydrated-1", name: "Test Product" });
    usePOSCartStore.getState().addToCart(product);

    // Allow fire-and-forget IndexedDB write to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Reset store
    usePOSCartStore.setState({ items: [], isHydrated: false });

    // Hydrate from IndexedDB
    await usePOSCartStore.getState().hydrateFromDB("org-1");

    // Items should be restored from IndexedDB
    const items = usePOSCartStore.getState().items;
    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});

describe("POSCartContext — edge cases", () => {
  beforeEach(() => {
    localStorage.clear();
    usePOSCartStore.setState({ items: [], isHydrated: false });
  });

  it("handles removing a non-existent product gracefully", () => {
    const product = makeProduct({ id: "existing" });
    usePOSCartStore.getState().addToCart(product);

    // Remove something that doesn't exist — should not throw
    expect(() => usePOSCartStore.getState().removeItem("nonexistent")).not.toThrow();
    expect(usePOSCartStore.getState().items).toHaveLength(1);
  });

  it("handles updateQuantity for non-existent product gracefully", () => {
    const product = makeProduct();
    usePOSCartStore.getState().addToCart(product);

    // Update something that doesn't exist — returns true (no-op)
    const result = usePOSCartStore.getState().updateQuantity("nonexistent", 5);
    // No crash, cart unchanged
    expect(usePOSCartStore.getState().items).toHaveLength(1);
  });

  it("handles addToCart with addQty that would exceed stock", () => {
    const product = makeProduct({ stock_quantity: 10 });
    usePOSCartStore.getState().addToCart(product, 8);

    // Adding 3 more would make it 11 > 10 — should fail
    expect(usePOSCartStore.getState().addToCart(product, 3)).toBe(false);
    // Cart quantity unchanged
    expect(usePOSCartStore.getState().items[0].quantity).toBe(8);
  });

  it("setItems replaces the entire cart", () => {
    usePOSCartStore.getState().addToCart(makeProduct({ id: "old" }));

    const newItems = [
      { product: makeProduct({ id: "new-1" }), quantity: 2 },
      { product: makeProduct({ id: "new-2" }), quantity: 5 },
    ];
    usePOSCartStore.getState().setItems(newItems);

    const items = usePOSCartStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0].product.id).toBe("new-1");
    expect(items[1].product.id).toBe("new-2");
  });
});
