import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FolderOpen, Package } from "lucide-react";

type Period = "day" | "week" | "month" | "quarter" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Aujourd'hui", week: "Cette semaine", month: "Ce mois",
  quarter: "Ce trimestre", year: "Cette année",
};

interface CategoryKpi {
  category_id: string;
  category_name: string;
  category_color: string | null;
  category_icon: string | null;
  quantity_sold: number;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number;
  sales_count: number;
  revenue_pct: number;
  top_product_name: string;
  products_in_category: number;
}

export function CategoryKpisCard() {
  const { user } = useAuth();
  const { effectiveOrgId } = useOrgSelector();
  const [period, setPeriod] = useState<Period>("month");

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["category-kpis", period, effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_category_kpis", {
        p_period: period,
        p_organization_id: effectiveOrgId || undefined,
      });
      if (error) {
        console.warn("[CategoryKpis] RPC failed:", error.message);
        return [];
      }
      return (data || []) as CategoryKpi[];
    },
    enabled: !!user,
  });

  const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Performance par catégorie — {PERIOD_LABELS[period]}
          </CardTitle>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)} className="text-xs">
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-4">Chargement...</p>
        ) : categories.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">Aucune vente sur cette période</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-center">Qté vendue</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="text-right">% CA</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Marge</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Marge %</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Ventes</TableHead>
                  <TableHead className="hidden lg:table-cell">Top produit</TableHead>
                  <TableHead className="text-center hidden lg:table-cell">Produits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.filter(c => c.quantity_sold > 0 || c.revenue > 0).map((c) => (
                  <TableRow key={c.category_id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {c.category_color && <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: c.category_color }} />}
                        {c.category_name}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="flex items-center justify-center gap-1 font-bold">
                        <Package className="h-3 w-3 text-blue-500" />
                        {c.quantity_sold}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">{fmt(c.revenue)}</TableCell>
                    <TableCell className="text-right"><Badge variant="secondary" className="text-xs">{c.revenue_pct.toFixed(1)}%</Badge></TableCell>
                    <TableCell className="text-right hidden md:table-cell text-emerald-600">{fmt(c.margin)}</TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      <Badge variant={c.margin_pct >= 30 ? "default" : c.margin_pct >= 10 ? "secondary" : "outline"} className="text-xs">
                        {c.margin_pct.toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell">{c.sales_count}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{c.top_product_name}</TableCell>
                    <TableCell className="text-center hidden lg:table-cell">{c.products_in_category}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
