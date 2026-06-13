import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Fetches the current organization's default tax rate (%).
 * Cached for 10 minutes — rarely changes.
 */
export const useOrgTaxRate = () => {
  const { user, profile } = useAuth();
  const orgId = (profile as any)?.organization_id;

  const { data } = useQuery({
    queryKey: ["org-tax-rate", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      const { data, error } = await supabase
        .from("organizations")
        .select("default_tax_rate")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      return Number((data as any)?.default_tax_rate ?? 0);
    },
    enabled: !!user && !!orgId,
    staleTime: 10 * 60 * 1000,
  });

  return data ?? 0;
};
