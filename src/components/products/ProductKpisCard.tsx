import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, ThumbsDown, Package } from "lucide-react";

type Period = "day" | "week" | "month" | "quarter" | "year";
const PERIOD_LABELS: Record<Period, string> = { day: "Aujourd'hui", week: "Cette semaine", month: "Ce mois", quarter: "Ce trimestre", year: "Cette année" };

interface ProductKpi {
  product_id: string; product_name: string; category_name: string;
  quantity_sold: number; revenue: number; cost: number; margin: number;
  margin_pct: number; stock_quantity: number; revenue_pct_of_total: number;
  rank_type: string; org_name: string;
}

export function ProductKpisCard() {
  const { user } = useAuth();
  const { effectiveOrgId } = useOrgSelector();
  const [period, setPeriod] = useState<Period>("month");

  const { data: productKpis = [], isLoading } = useQuery({
    queryKey: ["product-kpis", period, effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_kpis_by_period", { p_period: period, p_organization_id: effectiveOrgId || null });
      if (error) { console.warn("[ProductKpis] RPC failed:", error.message); return []; }
      return (data || []) as ProductKpi[];
    },
    enabled: !!user,
  });

  const topProducts = productKpis.filter((p) => p.rank_type === "top");
  const badProducts = productKpis.filter((p) => p.rank_type === "bad");
  const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Produits les plus et moins vendus</CardTitle>
            <CardDescription className="mt-1">Top 5 et bottom 5 par quantité vendue</CardDescription>
          </div>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)} className="text-xs">{PERIOD_LABELS[p]}</Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <p className="text-muted-foreground text-center py-8">Chargement...</p> :
         productKpis.length === 0 ? <p className="text-muted-foreground text-center py-8">Aucune vente sur {PERIOD_LABELS[period].toLowerCase()}</p> : (
          <>
            {topProducts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2"><Trophy className="h-4 w-4 text-amber-500" /><h4 className="text-sm font-semibold text-amber-600">Top 5 — {PERIOD_LABELS[period]}</h4></div>
                <div className="overflow-x-auto"><Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-8">#</TableHead><TableHead>Produit</TableHead>
                    <TableHead className="hidden sm:table-cell">Catégorie</TableHead>
                    <TableHead className="text-center">Qté</TableHead><TableHead className="text-right">% CA</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Marge %</TableHead><TableHead className="text-center hidden lg:table-cell">Stock</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{topProducts.map((p, idx) => (
                    <TableRow key={p.product_id}>
                      <TableCell className="font-bold text-amber-500">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{p.product_name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{p.category_name}</TableCell>
                      <TableCell className="text-center font-bold">{p.quantity_sold}</TableCell>
                      <TableCell className="text-right"><Badge variant="secondary" className="text-xs">{p.revenue_pct_of_total.toFixed(1)}%</Badge></TableCell>
                      <TableCell className="text-right hidden md:table-cell"><Badge variant={p.margin_pct >= 30 ? "default" : p.margin_pct >= 10 ? "secondary" : "outline"} className="text-xs">{p.margin_pct.toFixed(0)}%</Badge></TableCell>
                      <TableCell className="text-center hidden lg:table-cell"><Badge variant={p.stock_quantity <= 0 ? "destructive" : p.stock_quantity <= 5 ? "secondary" : "outline"} className="text-xs">{p.stock_quantity}</Badge></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table></div>
              </div>
            )}
            {badProducts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2"><ThumbsDown className="h-4 w-4 text-red-500" /><h4 className="text-sm font-semibold text-red-600">Bottom 5 — {PERIOD_LABELS[period]}</h4></div>
                <div className="overflow-x-auto"><Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-8">#</TableHead><TableHead>Produit</TableHead>
                    <TableHead className="hidden sm:table-cell">Catégorie</TableHead>
                    <TableHead className="text-center">Qté</TableHead><TableHead className="text-right hidden md:table-cell">CA</TableHead><TableHead className="text-center hidden lg:table-cell">Stock</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{badProducts.map((p, idx) => (
                    <TableRow key={p.product_id}>
                      <TableCell className="font-bold text-red-400">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{p.product_name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{p.category_name}</TableCell>
                      <TableCell className="text-center">{p.quantity_sold > 0 ? <span className="font-bold">{p.quantity_sold}</span> : <Badge variant="destructive" className="text-xs">0 vente</Badge>}</TableCell>
                      <TableCell className="text-right hidden md:table-cell text-xs">{p.revenue > 0 ? `${p.revenue_pct_of_total.toFixed(1)}%` : "—"}</TableCell>
                      <TableCell className="text-center hidden lg:table-cell"><Badge variant={p.stock_quantity <= 0 ? "destructive" : p.stock_quantity <= 5 ? "secondary" : "outline"} className="text-xs">{p.stock_quantity}</Badge></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table></div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
