import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  TrendingUp,
  Download,
  FileSpreadsheet,
  Truck,
  DollarSign,
  Tag,
  BarChart3,
  Lock,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { exportSalesToCSV, exportExpensesToCSV } from "@/utils/exportUtils";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { OrgSelector } from "@/components/ui/org-selector";
import { CurrencyDisplaySelector } from "@/components/ui/currency-display-selector";
import { fetchAllRows } from "@/lib/batchedFetch";
import { ReportsPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { CHART_COLORS } from "@/constants/colors";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";
import { ProductKpisCard } from "@/components/products/ProductKpisCard";
import { EnhancedDashboardStats } from "@/components/reports/EnhancedDashboardStats";
import { SellerKpisCard } from "@/components/reports/SellerKpisCard";
import { CategoryKpisCard } from "@/components/reports/CategoryKpisCard";
import type { Database } from "@/integrations/supabase/types";

type Sale = Database["public"]["Tables"]["sales"]["Row"];
type Expense = Database["public"]["Tables"]["expenses"]["Row"];

const COLORS = [...CHART_COLORS];

/** Supplier with aggregated product stats */
interface SupplierReport {
  id: string;
  name: string;
  product_count: number;
  total_stock: number;
  stock_value_at_cost: number;
  stock_value_at_price: number;
}

const Reports = () => {
  const { t } = useTranslation("reports");
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currency } = useCurrency();
  const { effectiveOrgId } = useOrgSelector();
  const {
    formatDisplayPrice,
    displayCurrencyCode,
    orgCurrencyCode,
    setDisplayCurrency,
    ratesLoading,
    refreshRates,
    isConverted,
  } = useDisplayCurrency();
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

  // Forme attendue de get_reports_stats — la RPC est typée `Json` côté
  // Supabase (retour composite), donc TypeScript ne connaît pas sa forme
  // réelle sans cette annotation explicite.
  interface ReportsStats {
    totalSales: number;
    totalTransactions: number;
    totalExpenses: number;
    totalDiscount: number;
    totalCost: number;
    grossMargin: number;
    grossMarginPct: number;
    paymentBreakdown: { method: string; value: number }[];
    dailySales: { date: string; sales: number; transactions: number }[];
    expenseCount: number;
    topProducts: { name: string; quantity: number; revenue: number }[];
  }

  // ⚡ Stats via RPC — une seule requête au lieu de 3 fetchAllRows + 3 client-side reduce()
  // L'agrégation (SUM, COUNT, GROUP BY) se fait côté serveur, réduisant drastiquement le transfert.
  // Fallback gracieux : si la RPC échoue, on retourne null pour ne pas déclencher l'ErrorBoundary.
  const { data: reportsStats, isLoading: isReportsLoading } = useQuery({
    queryKey: ["reports-stats", user?.id, effectiveOrgId, period],
    queryFn: async (): Promise<ReportsStats | null> => {
      if (!effectiveOrgId) return null;
      try {
        const { data, error } = await supabase.rpc("get_reports_stats", {
          p_organization_id: effectiveOrgId,
          p_start: start.toISOString(),
          p_end: end.toISOString(),
        });
        if (error) return null;
        // La RPC peut retourner un tableau [{...}] ou un objet {...}
        // selon la version Supabase. On normalise vers un objet.
        if (Array.isArray(data)) {
          return (data[0] as unknown as ReportsStats) ?? null;
        }
        return data as unknown as ReportsStats;
      } catch {
        return null;
      }
    },
    enabled: !!user,
    retry: 1,
    staleTime: 30_000, // 30 secondes — évite les re-fetchs trop fréquents
  });

  // Fetch supplier analytics (products with supplier info)
  // Fallback : si is_active n'existe pas en DB, réessayer sans filtre
  const { data: supplierReport } = useQuery({
    queryKey: ["reports-suppliers", user?.id, effectiveOrgId],
    queryFn: async () => {
      try {
        interface SupplierReportProductRow {
          supplier_id: string | null;
          stock_quantity: number;
          cost_price: number | null;
          price: number;
        }
        let products: SupplierReportProductRow[] | null = null;
        let productsQuery = supabase
          .from("products")
          .select("id, name, cost_price, price, stock_quantity, supplier_id, suppliers(id, name)")
          .eq("is_active", true);
        if (effectiveOrgId) {
          productsQuery = productsQuery.eq("organization_id", effectiveOrgId);
        }
        const { data: productsData, error: productsError } = await productsQuery;

        if (productsError) {
          if (productsError.message.includes("does not exist") || productsError.message.includes("Could not find")) {
            let retryQuery = supabase
              .from("products")
              .select("id, name, cost_price, price, stock_quantity, supplier_id, suppliers(id, name)");
            if (effectiveOrgId) {
              retryQuery = retryQuery.eq("organization_id", effectiveOrgId);
            }
            const { data: retryData } = await retryQuery;
            products = retryData;
          } else {
            return [];
          }
        } else {
          products = productsData;
        }

        const supplierMap = new Map<string, SupplierReport>();

        let suppliersQuery = supabase
          .from("suppliers")
          .select("id, name")
          .eq("is_active", true);
        if (effectiveOrgId) {
          suppliersQuery = suppliersQuery.eq("organization_id", effectiveOrgId);
        }
        const { data: allSuppliers } = await suppliersQuery;

        allSuppliers?.forEach((s) => {
          supplierMap.set(s.id, {
            id: s.id,
            name: s.name,
            product_count: 0,
            total_stock: 0,
            stock_value_at_cost: 0,
            stock_value_at_price: 0,
          });
        });

        (products || []).forEach((p) => {
          const sid = p.supplier_id;
          if (!sid) return;
          const existing = supplierMap.get(sid);
          if (existing) {
            existing.product_count += 1;
            existing.total_stock += p.stock_quantity;
            existing.stock_value_at_cost += Number(p.cost_price || 0) * p.stock_quantity;
            existing.stock_value_at_price += Number(p.price) * p.stock_quantity;
          }
        });

        return Array.from(supplierMap.values())
          .filter((s) => s.product_count > 0)
          .sort((a, b) => b.stock_value_at_cost - a.stock_value_at_cost);
      } catch {
        return [];
      }
    },
    enabled: !!user,
    retry: 1,
  });

  // Products without supplier
  // Fallback : { count: 0, totalValue: 0 } si erreur
  const { data: orphanProducts } = useQuery({
    queryKey: ["reports-orphan-products", user?.id, effectiveOrgId],
    queryFn: async () => {
      try {
        let query = supabase
          .from("products")
          .select("id, name, cost_price, price, stock_quantity")
          .eq("is_active", true)
          .is("supplier_id", null);
        if (effectiveOrgId) {
          query = query.eq("organization_id", effectiveOrgId);
        }
        const { data, error } = await query;

        if (error) return { count: 0, totalValue: 0 };

        const totalValue = (data || []).reduce(
          (sum, p) => sum + Number(p.cost_price || p.price) * p.stock_quantity,
          0
        );

        return { count: (data || []).length, totalValue };
      } catch {
        return { count: 0, totalValue: 0 };
      }
    },
    enabled: !!user,
    retry: 1,
  });

  // Early return for loading state — MUST be after all hooks (Rules of Hooks)
  // ⚠️ Ne pas bloquer sur le skeleton si la query est désactivée (pas d'org_id)
  // ou si reportsStats est déjà null (RPC a échoué → on affiche la page avec des zéros)
  if (isReportsLoading && effectiveOrgId && reportsStats === undefined) {
    return (
      <DashboardLayout>
        <ReportsPageSkeleton />
      </DashboardLayout>
    );
  }

  // Si pas d'organisation, afficher un message au lieu du skeleton
  if (!effectiveOrgId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">{t("noOrganization.title")}</h2>
          <p className="text-muted-foreground">
            {t("noOrganization.description")}
          </p>
        </div>
      </DashboardLayout>
    );
  }

  // Calculate stats from RPC data
  const totalSales = reportsStats?.totalSales ?? 0;
  const totalTransactions = reportsStats?.totalTransactions ?? 0;
  const totalExpenses = reportsStats?.totalExpenses ?? 0;
  const netProfit = totalSales - totalExpenses;

  // Marge brute et remises (v2 RPC — fallback à 0 si RPC pas encore mise à jour)
  const totalDiscount = reportsStats?.totalDiscount ?? 0;
  const totalCost = reportsStats?.totalCost ?? 0;
  const grossMargin = reportsStats?.grossMargin ?? Math.max(0, totalSales - totalCost);
  const grossMarginPct = reportsStats?.grossMarginPct ?? (totalSales > 0 ? Math.round((grossMargin / totalSales) * 10000) / 100 : 0);
  // Bénéfice net réel = marge brute - dépenses (≠ simple CA - dépenses)
  const netProfitWithMargin = grossMargin - totalExpenses;

  // Payment distribution from RPC
  const paymentDistribution: { method: string; value: number }[] = reportsStats?.paymentBreakdown ?? [];

  const PAYMENT_METHOD_KEYS = ["cash", "wave", "orange_money", "mtn_money", "moov_money", "mpesa", "card", "credit"];
  const paymentLabels: Record<string, string> = Object.fromEntries(
    PAYMENT_METHOD_KEYS.map((method) => [method, t(`paymentLabels.${method}`)])
  );

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

  // Supplier chart data — clés techniques stables (indépendantes de la langue
  // affichée) : le label visible vient de supplierChartConfig, pas du dataKey.
  const supplierChartData = (supplierReport || []).slice(0, 6).map((s) => ({
    name: s.name.length > 12 ? s.name.slice(0, 12) + "…" : s.name,
    purchaseValue: s.stock_value_at_cost,
    saleValue: s.stock_value_at_price,
  }));

  const supplierChartConfig = {
    purchaseValue: {
      label: t("supplierAnalytics.stockValueChart.purchaseValue"),
      color: "hsl(var(--primary))",
    },
    saleValue: {
      label: t("supplierAnalytics.stockValueChart.saleValue"),
      color: "hsl(var(--success))",
    },
  };

  const chartConfig = {
    ventes: {
      label: t("charts.salesSeriesLabel"),
      color: "hsl(var(--primary))",
    },
    transactions: {
      label: t("stats.transactions.title"),
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
              {t("title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <OrgSelector />
            <CurrencyDisplaySelector
              orgCurrencyCode={orgCurrencyCode}
              displayCurrencyCode={displayCurrencyCode}
              onDisplayCurrencyChange={setDisplayCurrency}
              ratesLoading={ratesLoading}
              onRefreshRates={refreshRates}
            />
            <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="day" className="gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("periods.todayFull")}</span>
                  <span className="sm:hidden">{t("periods.todayShort")}</span>
                </TabsTrigger>
                <TabsTrigger value="week" className="text-xs sm:text-sm">{t("periods.week")}</TabsTrigger>
                <TabsTrigger value="month" className="text-xs sm:text-sm">{t("periods.month")}</TabsTrigger>
              </TabsList>
            </Tabs>

            <FeatureGate feature="exports">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  {t("export.button")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const sales = await fetchAllRows<Sale>("sales", "*, sale_items(*)", {
                        filters: [
                          ...(effectiveOrgId ? [{ column: "organization_id", operator: "eq" as const, value: effectiveOrgId }] : []),
                          { column: "created_at", operator: "gte", value: start.toISOString() },
                          { column: "created_at", operator: "lte", value: end.toISOString() },
                        ],
                        orderBy: { column: "created_at", ascending: true },
                      });
                      if (sales && sales.length > 0) {
                        exportSalesToCSV(sales as Sale[], currency.displaySymbol || currency.symbol);
                        toast({ title: t("export.salesSuccessTitle"), description: t("export.salesSuccessDescription", { count: sales.length }) });
                      } else {
                        toast({ variant: "destructive", title: t("export.noSalesTitle"), description: t("export.noSalesDescription") });
                      }
                    } catch {
                      toast({ variant: "destructive", title: t("export.salesErrorTitle"), description: t("export.salesErrorDescription") });
                    }
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {t("export.salesCsv")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const expenses = await fetchAllRows<Expense>("expenses", "*", {
                        filters: [
                          ...(effectiveOrgId ? [{ column: "organization_id", operator: "eq" as const, value: effectiveOrgId }] : []),
                          { column: "expense_date", operator: "gte", value: format(start, "yyyy-MM-dd") },
                          { column: "expense_date", operator: "lte", value: format(end, "yyyy-MM-dd") },
                        ],
                      });
                      if (expenses && expenses.length > 0) {
                        exportExpensesToCSV(expenses as Expense[], currency.displaySymbol || currency.symbol);
                        toast({ title: t("export.expensesSuccessTitle"), description: t("export.expensesSuccessDescription", { count: expenses.length }) });
                      } else {
                        toast({ variant: "destructive", title: t("export.noExpensesTitle"), description: t("export.noExpensesDescription") });
                      }
                    } catch {
                      toast({ variant: "destructive", title: t("export.expensesErrorTitle"), description: t("export.expensesErrorDescription") });
                    }
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {t("export.expensesCsv")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </FeatureGate>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("stats.revenue.title")}
              </CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <ShoppingCart className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{formatDisplayPrice(totalSales, { showOriginal: isConverted })}</div>
              <div className="flex items-center gap-1 mt-1">
                <ArrowUpRight className="h-4 w-4 text-success" />
                <span className="text-success text-sm">{t("stats.revenue.salesCount", { count: totalTransactions })}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("stats.transactions.title")}
              </CardTitle>
              <div className="p-2 rounded-lg bg-success/10">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{totalTransactions}</div>
              <div className="text-muted-foreground text-sm mt-1">
                {totalTransactions > 0
                  ? t("stats.transactions.averageBasket", { amount: formatDisplayPrice(Math.round(totalSales / totalTransactions), { showOriginal: isConverted }) })
                  : t("stats.transactions.noSales")}
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("stats.expenses.title")}
              </CardTitle>
              <div className="p-2 rounded-lg bg-destructive/10">
                <Wallet className="h-4 w-4 text-destructive" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{formatDisplayPrice(totalExpenses, { showOriginal: isConverted })}</div>
              <div className="flex items-center gap-1 mt-1">
                <ArrowDownRight className="h-4 w-4 text-destructive" />
                <span className="text-destructive text-sm">
                  {t("stats.expenses.count", { count: reportsStats?.expenseCount || 0 })}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("stats.netResult.title")}
              </CardTitle>
              <div className={`p-2 rounded-lg ${netProfit >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                <Package className={`h-4 w-4 ${netProfit >= 0 ? "text-success" : "text-destructive"}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-lg sm:text-2xl font-bold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                {formatDisplayPrice(netProfit, { showOriginal: isConverted })}
              </div>
              <div className="text-muted-foreground text-sm mt-1">
                {t("stats.netResult.subtitle")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("stats.netResult.disclaimer")}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ═══════ Rentabilité (marge brute + remises + bénéfice net réel) ═══════ */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{t("profitability.title")}</h2>
            <Badge variant="outline" className="text-xs">
              {totalTransactions > 0
                ? t("profitability.salesBadge", { count: totalTransactions })
                : t("profitability.noSales")}
            </Badge>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Marge brute */}
            <Card className="card-elevated border-primary/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("profitability.grossMargin.title")}
                </CardTitle>
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-lg sm:text-2xl font-bold text-primary">
                  {formatDisplayPrice(grossMargin, { showOriginal: isConverted })}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t("profitability.grossMargin.subtitle")}
                </div>
                {totalCost > 0 && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t("profitability.grossMargin.cost", { amount: formatDisplayPrice(totalCost, { showOriginal: isConverted }) })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* % marge brute */}
            <Card className="card-elevated border-primary/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("profitability.marginRate.title")}
                </CardTitle>
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-lg sm:text-2xl font-bold ${
                  grossMarginPct >= 30 ? "text-success" : grossMarginPct >= 10 ? "text-primary" : "text-destructive"
                }`}>
                  {grossMarginPct}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {grossMarginPct >= 30
                    ? t("profitability.marginRate.excellent")
                    : grossMarginPct >= 10
                    ? t("profitability.marginRate.correct")
                    : grossMarginPct > 0
                    ? t("profitability.marginRate.low")
                    : t("profitability.marginRate.negative")}
                </div>
              </CardContent>
            </Card>

            {/* Total remises */}
            <Card className={`card-elevated ${totalDiscount > 0 ? "border-orange-500/30" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("profitability.discounts.title")}
                </CardTitle>
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Tag className="h-4 w-4 text-orange-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-lg sm:text-2xl font-bold ${totalDiscount > 0 ? "text-orange-600" : ""}`}>
                  {formatDisplayPrice(totalDiscount, { showOriginal: isConverted })}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {totalSales > 0
                    ? t("profitability.discounts.percentOfPotential", { percent: ((totalDiscount / (totalSales + totalDiscount)) * 100).toFixed(1) })
                    : t("profitability.discounts.none")}
                </div>
              </CardContent>
            </Card>

            {/* Bénéfice net réel (marge brute - dépenses) */}
            <Card className={`card-elevated border-2 ${
              netProfitWithMargin >= 0 ? "border-success/40" : "border-destructive/40"
            }`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("profitability.netProfitReal.title")}
                </CardTitle>
                <div className={`p-2 rounded-lg ${netProfitWithMargin >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                  <DollarSign className={`h-4 w-4 ${netProfitWithMargin >= 0 ? "text-success" : "text-destructive"}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-lg sm:text-2xl font-bold ${
                  netProfitWithMargin >= 0 ? "text-success" : "text-destructive"
                }`}>
                  {netProfitWithMargin >= 0 ? "+" : ""}{formatDisplayPrice(netProfitWithMargin, { showOriginal: isConverted })}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t("profitability.netProfitReal.subtitle")}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {netProfitWithMargin !== netProfit && (
                    <span title={t("profitability.netProfitReal.vsSimpleTooltip")}>
                      {t("profitability.netProfitReal.vsSimple", { amount: formatDisplayPrice(netProfit, { showOriginal: isConverted }) })}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Sales Chart */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>{t("charts.salesEvolution")}</CardTitle>
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
              <CardTitle>{t("charts.paymentDistribution.title")}</CardTitle>
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
                  {t("charts.paymentDistribution.noData")}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Products */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>{t("topProducts.title")}</CardTitle>
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
                        {t("topProducts.sold", { count: product.quantity })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">
                        {formatDisplayPrice(product.revenue, { showOriginal: isConverted })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t("topProducts.empty")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══════ Supplier Analytics ═══════ */}
        <FeatureGate feature="supplier_management">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Truck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t("supplierAnalytics.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("supplierAnalytics.subtitle")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Supplier Stock Value Chart */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {t("supplierAnalytics.stockValueChart.title")}
                </CardTitle>
                <CardDescription>{t("supplierAnalytics.stockValueChart.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                {supplierChartData.length > 0 ? (
                  <ChartContainer config={supplierChartConfig} className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={supplierChartData} layout="vertical">
                        <XAxis type="number" tickFormatter={(value) => `${value / 1000}k`} />
                        <YAxis type="category" dataKey="name" width={100} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="purchaseValue" fill="var(--color-purchaseValue)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="saleValue" fill="var(--color-saleValue)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <div className="h-[280px] flex flex-col items-center justify-center text-muted-foreground">
                    <Truck className="h-10 w-10 mb-3 opacity-50" />
                    <p>{t("supplierAnalytics.stockValueChart.empty1")}</p>
                    <p className="text-sm">{t("supplierAnalytics.stockValueChart.empty2")}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Supplier Detail Table */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>{t("supplierAnalytics.detailTable.title")}</CardTitle>
                <CardDescription>
                  {t("supplierAnalytics.detailTable.description")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {supplierReport && supplierReport.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("supplierAnalytics.columns.supplier")}</TableHead>
                          <TableHead className="text-center">{t("supplierAnalytics.columns.products")}</TableHead>
                          <TableHead className="text-center">{t("supplierAnalytics.columns.stock")}</TableHead>
                          <TableHead className="text-right">{t("supplierAnalytics.columns.purchaseValue")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierReport.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell className="text-center">{s.product_count}</TableCell>
                            <TableCell className="text-center">{s.total_stock}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatDisplayPrice(s.stock_value_at_cost, { showOriginal: isConverted })}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Total row */}
                        <TableRow className="font-bold border-t-2">
                          <TableCell>{t("supplierAnalytics.total")}</TableCell>
                          <TableCell className="text-center">
                            {supplierReport.reduce((s, r) => s + r.product_count, 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {supplierReport.reduce((s, r) => s + r.total_stock, 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatDisplayPrice(supplierReport.reduce((s, r) => s + r.stock_value_at_cost, 0), { showOriginal: isConverted })}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <Truck className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>{t("supplierAnalytics.detailTable.empty")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Orphan Products Alert */}
          {orphanProducts && orphanProducts.count > 0 && (
            <Card className="border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {t("orphanProducts.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  <Trans
                    i18nKey="orphanProducts.description"
                    t={t}
                    values={{
                      count: orphanProducts.count,
                      value: formatDisplayPrice(orphanProducts.totalValue, { showOriginal: isConverted }),
                    }}
                    components={{ strong: <strong /> }}
                  />
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        </FeatureGate>

        <EnhancedDashboardStats />

        {/* KPI détaillés (vendeurs/catégories/produits) : réservés au plan
            "advanced_reports" (croissance+) -- les totaux/graphiques
            ventes-dépenses ci-dessus restent inclus dans tous les plans
            (basic_reports). Voir docs/production/
            STRATEGIC_AUDIT_AFRICA_WORLD_LEADER.md §3.5. */}
        <FeatureGate
          feature="advanced_reports"
          fallback={
            <Card className="border-dashed">
              <CardContent className="flex items-center gap-3 p-4">
                <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t("advancedReports.lockedTitle")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("advancedReports.lockedDescription")}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate("/dashboard/billing")}>
                  {t("advancedReports.upgradeButton")}
                </Button>
              </CardContent>
            </Card>
          }
        >
          <div className="space-y-6">
            <ProductKpisCard />
            <CategoryKpisCard />
            <SellerKpisCard />
          </div>
        </FeatureGate>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
