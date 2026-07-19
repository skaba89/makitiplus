import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, ThumbsDown, Package } from "lucide-react";

type Period = "day" | "week" | "month" | "quarter" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Aujourd'hui",
  week: "Cette semaine",
  month: "Ce mois",
  quarter: "Ce trimestre",
  year: "Cette année",
};

interface ProductKpi {
  product_id: string;
  product_name: string;
  category_name: string;
  quantity_sold: number;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number;
  stock_quantity: number;
  revenue_pct_of_total: number;
  rank_type: string;
  org_name: string;
}

export function ProductKpisCard() {
  const { user } = useAuth();
  const { effectiveOrgId } = useOrgSelector();
  const [period, setPeriod] = useState<Period>("month");

  const { data: productKpis = [], isLoading } = useQuery({
    queryKey: ["product-kpis", period, effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_kpis_by_period", {
        p_period: period,
        p_organization_id: effectiveOrgId || null,
      });
      if (error) {
        console.warn("[ProductKpis] RPC failed:", error.message);
        return fetchProductKpisClientSide(period, effectiveOrgId);
      }
      const result = (data || []) as ProductKpi[];
      const hasNonZero = result.some((p) => p.quantity_sold > 0);
      if (!hasNonZero && effectiveOrgId) {
        const fallback = await fetchProductKpisClientSide(period, effectiveOrgId);
        if (fallback.some((p) => p.quantity_sold > 0)) return fallback;
      }
      return result;
    },
    enabled: !!user,
  });

  const topProducts = productKpis.filter((p) => p.rank_type === "top");
  const badProducts = productKpis.filter((p) => p.rank_type === "bad");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Produits les plus et moins vendus
            </CardTitle>
            <CardDescription className="mt-1">
              Top 5 et bottom 5 par quantité vendue
            </CardDescription>
          </div>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)} className="text-xs">
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Chargement...</p>
        ) : productKpis.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Aucune vente sur {PERIOD_LABELS[period].toLowerCase()}</p>
        ) : (
          <>
            {topProducts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <h4 className="text-sm font-semibold text-amber-600">Top 5 — {PERIOD_LABELS[period]}</h4>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Produit</TableHead>
                        <TableHead className="hidden sm:table-cell">Catégorie</TableHead>
                        <TableHead className="text-center">Qté</TableHead>
                        <TableHead className="text-right">% CA</TableHead>
                        <TableHead className="text-right hidden md:table-cell">Marge %</TableHead>
                        <TableHead className="text-center hidden lg:table-cell">Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topProducts.map((p, idx) => (
                        <TableRow key={p.product_id}>
                          <TableCell className="font-bold text-amber-500">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{p.product_name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{p.category_name}</TableCell>
                          <TableCell className="text-center font-bold">{p.quantity_sold}</TableCell>
                          <TableCell className="text-right"><Badge variant="secondary" className="text-xs">{p.revenue_pct_of_total.toFixed(1)}%</Badge></TableCell>
                          <TableCell className="text-right hidden md:table-cell"><Badge variant={p.margin_pct >= 30 ? "default" : p.margin_pct >= 10 ? "secondary" : "outline"} className="text-xs">{p.margin_pct.toFixed(0)}%</Badge></TableCell>
                          <TableCell className="text-center hidden lg:table-cell"><Badge variant={p.stock_quantity <= 0 ? "destructive" : p.stock_quantity <= 5 ? "secondary" : "outline"} className="text-xs">{p.stock_quantity}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {badProducts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ThumbsDown className="h-4 w-4 text-red-500" />
                  <h4 className="text-sm font-semibold text-red-600">Bottom 5 — {PERIOD_LABELS[period]}</h4>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Produit</TableHead>
                        <TableHead className="hidden sm:table-cell">Catégorie</TableHead>
                        <TableHead className="text-center">Qté</TableHead>
                        <TableHead className="text-right hidden md:table-cell">CA</TableHead>
                        <TableHead className="text-center hidden lg:table-cell">Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {badProducts.map((p, idx) => (
                        <TableRow key={p.product_id}>
                          <TableCell className="font-bold text-red-400">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{p.product_name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{p.category_name}</TableCell>
                          <TableCell className="text-center">{p.quantity_sold > 0 ? <span className="font-bold">{p.quantity_sold}</span> : <Badge variant="destructive" className="text-xs">0 vente</Badge>}</TableCell>
                          <TableCell className="text-right hidden md:table-cell text-xs">{p.revenue > 0 ? `${p.revenue_pct_of_total.toFixed(1)}%` : "—"}</TableCell>
                          <TableCell className="text-center hidden lg:table-cell"><Badge variant={p.stock_quantity <= 0 ? "destructive" : p.stock_quantity <= 5 ? "secondary" : "outline"} className="text-xs">{p.stock_quantity}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

async function fetchProductKpisClientSide(period: Period, effectiveOrgId: string | undefined): Promise<ProductKpi[]> {
  if (!effectiveOrgId) return [];
  const now = new Date();
  const startDate = new Date();
  switch (period) {
    case "day": startDate.setHours(0, 0, 0, 0); break;
    case "week": startDate.setDate(now.getDate() - 7); break;
    case "month": startDate.setMonth(now.getMonth(), 1); startDate.setHours(0, 0, 0, 0); break;
    case "quarter": { const q = Math.floor(now.getMonth() / 3) * 3; startDate.setMonth(q, 1); startDate.setHours(0, 0, 0, 0); break; }
    case "year": startDate.setMonth(0, 1); startDate.setHours(0, 0, 0, 0); break;
  }

  const { data: products } = await supabase.from("products").select("id, name, stock_quantity, is_active, categories(name)").eq("organization_id", effectiveOrgId).eq("is_active", true);
  if (!products) return [];

  const { data: sales } = await supabase.from("sales").select("id, sale_items(product_id, quantity, unit_price, cost_price)").eq("organization_id", effectiveOrgId).gte("created_at", startDate.toISOString()).lte("created_at", now.toISOString());

  const stats = new Map<string, { quantity: number; revenue: number; cost: number }>();
  let totalRevenue = 0;
  for (const sale of sales || []) {
    const items = (sale as { sale_items?: Array<{ product_id: string; quantity: number; unit_price: number; cost_price: number }> }).sale_items;
    if (items) for (const si of items) {
      const pid = si.product_id, qty = Number(si.quantity) || 0, rev = qty * Number(si.unit_price || 0), cost = qty * Number(si.cost_price || 0);
      const ex = stats.get(pid) || { quantity: 0, revenue: 0, cost: 0 };
      ex.quantity += qty; ex.revenue += rev; ex.cost += cost; stats.set(pid, ex); totalRevenue += rev;
    }
  }

  const kpis: ProductKpi[] = (products || []).map((p) => {
    const s = stats.get(p.id) || { quantity: 0, revenue: 0, cost: 0 };
    const margin = s.revenue - s.cost;
    return { product_id: p.id, product_name: p.name, category_name: (p.categories as { name: string } | null)?.name || "—", quantity_sold: s.quantity, revenue: s.revenue, cost: s.cost, margin, margin_pct: s.revenue > 0 ? (margin / s.revenue) * 100 : 0, stock_quantity: Number(p.stock_quantity) || 0, revenue_pct_of_total: totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0, rank_type: "", org_name: "" };
  });

  const sorted = [...kpis].sort((a, b) => b.quantity_sold - a.quantity_sold || b.revenue - a.revenue);
  const top = sorted.slice(0, 5).map((p) => ({ ...p, rank_type: "top" }));
  const bottom = [...sorted].reverse().slice(0, 5).map((p) => ({ ...p, rank_type: "bad" }));
  const seen = new Set<string>(); const result: ProductKpi[] = [];
  for (const p of [...top, ...bottom]) { if (!seen.has(p.product_id)) { seen.add(p.product_id); result.push(p); } }
  return result;
}
