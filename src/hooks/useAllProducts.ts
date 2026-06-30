import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Database } from "@/integrations/supabase/types";
import { fetchAllRows } from "@/lib/batchedFetch";

/**
 * Product row with optional category join.
 */
type ProductWithCategory = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

/**
 * Fetch ALL active products for the POS using batched pagination.
 *
 * Why not a simple `.select()`?  Supabase PostgREST has a `db-max-rows`
 * setting (default 500 on newer projects) that silently truncates results
 * when no explicit `.limit()` or `.range()` is set.  This hook uses
 * `fetchAllRows` which fetches in batches to load every product.
 */
export function useAllProducts() {
  const { user } = useAuth();

  return useQuery<ProductWithCategory[]>({
    queryKey: ["products", "pos-all"],
    queryFn: () =>
      fetchAllRows<ProductWithCategory>(
        "products",
        "*, categories(name, color, icon)",
        {
          filters: [{ column: "is_active", operator: "eq", value: true }],
          orderBy: { column: "name", ascending: true },
        }
      ),
    enabled: !!user,
    // Keep data fresh for POS usage (refetch on window focus)
    staleTime: 30_000,
  });
}
