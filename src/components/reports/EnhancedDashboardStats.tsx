import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, Package, TrendingUp, DollarSign,
  Banknote, Smartphone, CreditCard, AlertTriangle, Users, Percent
} from "lucide-react";

type Period = "day" | "week" | "month" | "quarter" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Aujourd'hui", week: "Cette semaine", month: "Ce mois",
  quarter: "Ce trimestre", year: "Cette année",
};

interface EnhancedStats {
  total_sales_amount: number;
  total_transactions: number;
  total_products_sold: number;
  avg_basket: number;
  avg_products_per_sale: number;
  cash_amount: number;
  cash_count: number;
  mobile_money_amount: number;
  mobile_money_count: number;
  credit_amount: number;
  credit_count: number;
  total_discounts: number;
  total_tax: number;
  gross_margin: number;
  total_cost: number;
  customers_served: number;
  low_stock_count: number;
  out_of_stock_count: number;
}

export function EnhancedDashboardStats() {
  const { user } = useAuth();
  const { effectiveOrgId } = useOrgSelector();
  const [period, setPeriod] = useState<Period>("month");

  const { data: stats, isLoading } = useQuery({
    queryKey: ["enhanced-dashboard-stats", period, effectiveOrgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_enhanced_dashboard_stats", {
        p_period: period,
        p_organization_id: effectiveOrgId || undefined,
      });
      if (error) {
        console.warn("[EnhancedStats] RPC failed:", error.message);
        return null;
      }
      return (Array.isArray(data) ? data[0] : data) as EnhancedStats | null;
    },
    enabled: !!user,
  });

  const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

  const kpis = [
    { label: "Montant ventes", value: stats?.total_sales_amount ?? 0, fmt: "num", icon: ShoppingCart, color: "text-green-600" },
    { label: "Transactions", value: stats?.total_transactions ?? 0, fmt: "int", icon: TrendingUp, color: "text-primary" },
    { label: "Produits vendus", value: stats?.total_products_sold ?? 0, fmt: "int", icon: Package, color: "text-blue-600" },
    { label: "Panier moyen", value: stats?.avg_basket ?? 0, fmt: "num", icon: DollarSign, color: "text-purple-600" },
    { label: "Produits/vente", value: stats?.avg_products_per_sale ?? 0, fmt: "dec", icon: Percent, color: "text-indigo-600" },
    { label: "Ventes cash", value: stats?.cash_amount ?? 0, fmt: "num", icon: Banknote, color: "text-emerald-600", sub: `${stats?.cash_count ?? 0} transactions` },
    { label: "Mobile money", value: stats?.mobile_money_amount ?? 0, fmt: "num", icon: Smartphone, color: "text-orange-600", sub: `${stats?.mobile_money_count ?? 0} transactions` },
    { label: "Ventes crédit", value: stats?.credit_amount ?? 0, fmt: "num", icon: CreditCard, color: "text-red-600", sub: `${stats?.credit_count ?? 0} ventes` },
    { label: "Marge brute", value: stats?.gross_margin ?? 0, fmt: "num", icon: DollarSign, color: "text-emerald-600" },
    { label: "Clients servis", value: stats?.customers_served ?? 0, fmt: "int", icon: Users, color: "text-cyan-600" },
    { label: "Stock faible", value: stats?.low_stock_count ?? 0, fmt: "int", icon: AlertTriangle, color: "text-amber-600" },
    { label: "Ruptures", value: stats?.out_of_stock_count ?? 0, fmt: "int", icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            KPIs détaillés
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
        ) : !stats ? (
          <p className="text-muted-foreground text-center py-4">Données non disponibles</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-1">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <p className="text-lg font-bold">
                  {kpi.fmt === "dec" ? kpi.value.toFixed(1) : fmt(kpi.value)}
                </p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                {kpi.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
