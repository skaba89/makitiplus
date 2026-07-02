import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SupplierStatsRpc } from "@/types";

/**
 * Supplier stats hook — single source of truth.
 *
 * Uses the get_supplier_stats RPC which returns aggregated counts
 * (total suppliers, active suppliers, total products, total supply value)
 * scoped to the user's organization.
 */
export function useSupplierStats() {
  const { user, profile } = useAuth();

  return useQuery<SupplierStatsRpc>({
    queryKey: ["suppliers-stats", user?.id],
    queryFn: async () => {
      if (!profile?.organization_id) {
        return { totalSuppliers: 0, activeSuppliers: 0, totalProducts: 0, totalSupplyValue: 0 };
      }
      const { data, error } = await supabase.rpc("get_supplier_stats");
      if (error) throw error;
      const typed = data as unknown as SupplierStatsRpc;
      return {
        totalSuppliers: typed.totalSuppliers ?? 0,
        activeSuppliers: typed.activeSuppliers ?? 0,
        totalProducts: typed.totalProducts ?? 0,
        totalSupplyValue: typed.totalSupplyValue ?? 0,
      };
    },
    enabled: !!user && !!profile?.organization_id,
  });
}
