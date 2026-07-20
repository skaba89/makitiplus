import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Package } from "lucide-react";

type Period = "day" | "week" | "month" | "quarter" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Aujourd'hui", week: "Cette semaine", month: "Ce mois",
  quarter: "Ce trimestre", year: "Cette année",
};

interface SellerKpi {
  seller_id: string;
  seller_name: string;
  seller_role: string;
  org_name: string;
  total_sales: number;
  total_amount: number;
  total_products_sold: number;
  avg_basket: number;
  avg_products_per_sale: number;
  top_product_name: string;
  top_category_name: string;
  last_sale_at: string | null;
  is_active: boolean;
}

export function SellerKpisCard() {
  const { user } = useAuth();
  const { effectiveOrgId } = useOrgSelector();
  const [period, setPeriod] = useState<Period>("month");

  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ["seller-kpis-detailed", period, effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_seller_kpis_detailed", {
        p_period: period,
        p_organization_id: effectiveOrgId || null,
      });
      if (error) {
        console.warn("[SellerKpis] RPC failed:", error.message);
        return [];
      }
      return (data || []) as SellerKpi[];
    },
    enabled: !!user,
  });

  const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Performance vendeurs — {PERIOD_LABELS[period]}
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
        ) : sellers.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">Aucune vente sur cette période</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendeur</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead className="text-center">Ventes</TableHead>
                  <TableHead className="text-center">Produits vendus</TableHead>
                  <TableHead className="text-right">Montant total</TableHead>
                  <TableHead className="text-right">Panier moyen</TableHead>
                  <TableHead className="text-right">Prod./vente</TableHead>
                  <TableHead className="hidden md:table-cell">Top produit</TableHead>
                  <TableHead className="hidden lg:table-cell">Top catégorie</TableHead>
                  <TableHead className="hidden sm:table-cell">Dernière vente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellers.map((s) => (
                  <TableRow key={s.seller_id}>
                    <TableCell className="font-medium">{s.seller_name}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{s.seller_role}</Badge></TableCell>
                    <TableCell className="text-center font-bold">{s.total_sales}</TableCell>
                    <TableCell className="text-center">
                      <span className="flex items-center justify-center gap-1">
                        <Package className="h-3 w-3 text-blue-500" />
                        {s.total_products_sold}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">{fmt(s.total_amount)}</TableCell>
                    <TableCell className="text-right">{fmt(s.avg_basket)}</TableCell>
                    <TableCell className="text-right">{s.avg_products_per_sale.toFixed(1)}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{s.top_product_name}</TableCell>
                    <TableCell className="hidden lg:table-cell"><Badge variant="secondary" className="text-xs">{s.top_category_name}</Badge></TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {s.last_sale_at ? new Date(s.last_sale_at).toLocaleDateString("fr-FR") : "—"}
                    </TableCell>
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
