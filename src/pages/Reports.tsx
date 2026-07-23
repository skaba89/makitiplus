import { useState } from "react";
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
} from "lucide-react";
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
  const { user } = useAuth();
  const { toast } = useToast();
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
          <h2 className="text-xl font-semibold mb-2">Aucune organisation</h2>
          <p className="text-muted-foreground">
            Vous devez appartenir à une organisation pour voir les rapports.
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

  // Supplier chart data
  const supplierChartData = (supplierReport || []).slice(0, 6).map((s) => ({
    name: s.name.length > 12 ? s.name.slice(0, 12) + "…" : s.name,
    "Valeur stock (achat)": s.stock_value_at_cost,
    "Valeur stock (vente)": s.stock_value_at_price,
  }));

  const supplierChartConfig = {
    "Valeur stock (achat)": {
      label: "Valeur stock (achat)",
      color: "hsl(var(--primary))",
    },
    "Valeur stock (vente)": {
      label: "Valeur stock (vente)",
      color: "hsl(var(--success))",
    },
  };

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
                  <span className="hidden sm:inline">Aujourd'hui</span>
                  <span className="sm:hidden">Jour</span>
                </TabsTrigger>
                <TabsTrigger value="week" className="text-xs sm:text-sm">Semaine</TabsTrigger>
                <TabsTrigger value="month" className="text-xs sm:text-sm">Mois</TabsTrigger>
              </TabsList>
            </Tabs>

            <FeatureGate feature="exports">
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
                          ...(effectiveOrgId ? [{ column: "organization_id", operator: "eq" as const, value: effectiveOrgId }] : []),
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
                          ...(effectiveOrgId ? [{ column: "organization_id", operator: "eq" as const, value: effectiveOrgId }] : []),
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
            </FeatureGate>
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
              <div className="text-lg sm:text-2xl font-bold">{formatDisplayPrice(totalSales, { showOriginal: isConverted })}</div>
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
                  ? `Panier moyen: ${formatDisplayPrice(Math.round(totalSales / totalTransactions), { showOriginal: isConverted })}`
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
              <div className="text-lg sm:text-2xl font-bold">{formatDisplayPrice(totalExpenses, { showOriginal: isConverted })}</div>
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
                {formatDisplayPrice(netProfit, { showOriginal: isConverted })}
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

        {/* ═══════ Rentabilité (marge brute + remises + bénéfice net réel) ═══════ */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Rentabilité</h2>
            <Badge variant="outline" className="text-xs">
              {totalTransactions > 0
                ? `${totalTransactions} vente(s)`
                : "Aucune vente"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Marge brute */}
            <Card className="card-elevated border-primary/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Marge brute
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
                  Ventes - Coût des marchandises
                </div>
                {totalCost > 0 && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Coût: {formatDisplayPrice(totalCost, { showOriginal: isConverted })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* % marge brute */}
            <Card className="card-elevated border-primary/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Taux de marge
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
                    ? "Excellente marge"
                    : grossMarginPct >= 10
                    ? "Marge correcte"
                    : grossMarginPct > 0
                    ? "Marge faible — vérifiez vos prix"
                    : "Marge négative ou nulle"}
                </div>
              </CardContent>
            </Card>

            {/* Total remises */}
            <Card className={`card-elevated ${totalDiscount > 0 ? "border-orange-500/30" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Remises totales
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
                    ? `${((totalDiscount / (totalSales + totalDiscount)) * 100).toFixed(1)}% du CA potentiel`
                    : "Aucune remise"}
                </div>
              </CardContent>
            </Card>

            {/* Bénéfice net réel (marge brute - dépenses) */}
            <Card className={`card-elevated border-2 ${
              netProfitWithMargin >= 0 ? "border-success/40" : "border-destructive/40"
            }`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Bénéfice net réel
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
                  Marge brute - Dépenses
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {netProfitWithMargin !== netProfit && (
                    <span title="Écart vs calcul simple (CA - Dépenses)">
                      vs {formatDisplayPrice(netProfit, { showOriginal: isConverted })} (CA - Dép.)
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
                        {formatDisplayPrice(product.revenue, { showOriginal: isConverted })}
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

        {/* ═══════ Supplier Analytics ═══════ */}
        <FeatureGate feature="supplier_management">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Truck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Analyse Fournisseurs</h2>
              <p className="text-sm text-muted-foreground">
                Valeur du stock par fournisseur et répartition de l'inventaire
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Supplier Stock Value Chart */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Valeur du stock par fournisseur
                </CardTitle>
                <CardDescription>Comparaison prix d'achat vs prix de vente</CardDescription>
              </CardHeader>
              <CardContent>
                {supplierChartData.length > 0 ? (
                  <ChartContainer config={supplierChartConfig} className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={supplierChartData} layout="vertical">
                        <XAxis type="number" tickFormatter={(value) => `${value / 1000}k`} />
                        <YAxis type="category" dataKey="name" width={100} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="Valeur stock (achat)" fill="var(--color-Valeur stock (achat))" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="Valeur stock (vente)" fill="var(--color-Valeur stock (vente))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <div className="h-[280px] flex flex-col items-center justify-center text-muted-foreground">
                    <Truck className="h-10 w-10 mb-3 opacity-50" />
                    <p>Aucun fournisseur avec produits</p>
                    <p className="text-sm">Associez des produits à vos fournisseurs</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Supplier Detail Table */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Détail par fournisseur</CardTitle>
                <CardDescription>
                  Produits, stock et valeur par fournisseur
                </CardDescription>
              </CardHeader>
              <CardContent>
                {supplierReport && supplierReport.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fournisseur</TableHead>
                          <TableHead className="text-center">Produits</TableHead>
                          <TableHead className="text-center">Stock</TableHead>
                          <TableHead className="text-right">Valeur (achat)</TableHead>
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
                          <TableCell>Total</TableCell>
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
                    <p>Aucune donnée fournisseur</p>
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
                  Produits sans fournisseur
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  <strong>{orphanProducts.count}</strong> produit(s) ne sont associés à aucun fournisseur,
                  représentant une valeur de stock de <strong>{formatDisplayPrice(orphanProducts.totalValue, { showOriginal: isConverted })}</strong>.
                  Associez-les à un fournisseur pour un meilleur suivi de vos approvisionnements.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        </FeatureGate>

        <EnhancedDashboardStats />
        <ProductKpisCard />
        <CategoryKpisCard />
        <SellerKpisCard />
      </div>
    </DashboardLayout>
  );
};

export default Reports;
