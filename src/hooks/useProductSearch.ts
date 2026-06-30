import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Database } from "@/integrations/supabase/types";

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
  const { user } = useAuth();
  const trimmed = query.trim();

  return useQuery<ProductSearchResult[]>({
    queryKey: ["product-search", trimmed, limit],
    queryFn: async () => {
      if (!trimmed) return [];

      // Multi-column OR search: name OR barcode
      const orFilter = `name.ilike.%${trimmed}%,barcode.ilike.%${trimmed}%`;

      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name, color, icon)")
        .eq("is_active", true)
        .or(orFilter)
        .order("name", { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data as ProductSearchResult[]) ?? [];
    },
    enabled: !!user && trimmed.length > 0,
    staleTime: 10_000, // 10 seconds — search results are ephemeral
  });
}

/**
 * Server-side barcode exact lookup.
 * Returns a single product matching the barcode exactly.
 */
export async function lookupBarcode(barcode: string): Promise<ProductSearchResult | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*, categories(name, color, icon)")
    .eq("is_active", true)
    .eq("barcode", barcode)
    .maybeSingle();

  if (error) throw error;
  return data as ProductSearchResult | null;
}
