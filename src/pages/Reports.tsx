import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  Wallet,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { exportSalesToCSV, exportExpensesToCSV } from "@/utils/exportUtils";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { ReportsPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { CHART_COLORS } from "@/constants/colors";

const COLORS = [...CHART_COLORS];

const Reports = () => {
  const { user } = useAuth();
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

  // Récupérer les ventes pour la période
  const { data: sales, isLoading: isLoadingSales } = useQuery({
    queryKey: ["reports-sales", user?.id, period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, sale_items(*)")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Récupérer les dépenses pour la période
  const { data: expenses, isLoading: isLoadingExpenses } = useQuery({
    queryKey: ["reports-expenses", user?.id, period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", format(start, "yyyy-MM-dd"))
        .lte("expense_date", format(end, "yyyy-MM-dd"));

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Récupérer les produits les plus vendus
  const { data: topProducts, isLoading: isLoadingTopProducts } = useQuery({
    queryKey: ["reports-top-products", user?.id, period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select(`
          product_name,
          quantity,
          total_price,
          sales!inner(user_id, created_at)
        `)
        .eq("sales.user_id", user!.id)
        .gte("sales.created_at", start.toISOString())
        .lte("sales.created_at", end.toISOString());

      if (error) throw error;

      // Agréger par produit
      const aggregated = data.reduce((acc, item) => {
        const existing = acc.find((p) => p.name === item.product_name);
        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += item.total_price;
        } else {
          acc.push({
            name: item.product_name,
            quantity: item.quantity,
            revenue: item.total_price,
          });
        }
        return acc;
      }, [] as { name: string; quantity: number; revenue: number }[]);

      return aggregated.sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    },
    enabled: !!user,
  });

  const isReportsLoading = isLoadingSales || isLoadingExpenses || isLoadingTopProducts;

  if (isReportsLoading) {
    return (
      <DashboardLayout>
        <ReportsPageSkeleton />
      </DashboardLayout>
    );
  }

  // Calculer les statistiques
  const totalSales = sales?.reduce((sum, sale) => sum + sale.total_amount, 0) || 0;
  const totalTransactions = sales?.length || 0;
  const totalExpenses = expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;
  const netProfit = totalSales - totalExpenses;

  // Répartition par mode de paiement
  const paymentDistribution = sales?.reduce((acc, sale) => {
    const method = sale.payment_method;
    const existing = acc.find((p) => p.method === method);
    if (existing) {
      existing.value += sale.total_amount;
    } else {
      acc.push({ method, value: sale.total_amount });
    }
    return acc;
  }, [] as { method: string; value: number }[]) || [];

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

  // Ventes journalières pour le graphique
  const dailySalesData = () => {
    if (!sales) return [];
    
    const days = period === "day" ? 1 : period === "week" ? 7 : 30;
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      
      const daySales = sales.filter((sale) => {
        const saleDate = new Date(sale.created_at);
        return saleDate >= dayStart && saleDate <= dayEnd;
      });
      
      data.push({
        date: format(date, period === "month" ? "dd" : "EEE", { locale: fr }),
        ventes: daySales.reduce((sum, s) => sum + s.total_amount, 0),
        transactions: daySales.length,
      });
    }
    
    return data;
  };

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
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
                  onClick={() => {
                    if (sales && sales.length > 0) {
                      exportSalesToCSV(sales, currency.displaySymbol || currency.symbol);
                      toast({
                        title: "Export réussi",
                        description: `${sales.length} ventes exportées`,
                      });
                    } else {
                      toast({
                        variant: "destructive",
                        title: "Aucune donnée",
                        description: "Pas de ventes à exporter",
                      });
                    }
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Ventes (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (expenses && expenses.length > 0) {
                      exportExpensesToCSV(expenses, currency.displaySymbol || currency.symbol);
                      toast({
                        title: "Export réussi",
                        description: `${expenses.length} dépenses exportées`,
                      });
                    } else {
                      toast({
                        variant: "destructive",
                        title: "Aucune donnée",
                        description: "Pas de dépenses à exporter",
                      });
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div className="text-2xl font-bold">{formatPrice(totalSales)}</div>
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
              <div className="text-2xl font-bold">{totalTransactions}</div>
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
              <div className="text-2xl font-bold">{formatPrice(totalExpenses)}</div>
              <div className="flex items-center gap-1 mt-1">
                <ArrowDownRight className="h-4 w-4 text-destructive" />
                <span className="text-destructive text-sm">
                  {expenses?.length || 0} dépenses
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
              <div className={`text-2xl font-bold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales Chart */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Évolution des ventes</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[220px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailySalesData()}>
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
            {topProducts && topProducts.length > 0 ? (
              <div className="space-y-4">
                {topProducts.map((product, index) => (
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
