import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ExpenseStatsRpc } from "@/types";

/**
 * Expense stats hook — single source of truth.
 *
 * Uses the get_expense_stats RPC which returns aggregated counts
 * (month total, month count) scoped to the user's organization.
 * Replaces a fetchAllRows + client-side reduce.
 */
export function useExpenseStats() {
  const { user, profile } = useAuth();

  return useQuery<ExpenseStatsRpc>({
    queryKey: ["expenses-stats", user?.id],
    queryFn: async () => {
      if (!profile?.organization_id) {
        return { monthTotal: 0, monthCount: 0 };
      }
      const { data, error } = await supabase.rpc("get_expense_stats");
      if (error) throw error;
      const typed = data as unknown as ExpenseStatsRpc;
      return {
        monthTotal: typed.monthTotal ?? 0,
        monthCount: typed.monthCount ?? 0,
      };
    },
    enabled: !!user && !!profile?.organization_id,
  });
}
