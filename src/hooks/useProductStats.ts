import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { ProductStatsRpc } from "@/types";
import { logger } from "@/lib/logger";

/**
 * Product stats hook — single source of truth.
 *
 * Uses the get_product_stats RPC which returns aggregated counts
 * (total products, low stock, out of stock, category breakdown)
 * scoped to the user's organization. Replaces a fetchAllRows + client-side reduce.
 *
 * Pour super_admin : utilise effectiveOrgId (sélecteur d'org) au lieu du profil.
 * Le RPC get_product_stats utilise auth.uid() en interne, incompatible avec
 * le sélecteur d'org. Donc pour super_admin, on fait un count client-side.
 */
export function useProductStats() {
  const { user, profile } = useAuth();
  const { isSuperAdmin, effectiveOrgId } = useOrgSelector();

  return useQuery<ProductStatsRpc>({
    queryKey: ["products-stats", user?.id, effectiveOrgId, isSuperAdmin],
    queryFn: async () => {
      const orgId = effectiveOrgId || profile?.organization_id;
      if (!orgId) {
        return { totalProducts: 0, lowStockCount: 0, outOfStockCount: 0, categoryCounts: {} };
      }

      // Pour super_admin : count client-side (le RPC utilise auth.uid())
      if (isSuperAdmin) {
        const { data: products, error } = await supabase
          .from("products")
          .select("id, stock_quantity, min_stock_alert, is_active, categories(name)")
          .eq("organization_id", orgId);
        if (error) {
          logger.warn("[ProductStats] client-side fetch failed:", error.message);
          return { totalProducts: 0, lowStockCount: 0, outOfStockCount: 0, categoryCounts: {} };
        }
        const total = (products || []).length;
        const lowStock = (products || []).filter(p => p.stock_quantity <= (p.min_stock_alert || 0)).length;
        const outOfStock = (products || []).filter(p => p.stock_quantity <= 0).length;
        const catCounts: Record<string, number> = {};
        for (const p of (products || [])) {
          const catName = (p.categories as { name: string } | null)?.name || "Autre";
          catCounts[catName] = (catCounts[catName] || 0) + 1;
        }
        return {
          totalProducts: total,
          lowStockCount: lowStock,
          outOfStockCount: outOfStock,
          categoryCounts: catCounts,
        };
      }

      // Pour les autres users : utiliser le RPC (utilise auth.uid() en interne)
      const { data, error } = await supabase.rpc("get_product_stats");
      if (error) {
        logger.warn("[ProductStats] get_product_stats RPC failed:", error.message);
        return { totalProducts: 0, lowStockCount: 0, outOfStockCount: 0, categoryCounts: {} };
      }
      const typed = data as unknown as ProductStatsRpc;
      return {
        totalProducts: typed.totalProducts ?? 0,
        lowStockCount: typed.lowStockCount ?? 0,
        outOfStockCount: typed.outOfStockCount ?? 0,
        categoryCounts: typed.categoryCounts ?? {},
      };
    },
    enabled: !!user && (isSuperAdmin || !!profile?.organization_id),
  });
}
