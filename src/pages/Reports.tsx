import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ShoppingCart,
  Package,
  Wallet,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { exportSalesToCSV, exportExpensesToCSV } from "@/utils/exportUtils";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { fetchAllRows } from "@/lib/batchedFetch";
import { ReportsPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { CHART_COLORS } from "@/constants/colors";
import type { Database } from "@/integrations/supabase/types";

type Sale = Database["public"]["Tables"]["sales"]["Row"];
type Expense = Database["public"]["Tables"]["expenses"]["Row"];

const COLORS = [...CHART_COLORS];

const Reports = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { formatPrice, currency } = useCurrency();
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case "day":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "week":
        return { start: startOfWeek(now, { locale: fr }), end: endOfWeek(now, { locale: fr }) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const { start, end } = getDateRange();

  // ⚡ Stats via RPC — une seule requête au lieu de 3 fetchAllRows + 3 client-side reduce()
  // L'agrégation (SUM, COUNT, GROUP BY) se fait côté serveur, réduisant drastiquement le transfert.
  const { data: reportsStats, isLoading: isReportsLoading } = useQuery({
    queryKey: ["reports-stats", user?.id, profile?.organization_id, period],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const { data, error } = await supabase.rpc("get_reports_stats", {
        p_organization_id: profile.organization_id,
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!profile?.organization_id,
  });

  if (isReportsLoading) {
    return (
      <DashboardLayout>
        <ReportsPageSkeleton />
      </DashboardLayout>
    );
  }

  // Stats from RPC
  const totalSales = reportsStats?.totalSales ?? 0;
  const totalTransactions = reportsStats?.totalTransactions ?? 0;
  const totalExpenses = reportsStats?.totalExpenses ?? 0;
  const netProfit = totalSales - totalExpenses;

  // Payment distribution from RPC
  const paymentDistribution: { method: string; value: number }[] = reportsStats?.paymentBreakdown ?? [];

  const paymentLabels: Record<string, string> = {
    cash: "Espèces",
    wave: "Wave",
    orange_money: "Orange Money",
    mtn_money: "MTN Money",
    moov_money: "Moov Money",
    mpesa: "M-Pesa",
    card: "Carte",
    credit: "Crédit",
  };

  // Daily sales for chart — from RPC (server-side generate_series)
  const dailySalesData: { date: string; ventes: number; transactions: number }[] = (() => {
    if (!reportsStats?.dailySales) return [];
    return reportsStats.dailySales.map((d: { date: string; sales: number; transactions: number }) => {
      // Format date labels
      const dateObj = new Date(d.date);
      const label = period === "month"
        ? format(dateObj, "dd", { locale: fr })
        : format(dateObj, "EEE", { locale: fr });
      return {
        date: label,
        ventes: Number(d.sales),
        transactions: Number(d.transactions),
      };
    });
  })();

  // formatPrice provient maintenant de useCurrency

  const chartConfig = {
    ventes: {
      label: "Ventes",
      color: "hsl(var(--primary))",
    },
    transactions: {
      label: "Transactions",
      color: "hsl(var(--success))",
    },
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
              Rapports
            </h1>
            <p className="text-muted-foreground mt-1">
              Analysez les performances de votre boutique
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="day" className="gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Aujourd'hui</span>
                  <span className="sm:hidden">Jour</span>
                </TabsTrigger>
                <TabsTrigger value="week" className="text-xs sm:text-sm">Semaine</TabsTrigger>
                <TabsTrigger value="month" className="text-xs sm:text-sm">Mois</TabsTrigger>
              </TabsList>
            </Tabs>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Exporter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const sales = await fetchAllRows<Sale>("sales", "*, sale_items(*)", {
                        filters: [
                          ...(profile?.organization_id ? [{ column: "organization_id", operator: "eq" as const, value: profile.organization_id }] : []),
                          { column: "created_at", operator: "gte", value: start.toISOString() },
                          { column: "created_at", operator: "lte", value: end.toISOString() },
                        ],
                        orderBy: { column: "created_at", ascending: true },
                      });
                      if (sales && sales.length > 0) {
                        exportSalesToCSV(sales as Sale[], currency.displaySymbol || currency.symbol);
                        toast({ title: "Export réussi", description: `${sales.length} ventes exportées` });
                      } else {
                        toast({ variant: "destructive", title: "Aucune donnée", description: "Pas de ventes à exporter" });
                      }
                    } catch {
                      toast({ variant: "destructive", title: "Erreur", description: "Impossible d'exporter les ventes" });
                    }
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Ventes (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const expenses = await fetchAllRows<Expense>("expenses", "*", {
                        filters: [
                          ...(profile?.organization_id ? [{ column: "organization_id", operator: "eq" as const, value: profile.organization_id }] : []),
                          { column: "expense_date", operator: "gte", value: format(start, "yyyy-MM-dd") },
                          { column: "expense_date", operator: "lte", value: format(end, "yyyy-MM-dd") },
                        ],
                      });
                      if (expenses && expenses.length > 0) {
                        exportExpensesToCSV(expenses as Expense[], currency.displaySymbol || currency.symbol);
                        toast({ title: "Export réussi", description: `${expenses.length} dépenses exportées` });
                      } else {
                        toast({ variant: "destructive", title: "Aucune donnée", description: "Pas de dépenses à exporter" });
                      }
                    } catch {
                      toast({ variant: "destructive", title: "Erreur", description: "Impossible d'exporter les dépenses" });
                    }
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Dépenses (CSV)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Chiffre d'affaires
              </CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <ShoppingCart className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{formatPrice(totalSales)}</div>
              <div className="flex items-center gap-1 mt-1">
                <ArrowUpRight className="h-4 w-4 text-success" />
                <span className="text-success text-sm">{totalTransactions} ventes</span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Transactions
              </CardTitle>
              <div className="p-2 rounded-lg bg-success/10">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{totalTransactions}</div>
              <div className="text-muted-foreground text-sm mt-1">
                {totalTransactions > 0
                  ? `Panier moyen: ${formatPrice(Math.round(totalSales / totalTransactions))}`
                  : "Aucune vente"}
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Dépenses
              </CardTitle>
              <div className="p-2 rounded-lg bg-destructive/10">
                <Wallet className="h-4 w-4 text-destructive" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{formatPrice(totalExpenses)}</div>
              <div className="flex items-center gap-1 mt-1">
                <ArrowDownRight className="h-4 w-4 text-destructive" />
                <span className="text-destructive text-sm">
                  {reportsStats?.expenseCount || 0} dépenses
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Résultat net
              </CardTitle>
              <div className={`p-2 rounded-lg ${netProfit >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                <Package className={`h-4 w-4 ${netProfit >= 0 ? "text-success" : "text-destructive"}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-lg sm:text-2xl font-bold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                {formatPrice(netProfit)}
              </div>
              <div className="text-muted-foreground text-sm mt-1">
                Ventes - Dépenses
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Indicatif. Ne tient pas compte des coûts d'achat.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Sales Chart */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Évolution des ventes</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[220px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailySalesData}>
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(value) => `${value / 1000}k`} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="ventes"
                      fill="var(--color-ventes)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Payment Distribution */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Répartition par mode de paiement</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentDistribution.length > 0 ? (
                <div className="h-[220px] sm:h-[300px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="method"
                        label={({ method, percent }) =>
                          `${paymentLabels[method] || method} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {paymentDistribution.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[220px] sm:h-[300px] flex items-center justify-center text-muted-foreground">
                  Aucune donnée disponible
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Products */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Produits les plus vendus</CardTitle>
          </CardHeader>
          <CardContent>
            {reportsStats?.topProducts && reportsStats.topProducts.length > 0 ? (
              <div className="space-y-4">
                {reportsStats.topProducts.map((product: { name: string; quantity: number; revenue: number }, index: number) => (
                  <div key={product.name} className="flex items-center gap-4">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-primary-foreground"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {product.quantity} vendus
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">
                        {formatPrice(product.revenue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune vente pour cette période</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
