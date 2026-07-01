import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Database } from "@/integrations/supabase/types";
import { buildSafeOrFilter } from "@/lib/postgrestSanitize";

type ProductWithCategory = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

interface UsePOSProductsOptions {
  categoryId?: string | null;
  showOutOfStock?: boolean;
  searchQuery?: string;
  pageSize?: number;
}

/**
 * Infinite-scroll product query for the POS grid/list.
 *
 * Uses Supabase `.range()` with `count: 'exact'` to fetch pages of products
 * with server-side filtering by category, stock status, and search.
 * "Load more" calls `fetchNextPage()` to append more results.
 */
export function usePOSProducts({
  categoryId,
  showOutOfStock = false,
  searchQuery,
  pageSize = 24,
}: UsePOSProductsOptions) {
  const { user, profile } = useAuth();

  return useInfiniteQuery({
    queryKey: [
      "pos-products",
      user?.id,
      profile?.organization_id,
      categoryId ?? "all",
      showOutOfStock ? "with-oos" : "in-stock",
      searchQuery ?? "",
      pageSize,
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("products")
        .select("*, categories(name, color, icon)", { count: "exact" })
        .eq("is_active", true);

      // Filtre organization_id — defense-in-depth (+ performance index)
      if (profile?.organization_id) {
        query = query.eq("organization_id", profile.organization_id);
      }

      // Category filter
      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      // Stock filter — hide out-of-stock unless explicitly shown
      if (!showOutOfStock) {
        query = query.gt("stock_quantity", 0);
      }

      // Search filter — name or barcode (sanitized against injection)
      if (searchQuery && searchQuery.trim()) {
        const orFilter = buildSafeOrFilter(["name", "barcode"], searchQuery);
        if (orFilter) query = query.or(orFilter);
      }

      query = query.order("name", { ascending: true }).range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      return {
        data: (data as ProductWithCategory[]) ?? [],
        totalCount: count ?? 0,
        page: pageParam,
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.data.length, 0);
      return loaded < lastPage.totalCount ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 0,
    enabled: !!user && !!profile?.organization_id,
    staleTime: 30_000, // 30 seconds — keep POS data fresh
  });
}

export type { ProductWithCategory };
