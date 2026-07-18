import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Database } from "@/integrations/supabase/types";
import { buildSafeOrFilter } from "@/lib/postgrestSanitize";
import { getCachedData, OFFLINE_STORES, type OfflineStoreName } from "@/lib/offlineQueue";
import { buildProductSearchIndex, type SearchableProduct } from "@/lib/productSearchIndex";
import { logger } from "@/lib/logger";

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
  const { effectiveOrgId } = useOrgSelector();
  const trimmed = query.trim();

  return useQuery<ProductSearchResult[]>({
    queryKey: ["product-search", trimmed, limit, effectiveOrgId],
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
      if (effectiveOrgId) {
        queryBuilder = queryBuilder.eq("organization_id", effectiveOrgId);
      }

      const { data, error } = await queryBuilder
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

// ---------------------------------------------------------------------------
// C3 fix: Offline product search from IndexedDB cache
// ---------------------------------------------------------------------------

/**
 * Offline barcode lookup from IndexedDB product cache.
 * Returns a single product matching the barcode exactly.
 * Used when the app is offline and server lookup isn't possible.
 */
export async function lookupBarcodeOffline(
  barcode: string
): Promise<ProductSearchResult | null> {
  try {
    const allProducts = await getCachedData<ProductSearchResult>(
      OFFLINE_STORES.PRODUCT_CACHE as OfflineStoreName
    );
    return allProducts.find((p) => p.barcode === barcode) ?? null;
  } catch (e) {
    logger.warn("[OfflineSearch] lookupBarcodeOffline failed:", e);
    return null;
  }
}

/**
 * Offline product search hook using IndexedDB cache + in-memory search index.
 *
 * When the app is offline, this reads all cached products from IndexedDB,
 * builds a prefix search index, and returns matching results.
 * The index is rebuilt when the query changes (debounced by caller).
 */
export function useOfflineProductSearch(
  query: string,
  limit = 8
): ProductSearchResult[] {
  const [results, setResults] = useState<ProductSearchResult[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    let cancelled = false;

    const searchOffline = async () => {
      try {
        const allProducts = await getCachedData<ProductSearchResult>(
          OFFLINE_STORES.PRODUCT_CACHE as OfflineStoreName
        );

        if (cancelled) return;

        // Filter to active products only
        const active = allProducts.filter((p) => p.is_active !== false);

        // Build search index and search
        const index = buildProductSearchIndex<SearchableProduct & ProductSearchResult>(active);
        const matches = index.search(query, limit);

        if (!cancelled) {
          setResults(matches as ProductSearchResult[]);
        }
      } catch (e) {
        logger.warn("[OfflineSearch] useOfflineProductSearch failed:", e);
        if (!cancelled) setResults([]);
      }
    };

    searchOffline();

    return () => {
      cancelled = true;
    };
  }, [query, limit]);

  return results;
}
