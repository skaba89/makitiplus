import { create } from "zustand";
import { Database } from "@/integrations/supabase/types";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

export interface CartItem {
  product: Product;
  quantity: number;
}

interface POSCartState {
  items: CartItem[];
  addToCart: (product: Product, addQty?: number) => boolean; // returns false if stock exceeded
  updateQuantity: (productId: string, quantity: number) => boolean; // returns false if stock exceeded
  removeItem: (productId: string) => void;
  clearCart: () => void;
  setItems: (items: CartItem[]) => void;
}

// Load cart from localStorage
const loadCart = (): CartItem[] => {
  try {
    const saved = localStorage.getItem("pos_cart");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return [];
};

// Save cart to localStorage
const saveCart = (items: CartItem[]) => {
  try {
    localStorage.setItem("pos_cart", JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
};

export const usePOSCartStore = create<POSCartState>((set, get) => ({
  items: loadCart(),

  addToCart: (product, addQty = 1) => {
    const state = get();
    const existing = state.items.find((item) => item.product.id === product.id);
    const currentQty = existing?.quantity || 0;
    const targetQty = currentQty + addQty;

    if (targetQty > product.stock_quantity) {
      // Return false — caller should handle stock warning
      return false;
    }

    const newItems = existing
      ? state.items.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: targetQty }
            : item
        )
      : [...state.items, { product, quantity: addQty }];

    set({ items: newItems });
    saveCart(newItems);
    return true;
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return true;
    }
    const state = get();
    const item = state.items.find((i) => i.product.id === productId);
    if (item && quantity > item.product.stock_quantity) {
      return false; // stock exceeded
    }
    const newItems = state.items.map((item) =>
      item.product.id === productId ? { ...item, quantity } : item
    );
    set({ items: newItems });
    saveCart(newItems);
    return true;
  },

  removeItem: (productId) => {
    const newItems = get().items.filter((item) => item.product.id !== productId);
    set({ items: newItems });
    saveCart(newItems);
  },

  clearCart: () => {
    set({ items: [] });
    saveCart([]);
  },

  setItems: (items) => {
    set({ items });
    saveCart(items);
  },
}));

/** Derived selector: cart total */
export const useCartTotal = () =>
  usePOSCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  );
