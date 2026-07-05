import { create } from "zustand";
import { Database } from "@/integrations/supabase/types";
import { getDB, STORES } from "@/lib/indexedDBStorage";
import { logger } from "@/lib/logger";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

export interface CartItem {
  product: Product;
  quantity: number;
}

interface POSCartState {
  items: CartItem[];
  isHydrated: boolean;
  addToCart: (product: Product, addQty?: number) => boolean; // returns false if stock exceeded
  updateQuantity: (productId: string, quantity: number) => boolean; // returns false if stock exceeded
  removeItem: (productId: string) => void;
  clearCart: () => void;
  setItems: (items: CartItem[]) => void;
  hydrateFromDB: (organizationId: string) => Promise<void>;
}

/**
 * Load cart from IndexedDB (primary) with localStorage fallback for migration.
 */
const loadCartFromDB = async (organizationId: string): Promise<CartItem[]> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.POS_CART, "readonly");
      const store = tx.objectStore(STORES.POS_CART);
      const request = store.get(organizationId);
      request.onsuccess = () => {
        const entry = request.result as { items: CartItem[] } | undefined;
        if (entry?.items && Array.isArray(entry.items)) {
          resolve(entry.items);
        } else {
          resolve([]);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Fallback to localStorage if IndexedDB is unavailable
    return loadCartFromLocalStorage();
  }
};

/**
 * Legacy localStorage loader (fallback + migration source).
 */
const loadCartFromLocalStorage = (): CartItem[] => {
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

/**
 * Save cart to IndexedDB (primary).
 */
const saveCartToDB = async (items: CartItem[], organizationId: string): Promise<void> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.POS_CART, "readwrite");
      const store = tx.objectStore(STORES.POS_CART);
      store.put({ organizationId, items, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // Fallback to localStorage if IndexedDB is unavailable
    logger.warn("[POSCart] IndexedDB save failed, falling back to localStorage:", err);
    saveCartToLocalStorage(items);
  }
};

/**
 * Legacy localStorage saver (fallback).
 */
const saveCartToLocalStorage = (items: CartItem[]) => {
  try {
    localStorage.setItem("pos_cart", JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
};

export const usePOSCartStore = create<POSCartState>((set, get) => ({
  items: [],
  isHydrated: false,

  hydrateFromDB: async (organizationId: string) => {
    // First try IndexedDB
    let items = await loadCartFromDB(organizationId);

    // If IndexedDB is empty but localStorage has data, migrate it
    if (items.length === 0) {
      const lsItems = loadCartFromLocalStorage();
      if (lsItems.length > 0) {
        items = lsItems;
        // Migrate to IndexedDB
        await saveCartToDB(items, organizationId);
        // Remove from localStorage after successful migration
        localStorage.removeItem("pos_cart");
        logger.info("[POSCart] Migrated cart from localStorage to IndexedDB");
      }
    }

    set({ items, isHydrated: true });
  },

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
    // Fire-and-forget save (non-blocking for UI responsiveness)
    const orgId = (product as { organization_id?: string }).organization_id || "default";
    saveCartToDB(newItems, orgId).catch(() => saveCartToLocalStorage(newItems));
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
    const orgId = (item?.product as { organization_id?: string })?.organization_id || "default";
    saveCartToDB(newItems, orgId).catch(() => saveCartToLocalStorage(newItems));
    return true;
  },

  removeItem: (productId) => {
    const state = get();
    const newItems = state.items.filter((item) => item.product.id !== productId);
    set({ items: newItems });
    const orgId = (state.items[0]?.product as { organization_id?: string })?.organization_id || "default";
    saveCartToDB(newItems, orgId).catch(() => saveCartToLocalStorage(newItems));
  },

  clearCart: () => {
    const state = get();
    set({ items: [] });
    const orgId = (state.items[0]?.product as { organization_id?: string })?.organization_id || "default";
    saveCartToDB([], orgId).catch(() => saveCartToLocalStorage([]));
  },

  setItems: (items) => {
    set({ items });
    const orgId = (items[0]?.product as { organization_id?: string })?.organization_id || "default";
    saveCartToDB(items, orgId).catch(() => saveCartToLocalStorage(items));
  },
}));

/** Derived selector: cart total */
export const useCartTotal = () =>
  usePOSCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  );
