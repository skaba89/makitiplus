import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CustomerStatsRpc } from "@/types";
import { logger } from "@/lib/logger";

/**
 * Customer stats hook — single source of truth.
 *
 * Uses the get_customer_stats RPC which returns aggregated counts
 * (total customers, total credit, customers with credit)
 * scoped to the user's organization. Replaces a fetchAllRows + client-side reduce.
 */
export function useCustomerStats() {
  const { user, profile } = useAuth();
  const { effectiveOrgId } = useOrgSelector();

  return useQuery<CustomerStatsRpc>({
    queryKey: ["customers-stats", user?.id],
    queryFn: async () => {
      if (!effectiveOrgId) {
        return { totalCustomers: 0, totalCredit: 0, customersWithCredit: 0 };
      }
      const { data, error } = await supabase.rpc("get_customer_stats");
      if (error) {
        logger.warn("[CustomerStats] get_customer_stats RPC failed:", error.message);
        return { totalCustomers: 0, totalCredit: 0, customersWithCredit: 0 };
      }
      const typed = data as unknown as CustomerStatsRpc;
      return {
        totalCustomers: typed.totalCustomers ?? 0,
        totalCredit: typed.totalCredit ?? 0,
        customersWithCredit: typed.customersWithCredit ?? 0,
      };
    },
    enabled: !!user,
  });
}
