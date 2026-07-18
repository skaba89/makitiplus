import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SupplierStatsRpc } from "@/types";
import { logger } from "@/lib/logger";

/**
 * Supplier stats hook — single source of truth.
 *
 * Uses the get_supplier_stats RPC which returns aggregated counts
 * (total suppliers, active suppliers, total products, total supply value)
 * scoped to the user's organization.
 */
export function useSupplierStats() {
  const { user, profile } = useAuth();
  const { effectiveOrgId } = useOrgSelector();

  return useQuery<SupplierStatsRpc>({
    queryKey: ["suppliers-stats", user?.id],
    queryFn: async () => {
      if (!effectiveOrgId) {
        return { totalSuppliers: 0, activeSuppliers: 0, totalProducts: 0, totalSupplyValue: 0 };
      }
      const { data, error } = await supabase.rpc("get_supplier_stats");
      if (error) {
        logger.warn("[SupplierStats] get_supplier_stats RPC failed:", error.message);
        return { totalSuppliers: 0, activeSuppliers: 0, totalProducts: 0, totalSupplyValue: 0 };
      }
      const typed = data as unknown as SupplierStatsRpc;
      return {
        totalSuppliers: typed.totalSuppliers ?? 0,
        activeSuppliers: typed.activeSuppliers ?? 0,
        totalProducts: typed.totalProducts ?? 0,
        totalSupplyValue: typed.totalSupplyValue ?? 0,
      };
    },
    enabled: !!user,
  });
}
