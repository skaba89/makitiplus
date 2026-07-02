import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStoreId } from "@/contexts/StoreContext";
import { Database } from "@/integrations/supabase/types";
import { CategoryRpcRow } from "@/types";

type Category = Database["public"]["Tables"]["categories"]["Row"] & {
  products?: { count: number }[];
  product_count?: number;
};

/**
 * Shared categories hook — single source of truth.
 *
 * Uses the get_categories RPC which returns categories with product counts,
 * properly scoped to the user's organization. Replaces 4 duplicate queries
 * across POS, Products, Categories, and ProductForm pages.
 *
 * Fallback: if the RPC isn't deployed yet, falls back to a basic query.
 */
export function useCategories() {
  const { user, profile } = useAuth();
  const storeId = useStoreId();

  return useQuery<Category[]>({
    queryKey: ["categories", user?.id, storeId ?? "no-store"],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      // Try RPC first (includes product_count)
      try {
        const { data, error } = await supabase.rpc("get_categories", {
          p_store_id: storeId,
        });
        if (!error && data) {
          // Map RPC result to match Category type
          return (data as CategoryRpcRow[]).map((c) => ({
            ...c,
            icon: c.icon || "Package",
            color: c.color || "#6366F1",
            description: c.description || null,
            sort_order: c.sort_order ?? null,
            is_default: c.is_default ?? false,
            products: [{ count: c.product_count || 0 }],
          })) as Category[];
        }
      } catch {
        // RPC not available — fallback below
      }

      // Fallback: basic query without product counts
      let fallbackQuery = supabase
        .from("categories")
        .select("*, products(count)")
        .eq("organization_id", profile.organization_id);

      if (storeId) {
        fallbackQuery = fallbackQuery.eq("store_id", storeId);
      }

      const { data, error } = await fallbackQuery
        .order("name")
        .limit(500);

      if (error) throw error;
      return (data as Category[]) || [];
    },
    enabled: !!user && !!profile?.organization_id,
    staleTime: 60_000, // 1 minute — categories rarely change
  });
}
