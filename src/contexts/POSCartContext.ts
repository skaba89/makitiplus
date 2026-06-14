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
  addToCart: (product: Product, addQty?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  setItems: (items: CartItem[]) => void;
}

export const usePOSCartStore = create<POSCartState>((set, get) => ({
  items: [],

  addToCart: (product, addQty = 1) => {
    set((state) => {
      const existing = state.items.find((item) => item.product.id === product.id);
      const currentQty = existing?.quantity || 0;
      const targetQty = currentQty + addQty;

      if (targetQty > product.stock_quantity) {
        // Return unchanged — caller should handle stock warning
        return state;
      }

      if (existing) {
        return {
          items: state.items.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: targetQty }
              : item
          ),
        };
      }
      return { items: [...state.items, { product, quantity: addQty }] };
    });
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }
    set((state) => ({
      items: state.items.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      ),
    }));
  },

  removeItem: (productId) => {
    set((state) => ({
      items: state.items.filter((item) => item.product.id !== productId),
    }));
  },

  clearCart: () => {
    set({ items: [] });
  },

  setItems: (items) => {
    set({ items });
  },
}));

/** Derived selector: cart total */
export const useCartTotal = () =>
  usePOSCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  );
