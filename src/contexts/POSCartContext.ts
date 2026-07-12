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
  discountAmount: number;
  discountType: "amount" | "percent";
  discountValue: number;
  addToCart: (product: Product, addQty?: number) => boolean; // returns false if stock exceeded
  updateQuantity: (productId: string, quantity: number) => boolean; // returns false if stock exceeded
  removeItem: (productId: string) => void;
  clearCart: () => void;
  setItems: (items: CartItem[]) => void;
  hydrateFromDB: (organizationId: string) => Promise<void>;
  setDiscount: (type: "amount" | "percent", value: number) => void;
  clearDiscount: () => void;
}

/**
 * Cart entry stored in IndexedDB — items + discount metadata so the
 * discount survives a page refresh (P0 fix: previously only items were
 * persisted, so the discount was silently lost on reload).
 */
interface StoredCartEntry {
  organizationId: string;
  items: CartItem[];
  updatedAt: string;
  discountType?: "amount" | "percent";
  discountValue?: number;
}

/**
 * Load cart from IndexedDB (primary) with localStorage fallback for migration.
 * Returns both the items AND the persisted discount (if any).
 */
const loadCartFromDB = async (
  organizationId: string
): Promise<{ items: CartItem[]; discountType?: "amount" | "percent"; discountValue?: number }> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.POS_CART, "readonly");
      const store = tx.objectStore(STORES.POS_CART);
      const request = store.get(organizationId);
      request.onsuccess = () => {
        const entry = request.result as StoredCartEntry | undefined;
        if (entry?.items && Array.isArray(entry.items)) {
          resolve({
            items: entry.items,
            discountType: entry.discountType,
            discountValue: entry.discountValue,
          });
        } else {
          resolve({ items: [] });
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Fallback to localStorage if IndexedDB is unavailable
    return { items: loadCartFromLocalStorage() };
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
 * Save cart to IndexedDB (primary) — items + discount metadata so the
 * discount survives a page refresh.
 */
const saveCartToDB = async (
  items: CartItem[],
  organizationId: string,
  discount?: { type: "amount" | "percent"; value: number }
): Promise<void> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.POS_CART, "readwrite");
      const store = tx.objectStore(STORES.POS_CART);
      const entry: StoredCartEntry = {
        organizationId,
        items,
        updatedAt: new Date().toISOString(),
        discountType: discount?.type,
        discountValue: discount?.value,
      };
      store.put(entry);
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
 * M5 fix: Returns success status so caller can detect total persistence failure.
 */
const saveCartToLocalStorage = (items: CartItem[]): boolean => {
  try {
    localStorage.setItem("pos_cart", JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
};

/**
 * M5 fix: Track whether we've already warned about persistence failure
 * to avoid spamming the user on every cart update.
 */
let cartPersistenceWarningShown = false;

/**
 * M5 fix: Attempt to save cart with fallback chain (IDB → localStorage → warn).
 * Returns true if saved successfully to at least one storage.
 * P0 fix: also persists the discount so it survives a page refresh.
 */
const saveCartWithFallback = async (
  items: CartItem[],
  organizationId: string,
  discount?: { type: "amount" | "percent"; value: number }
): Promise<boolean> => {
  try {
    await saveCartToDB(items, organizationId, discount);
    return true;
  } catch {
    // IDB failed, try localStorage
    const lsOk = saveCartToLocalStorage(items);
    if (!lsOk && !cartPersistenceWarningShown) {
      cartPersistenceWarningShown = true;
      logger.error("[POSCart] CRITICAL: Both IndexedDB and localStorage failed — cart may be lost on refresh");
      // Import toast lazily to avoid circular deps
      import("@/hooks/use-toast").then(({ toast }) => {
        toast({
          variant: "destructive",
          title: "Erreur de sauvegarde",
          description: "Impossible de sauvegarder le panier. Évitez de rafraîchir la page.",
          duration: 8000,
        });
      });
    }
    return lsOk;
  }
};

export const usePOSCartStore = create<POSCartState>((set, get) => ({
  items: [],
  isHydrated: false,
  discountAmount: 0,
  discountType: "amount",
  discountValue: 0,

  hydrateFromDB: async (organizationId: string) => {
    // First try IndexedDB — returns items + persisted discount (if any)
    const { items: dbItems, discountType, discountValue } = await loadCartFromDB(organizationId);
    let items = dbItems;

    // If IndexedDB is empty but localStorage has data, migrate it
    if (items.length === 0) {
      const lsItems = loadCartFromLocalStorage();
      if (lsItems.length > 0) {
        items = lsItems;
        // Migrate to IndexedDB (no discount info in legacy localStorage)
        await saveCartToDB(items, organizationId);
        // Remove from localStorage after successful migration
        localStorage.removeItem("pos_cart");
        logger.info("[POSCart] Migrated cart from localStorage to IndexedDB");
      }
    }

    // P0 fix: restore discount from IndexedDB so it survives page refresh
    set({
      items,
      isHydrated: true,
      discountType: discountType ?? "amount",
      discountValue: discountValue ?? 0,
    });
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
    // M5 fix: Use unified save with fallback chain + warning
    // P0 fix: persist discount alongside items so it survives refresh
    const orgId = (product as { organization_id?: string }).organization_id || "default";
    saveCartWithFallback(newItems, orgId, { type: state.discountType, value: state.discountValue });
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
    saveCartWithFallback(newItems, orgId, { type: state.discountType, value: state.discountValue });
    return true;
  },

  removeItem: (productId) => {
    const state = get();
    const newItems = state.items.filter((item) => item.product.id !== productId);
    set({ items: newItems });
    const orgId = (state.items[0]?.product as { organization_id?: string })?.organization_id || "default";
    saveCartWithFallback(newItems, orgId, { type: state.discountType, value: state.discountValue });
  },

  clearCart: () => {
    const state = get();
    set({ items: [], discountAmount: 0, discountType: "amount", discountValue: 0 });
    const orgId = (state.items[0]?.product as { organization_id?: string })?.organization_id || "default";
    saveCartWithFallback([], orgId, { type: "amount", value: 0 });
  },

  setItems: (items) => {
    const state = get();
    set({ items });
    const orgId = (items[0]?.product as { organization_id?: string })?.organization_id || "default";
    saveCartWithFallback(items, orgId, { type: state.discountType, value: state.discountValue });
  },

  setDiscount: (type, value) => {
    set({ discountType: type, discountValue: value });
    // P0 fix: persist the new discount immediately so it survives a refresh
    const state = get();
    const orgId = (state.items[0]?.product as { organization_id?: string })?.organization_id || "default";
    saveCartWithFallback(state.items, orgId, { type, value });
  },

  clearDiscount: () => {
    set({ discountAmount: 0, discountType: "amount", discountValue: 0 });
    // P0 fix: persist the cleared discount
    const state = get();
    const orgId = (state.items[0]?.product as { organization_id?: string })?.organization_id || "default";
    saveCartWithFallback(state.items, orgId, { type: "amount", value: 0 });
  },
}));

/** Derived selector: cart subtotal (before discount) */
export const useCartSubtotal = () =>
  usePOSCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  );

/** Derived selector: cart total (after discount) */
export const useCartTotal = () =>
  usePOSCartStore((state) => {
    const subtotal = state.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const discount = state.discountType === "percent"
      ? Math.round(subtotal * (state.discountValue / 100))
      : Math.min(state.discountValue, subtotal);
    return Math.max(0, subtotal - discount);
  });

/** Derived selector: discount amount in currency */
export const useCartDiscount = () =>
  usePOSCartStore((state) => {
    const subtotal = state.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    return state.discountType === "percent"
      ? Math.round(subtotal * (state.discountValue / 100))
      : Math.min(state.discountValue, subtotal);
  });
