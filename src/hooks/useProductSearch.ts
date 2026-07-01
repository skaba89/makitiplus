import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Database } from "@/integrations/supabase/types";
import { buildSafeOrFilter } from "@/lib/postgrestSanitize";

/**
 * Result product from server-side search.
 */
type ProductSearchResult = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

/**
 * Server-side product search hook for POS autocomplete.
 * Uses PostgREST `.or()` + `.ilike()` for fast text matching.
 * Only fetches when query is non-empty and debounced by the caller.
 */
export function useProductSearch(query: string, limit = 8) {
  const { user, profile } = useAuth();
  const trimmed = query.trim();

  return useQuery<ProductSearchResult[]>({
    queryKey: ["product-search", trimmed, limit, profile?.organization_id],
    queryFn: async () => {
      if (!trimmed) return [];

      // Multi-column OR search: name OR barcode (sanitized against injection)
      const orFilter = buildSafeOrFilter(["name", "barcode"], trimmed);
      if (!orFilter) return [];

      let queryBuilder = supabase
        .from("products")
        .select("*, categories(name, color, icon)")
        .eq("is_active", true)
        .or(orFilter);

      // Filtre organization_id — defense-in-depth (+ performance index)
      if (profile?.organization_id) {
        queryBuilder = queryBuilder.eq("organization_id", profile.organization_id);
      }

      const { data, error } = await queryBuilder
        .order("name", { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data as ProductSearchResult[]) ?? [];
    },
    enabled: !!user && !!profile?.organization_id && trimmed.length > 0,
    staleTime: 10_000, // 10 seconds — search results are ephemeral
  });
}

/**
 * Server-side barcode exact lookup.
 * Returns a single product matching the barcode exactly.
 * @param organization_id — scoping to org for defense-in-depth
 */
export async function lookupBarcode(
  barcode: string,
  organizationId?: string | null
): Promise<ProductSearchResult | null> {
  let query = supabase
    .from("products")
    .select("*, categories(name, color, icon)")
    .eq("is_active", true)
    .eq("barcode", barcode);

  // Filtre organization_id — defense-in-depth
  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data as ProductSearchResult | null;
}
