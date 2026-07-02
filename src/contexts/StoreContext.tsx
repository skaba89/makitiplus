/**
 * Store Context — Multi-store switching for MakitiPlus
 *
 * Provides:
 * - currentStore: the active store the user is working in
 * - stores: list of all stores in the organization
 * - setCurrentStore: switch to a different store
 * - isLoading: loading state
 *
 * The current store is persisted in the profiles table (current_store_id)
 * and synced across sessions.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────

export interface Store {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  country: string;
  currency: string;
  phone: string | null;
  is_active: boolean;
  is_headquarters: boolean;
  category: string | null;
  metadata: Record<string, unknown>;
  product_count: number;
  sales_this_month: number;
  created_at: string;
  updated_at: string;
}

interface StoreContextValue {
  currentStore: Store | null;
  stores: Store[];
  isLoading: boolean;
  setCurrentStore: (storeId: string) => Promise<void>;
  refreshStores: () => void;
}

// ─── Context ──────────────────────────────────────────────────

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export { StoreContext };

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [localCurrentStore, setLocalCurrentStore] = useState<Store | null>(null);

  // ─── Fetch organization stores ────────────────────────────────
  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["organization-stores"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_organization_stores");
      if (error) throw error;
      return (data as Store[]) || [];
    },
    enabled: !!user && !!profile?.organization_id,
    staleTime: 2 * 60 * 1000,
  });

  // ─── Determine current store ──────────────────────────────────
  useEffect(() => {
    if (stores.length === 0) {
      setLocalCurrentStore(null);
      return;
    }

    // If profile has a current_store_id, find the matching store
    const profileStoreId = profile?.current_store_id;
    if (profileStoreId) {
      const matched = stores.find((s) => s.id === profileStoreId);
      if (matched) {
        setLocalCurrentStore(matched);
        return;
      }
    }

    // Fallback: headquarters store
    const hq = stores.find((s) => s.is_headquarters);
    if (hq) {
      setLocalCurrentStore(hq);
      return;
    }

    // Last resort: first store
    setLocalCurrentStore(stores[0]);
  }, [stores, profile?.current_store_id]);

  // ─── Switch store ─────────────────────────────────────────────
  const switchMutation = useMutation({
    mutationFn: async (storeId: string) => {
      const { error } = await supabase.rpc("set_current_store", {
        p_store_id: storeId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, storeId) => {
      const newStore = stores.find((s) => s.id === storeId);
      if (newStore) {
        setLocalCurrentStore(newStore);
      }
      // Invalidate all store-scoped queries
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["top-products"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["plan-limit"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["reports-stats"] });
      queryClient.invalidateQueries({ queryKey: ["reports-top-products"] });
      queryClient.invalidateQueries({ queryKey: ["reports-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["reports-orphan-products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-top-products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-sales-month"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-expenses-month"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-sales"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["products-lookup"] });
    },
  });

  const setCurrentStore = useCallback(
    async (storeId: string) => {
      await switchMutation.mutateAsync(storeId);
    },
    [switchMutation]
  );

  const refreshStores = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["organization-stores"] });
  }, [queryClient]);

  return (
    <StoreContext.Provider
      value={{
        currentStore: localCurrentStore,
        stores,
        isLoading,
        setCurrentStore,
        refreshStores,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────

export function useStore() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}

// ─── Helper: store-aware query filter ─────────────────────────

/**
 * Returns the store_id filter for Supabase queries.
 * If a current store is active, filters by store_id.
 * If no store context (single-store org), returns empty filter array.
 */
export function useStoreFilter() {
  const { currentStore } = useStore();
  return currentStore
    ? [{ column: "store_id", operator: "eq" as const, value: currentStore.id }]
    : [];
}

/**
 * Returns the store_id to set on new records.
 * Returns null if no store context (single-store org or no active store).
 */
export function useStoreId() {
  const { currentStore } = useStore();
  return currentStore?.id ?? null;
}
