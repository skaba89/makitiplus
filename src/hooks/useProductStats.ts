import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ProductStatsRpc } from "@/types";

/**
 * Product stats hook — single source of truth.
 *
 * Uses the get_product_stats RPC which returns aggregated counts
 * (total products, low stock, out of stock, category breakdown)
 * scoped to the user's organization. Replaces a fetchAllRows + client-side reduce.
 */
export function useProductStats() {
  const { user, profile } = useAuth();

  return useQuery<ProductStatsRpc>({
    queryKey: ["products-stats", user?.id],
    queryFn: async () => {
      if (!profile?.organization_id) {
        return { totalProducts: 0, lowStockCount: 0, outOfStockCount: 0, categoryCounts: {} };
      }
      const { data, error } = await supabase.rpc("get_product_stats");
      if (error) throw error;
      const typed = data as unknown as ProductStatsRpc;
      return {
        totalProducts: typed.totalProducts ?? 0,
        lowStockCount: typed.lowStockCount ?? 0,
        outOfStockCount: typed.outOfStockCount ?? 0,
        categoryCounts: typed.categoryCounts ?? {},
      };
    },
    enabled: !!user && !!profile?.organization_id,
  });
}
