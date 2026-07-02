import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStoreId } from "@/contexts/StoreContext";
import { CustomerStatsRpc } from "@/types";

/**
 * Customer stats hook — single source of truth.
 *
 * Uses the get_customer_stats RPC which returns aggregated counts
 * (total customers, total credit, customers with credit)
 * scoped to the user's organization. Replaces a fetchAllRows + client-side reduce.
 */
export function useCustomerStats() {
  const { user, profile } = useAuth();
  const storeId = useStoreId();

  return useQuery<CustomerStatsRpc>({
    queryKey: ["customers-stats", user?.id, storeId ?? "no-store"],
    queryFn: async () => {
      if (!profile?.organization_id) {
        return { totalCustomers: 0, totalCredit: 0, customersWithCredit: 0 };
      }
      const { data, error } = await supabase.rpc("get_customer_stats", {
        p_store_id: storeId,
      });
      if (error) throw error;
      const typed = data as unknown as CustomerStatsRpc;
      return {
        totalCustomers: typed.totalCustomers ?? 0,
        totalCredit: typed.totalCredit ?? 0,
        customersWithCredit: typed.customersWithCredit ?? 0,
      };
    },
    enabled: !!user && !!profile?.organization_id,
  });
}
