import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import {
  BarChart3,
  Store,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  ShoppingCart,
  Wallet,
  AlertTriangle,
  Trophy,
  ThumbsDown,
  Activity,
  ArrowUpDown,
  Eye,
  Users,
  UserCog,
  DollarSign,
  Percent,
  TrendingDown,
  X,
  Filter,
} from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { useExchangeRates, convertAmount } from "@/hooks/useExchangeRates";
import { getCurrencyByCode, formatPrice as formatPriceUtil, COUNTRIES } from "@/utils/currencies";
import { reportError } from "@/lib/sentry";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const COLORS = ["#E57E4D", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

type Period = "day" | "week" | "month" | "quarter" | "year";

const periodLabels: Record<Period, string> = {
  day: "Aujourd'hui",
  week: "Cette semaine",
  month: "Ce mois",
  quarter: "Ce trimestre",
  year: "Cette année",
};

// Types for RPC responses
interface StoreSummary {
  organization_id: string;
  store_name: string;
  store_category: string;
  owner_name: string;
  owner_phone: string;
  city: string;
  country: string;
  total_sales: number;
  transaction_count: number;
  avg_basket: number;
  total_expenses: number;
  net_revenue: number;
  product_count: number;
  active_product_count: number;
  customer_count: number;
  low_stock_count: number;
}

interface ArticleRanking {
  organization_id: string;
  store_name: string;
  product_id: string;
  product_name: string;
  category_name: string;
  quantity_sold: number;
  total_revenue: number;
  unit_price: number;
  cost_price: number;
  margin: number;
  current_stock: number;
  ranking_category: "top" | "bad";
}

interface StockMovement {
  organization_id: string;
  store_name: string;
  movement_id: string;
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string;
  created_at: string;
}

interface SalesTrend {
  date: string;
  organization_id: string;
  store_name: string;
  total_sales: number;
  transaction_count: number;
  avg_basket: number;
}

interface PaymentDistribution {
  payment_method: string;
  total_amount: number;
  transaction_count: number;
  percentage: number;
}

interface UsersPerOrg {
  organization_id: string;
  org_name: string;
  admin_count: number;
  manager_count: number;
  vendeur_count: number;
  comptable_count: number;
  total_users: number;
  active_users: number;
}

interface SellerPerformance {
  seller_id: string;
  seller_name: string;
  seller_role: string;
  organization_id: string;
  org_name: string;
  store_name: string;
  total_sales: number;
  total_revenue: number;
  avg_sale_amount: number;
  last_sale_at: string | null;
  last_login_at: string | null;
}

interface OrgKpis {
  organization_id: string;
  org_name: string;
  store_count: number;
  transaction_count: number;
  total_sales: number;
  total_expenses: number;
  net_revenue: number;
  avg_basket: number;
  total_cost: number;
  gross_margin: number;
  customer_count: number;
  active_products: number;
  low_stock_count: number;
  store_names: string[] | null;
}

interface GlobalKpis {
  total_orgs: number;
  total_stores: number;
  total_users: number;
  total_active_users: number;
  total_transactions: number;
  total_sales: number;
  total_expenses: number;
  net_revenue: number;
  avg_basket: number;
  total_cost: number;
  gross_margin: number;
  gross_margin_pct: number;
  total_customers: number;
  total_products: number;
  total_active_products: number;
  low_stock_count: number;
  previous_period_sales: number;
  sales_growth_pct: number;
}

interface ProductRankingDetailed {
  product_id: string;
  product_name: string;
  org_name: string;
  category_name: string;
  quantity_sold: number;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number;
  stock_quantity: number;
  revenue_pct_of_total: number;
  rank_type: string;
}

const storeCategoryLabels: Record<string, string> = {
  epicerie: "Épicerie",
  boutique_vetements: "Btq. Vêtements",
  boutique_chaussures: "Btq. Chaussures",
  supermarche: "Supermarché",
  restaurant: "Restaurant",
  boulangerie_patisserie: "Boulangerie",
  pharmacie: "Pharmacie",
  cosmetiques_beaute: "Cosmétiques",
  electronique: "Électronique",
  quincaillerie: "Quincaillerie",
  materiel_construction: "Mat. Construction",
  alimentation_generale: "Alim. Générale",
  station_service: "Station-service",
  point_vente_telecom: "Point Telecom",
  salon_coiffure: "Salon Coiffure",
  autre: "Autre",
};

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

const movementTypeLabels: Record<string, string> = {
  sale: "Vente",
  restock: "Réapprovisionnement",
  adjustment: "Ajustement",
  return: "Retour",
};

const AdminAnalytics = () => {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const { formatPrice, currency: orgCurrency } = useCurrency();
  const { rates, loading: ratesLoading } = useExchangeRates();
  const [period, setPeriod] = useState<Period>("month");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");

  // Devise pivot pour comparer les organisations entre elles (toutes devises confondues)
  const PIVOT_CURRENCY = "EUR";
  const pivotCurrencyConfig = getCurrencyByCode(PIVOT_CURRENCY) || {
    code: "EUR",
    symbol: "€",
    displaySymbol: "€",
    name: "Euro",
    position: "after" as const,
    decimals: 2,
  };

  /**
   * Formate un montant dans une devise source donnée en le convertissant
   * vers la devise pivot (EUR) pour permettre la comparaison cross-org.
   * Si les taux ne sont pas disponibles, affiche dans la devise source.
   */
  const formatPivotPrice = (amount: number, fromCurrency?: string): string => {
    const sourceCurrency = fromCurrency || orgCurrency.code;
    if (!rates) {
      // Pas de taux → afficher dans la devise source
      const sourceConfig = getCurrencyByCode(sourceCurrency);
      return sourceConfig
        ? formatPriceUtil(amount, sourceConfig)
        : `${amount} ${sourceCurrency}`;
    }
    const converted = convertAmount(amount, sourceCurrency, PIVOT_CURRENCY, rates);
    if (converted === null) {
      const sourceConfig = getCurrencyByCode(sourceCurrency);
      return sourceConfig
        ? `${formatPriceUtil(amount, sourceConfig)} (taux N/A)`
        : `${amount} ${sourceCurrency}`;
    }
    return formatPriceUtil(converted, pivotCurrencyConfig);
  };

  /**
   * Déduit le code devise ISO depuis le code pays (ex: "GN" → "GNF")
   */
  const getCurrencyFromCountry = (countryCode?: string): string => {
    if (!countryCode) return orgCurrency.code;
    const country = COUNTRIES.find((c) => c.code === countryCode);
    return country?.currency.code || orgCurrency.code;
  };

  // ====== DATA QUERIES ======

  // 1. Stores summary
  const { data: storesSummary, isLoading: loadingSummary } = useQuery({
    queryKey: ["admin-stores-summary", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_stores_summary");
      if (error) { reportError(new Error(`AdminAnalytics RPC failed: ${error.message}`)); return []; }
      return (data || []) as StoreSummary[];
    },
    enabled: userRole === "super_admin",
  });

  // 2. Article ranking (top + bad)
  const { data: articleRanking, isLoading: loadingArticles } = useQuery({
    queryKey: ["admin-article-ranking", selectedStoreId, period],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        p_period: period,
        p_limit: 10,
      };
      if (selectedStoreId !== "all") {
        params.p_organization_id = selectedStoreId;
      }
      const { data, error } = await supabase.rpc("get_admin_article_ranking", params);
      if (error) { reportError(new Error(`AdminAnalytics RPC failed: ${error.message}`)); return []; }
      return (data || []) as ArticleRanking[];
    },
    enabled: userRole === "super_admin",
  });

  // 3. Stock movements
  const { data: stockMovements, isLoading: loadingMovements } = useQuery({
    queryKey: ["admin-stock-movements", selectedStoreId, period],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        p_period: period,
        p_limit: 50,
      };
      if (selectedStoreId !== "all") {
        params.p_organization_id = selectedStoreId;
      }
      const { data, error } = await supabase.rpc("get_admin_stock_movements", params);
      if (error) { reportError(new Error(`AdminAnalytics RPC failed: ${error.message}`)); return []; }
      return (data || []) as StockMovement[];
    },
    enabled: userRole === "super_admin",
  });

  // 4. Sales trend
  const { data: salesTrend, isLoading: loadingTrend } = useQuery({
    queryKey: ["admin-sales-trend", selectedStoreId, period],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        p_period: period,
      };
      if (selectedStoreId !== "all") {
        params.p_organization_id = selectedStoreId;
      }
      const { data, error } = await supabase.rpc("get_admin_sales_trend", params);
      if (error) { reportError(new Error(`AdminAnalytics RPC failed: ${error.message}`)); return []; }
      return (data || []) as SalesTrend[];
    },
    enabled: userRole === "super_admin",
  });

  // 5. Payment distribution
  const { data: paymentDistribution, isLoading: loadingPayment } = useQuery({
    queryKey: ["admin-payment-distribution", selectedStoreId, period],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        p_period: period,
      };
      if (selectedStoreId !== "all") {
        params.p_organization_id = selectedStoreId;
      }
      const { data, error } = await supabase.rpc("get_admin_payment_distribution", params);
      if (error) { reportError(new Error(`AdminAnalytics RPC failed: ${error.message}`)); return []; }
      return (data || []) as PaymentDistribution[];
    },
    enabled: userRole === "super_admin",
  });

  // 6. Users per organization
  const { data: usersPerOrg, isLoading: loadingUsersPerOrg } = useQuery({
    queryKey: ["admin-users-per-org"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_users_per_org");
      if (error) return [];
      return (data || []) as UsersPerOrg[];
    },
    enabled: userRole === "super_admin",
  });

  // 7. Seller performance
  const { data: sellerPerformance, isLoading: loadingSellerPerf } = useQuery({
    queryKey: ["admin-seller-performance", period, selectedStoreId],
    queryFn: async () => {
      const params: Record<string, unknown> = { p_period: period };
      if (selectedStoreId !== "all") {
        params.p_organization_id = selectedStoreId;
      }
      const { data, error } = await supabase.rpc("get_admin_seller_performance", params);
      if (error) return [];
      return (data || []) as SellerPerformance[];
    },
    enabled: userRole === "super_admin",
  });

  // 8. Org KPIs
  const { data: orgKpis, isLoading: loadingOrgKpis } = useQuery({
    queryKey: ["admin-org-kpis", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_org_kpis", { p_period: period });
      if (error) return [];
      return (data || []) as OrgKpis[];
    },
    enabled: userRole === "super_admin",
  });

  // 9. Global KPIs (enrichis)
  const { data: globalKpis, isLoading: loadingGlobalKpis } = useQuery({
    queryKey: ["admin-global-kpis", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_global_kpis", { p_period: period });
      if (error) return null;
      return data as unknown as GlobalKpis | null;
    },
    enabled: userRole === "super_admin",
  });

  // 10. Product ranking detailed (top + bad)
  const { data: productRankingDetailed, isLoading: loadingProductRanking } = useQuery({
    queryKey: ["admin-product-ranking-detailed", period, selectedStoreId],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        p_period: period,
        p_limit: 10,
      };
      if (selectedStoreId !== "all") {
        params.p_organization_id = selectedStoreId;
      }
      const { data, error } = await supabase.rpc("get_admin_product_ranking_detailed", params);
      if (error) return [];
      return (data || []) as ProductRankingDetailed[];
    },
    enabled: userRole === "super_admin",
  });

  // ====== DERIVED DATA ======

  const topArticles = useMemo(() => 
    (articleRanking || []).filter((a) => a.ranking_category === "top"),
    [articleRanking]
  );

  const badArticles = useMemo(() => 
    (articleRanking || []).filter((a) => a.ranking_category === "bad"),
    [articleRanking]
  );

  const globalStats = useMemo(() => {
    const stores = storesSummary || [];
    return {
      totalStores: stores.length,
      totalSales: stores.reduce((s, st) => s + Number(st.total_sales || 0), 0),
      totalTransactions: stores.reduce((s, st) => s + Number(st.transaction_count || 0), 0),
      totalExpenses: stores.reduce((s, st) => s + Number(st.total_expenses || 0), 0),
      totalProducts: stores.reduce((s, st) => s + Number(st.active_product_count || 0), 0),
      totalLowStock: stores.reduce((s, st) => s + Number(st.low_stock_count || 0), 0),
      totalCustomers: stores.reduce((s, st) => s + Number(st.customer_count || 0), 0),
    };
  }, [storesSummary]);

  // Aggregate daily trend for chart
  const aggregatedTrend = useMemo(() => {
    if (!salesTrend || salesTrend.length === 0) return [];
    const byDate: Record<string, { date: string; total: number; count: number }> = {};
    for (const t of salesTrend) {
      const d = t.date;
      if (!byDate[d]) byDate[d] = { date: d, total: 0, count: 0 };
      byDate[d].total += Number(t.total_sales || 0);
      byDate[d].count += Number(t.transaction_count || 0);
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [salesTrend]);

  // Per-store trend for stacked bar
  const storeTrendData = useMemo(() => {
    if (!salesTrend || salesTrend.length === 0) return [];
    const dates = [...new Set(salesTrend.map((t) => t.date))].sort();
    const storeNames = [...new Set(salesTrend.map((t) => t.store_name))];
    return dates.map((date) => {
      const row: Record<string, unknown> = { date };
      for (const name of storeNames) {
        const entry = salesTrend.find((t) => t.date === date && t.store_name === name);
        row[name] = entry ? Number(entry.total_sales || 0) : 0;
      }
      return row;
    });
  }, [salesTrend]);

  const storeNames = useMemo(() => 
    [...new Set((salesTrend || []).map((t) => t.store_name))],
    [salesTrend]
  );

  // ====== RENDER ======

  if (userRole !== "super_admin") {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
          <h1 className="text-2xl font-bold">Accès refusé</h1>
          <p className="text-muted-foreground mt-2">Cette page est réservée au super administrateur.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <FeatureGate
        feature="admin_analytics"
        fallback={
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <AlertTriangle className="h-16 w-16 text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold">Fonctionnalité Premium</h1>
            <p className="text-muted-foreground mt-2 max-w-md">
              L'analyse multi-magasins est disponible uniquement avec le plan Enterprise.
              Contactez-nous pour en savoir plus.
            </p>
            <Button className="mt-4" onClick={() => navigate("/dashboard/billing")}>
              Voir les abonnements
            </Button>
          </div>
        }
      >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-primary" />
              Analyse Multi-Magasins
            </h1>
            <p className="text-muted-foreground mt-1">
              Vue globale et détaillée sur l'ensemble de vos magasins
            </p>
            {rates && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                Montants convertis en € (EUR pivot) pour comparer les magasins de devises différentes
              </p>
            )}
            {ratesLoading && (
              <p className="text-xs text-muted-foreground mt-1">
                Chargement des taux de change...
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Aujourd'hui</SelectItem>
                <SelectItem value="week">Cette semaine</SelectItem>
                <SelectItem value="month">Ce mois</SelectItem>
                <SelectItem value="quarter">Ce trimestre</SelectItem>
                <SelectItem value="year">Cette année</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🌍 Toutes les organisations</SelectItem>
                {(storesSummary || []).map((store) => (
                  <SelectItem key={store.organization_id} value={store.organization_id}>
                    🏪 {store.store_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedStoreId !== "all" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedStoreId("all")}
                className="gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Réinitialiser
              </Button>
            )}
          </div>
        </div>

        {/* Active filter banner */}
        {selectedStoreId !== "all" && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              Filtrage actif : {" "}
              <span className="text-primary">
                {(storesSummary || []).find(s => s.organization_id === selectedStoreId)?.store_name || "Organisation"}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              — Toutes les données ci-dessous sont filtrées pour cette organisation uniquement
            </span>
          </div>
        )}

        {/* Global KPIs enriched — filtered by selected org if applicable */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(() => {
            // Si une org est sélectionnée, utiliser ses KPIs spécifiques
            const selectedOrgKpis = selectedStoreId !== "all"
              ? (orgKpis || []).find(o => o.organization_id === selectedStoreId)
              : null;
            
            const kpis = selectedOrgKpis ? {
              total_orgs: 1,
              total_stores: selectedOrgKpis.store_count,
              total_users: 0, // pas disponible par org dans globalKpis
              total_active_users: 0,
              total_transactions: selectedOrgKpis.transaction_count,
              total_sales: selectedOrgKpis.total_sales,
              total_expenses: selectedOrgKpis.total_expenses,
              net_revenue: selectedOrgKpis.net_revenue,
              avg_basket: selectedOrgKpis.avg_basket,
              total_cost: selectedOrgKpis.total_cost,
              gross_margin: selectedOrgKpis.gross_margin,
              gross_margin_pct: selectedOrgKpis.total_sales > 0 
                ? (selectedOrgKpis.gross_margin / selectedOrgKpis.total_sales) * 100 
                : 0,
              total_customers: selectedOrgKpis.customer_count,
              total_products: 0,
              total_active_products: selectedOrgKpis.active_products,
              low_stock_count: selectedOrgKpis.low_stock_count,
              previous_period_sales: 0,
              sales_growth_pct: 0,
            } : (globalKpis || null);

            return [
            { label: selectedStoreId !== "all" ? "Organisation" : "Organisations", value: selectedStoreId !== "all" ? "1" : (kpis?.total_orgs ?? "—"), icon: Store, color: "text-blue-600" },
            { label: "Magasins", value: kpis?.total_stores ?? globalStats.totalStores, icon: Store, color: "text-blue-600" },
            { label: "Transactions", value: kpis?.total_transactions ?? globalStats.totalTransactions, icon: TrendingUp, color: "text-primary" },
            { label: "Ventes (€)", value: ratesLoading ? "..." : formatPivotPrice(kpis?.total_sales ?? globalStats.totalSales), icon: ShoppingCart, color: "text-green-600" },
            {
              label: "Croissance",
              value: kpis && kpis.sales_growth_pct ? `${kpis.sales_growth_pct >= 0 ? "+" : ""}${kpis.sales_growth_pct.toFixed(1)}%` : "—",
              icon: kpis && kpis.sales_growth_pct >= 0 ? TrendingUp : TrendingDown,
              color: kpis && kpis.sales_growth_pct >= 0 ? "text-green-600" : "text-destructive",
            },
            { label: "Dépenses (€)", value: ratesLoading ? "..." : formatPivotPrice(kpis?.total_expenses ?? globalStats.totalExpenses), icon: Wallet, color: "text-orange-600" },
            { label: "Bénéfice net (€)", value: ratesLoading ? "..." : formatPivotPrice(kpis?.net_revenue ?? (globalStats.totalSales - globalStats.totalExpenses)), icon: DollarSign, color: kpis && kpis.net_revenue >= 0 ? "text-green-600" : "text-destructive" },
            { label: "Panier moyen (€)", value: ratesLoading ? "..." : formatPivotPrice(kpis?.avg_basket ?? 0), icon: ShoppingCart, color: "text-purple-600" },
            { label: "Marge brute (€)", value: ratesLoading ? "..." : formatPivotPrice(kpis?.gross_margin ?? 0), icon: DollarSign, color: "text-emerald-600" },
            { label: "Marge %", value: kpis ? `${kpis.gross_margin_pct.toFixed(1)}%` : "—", icon: Percent, color: "text-emerald-600" },
            { label: "Clients", value: kpis?.total_customers ?? globalStats.totalCustomers, icon: Users, color: "text-indigo-600" },
            { label: "Alertes stock", value: kpis?.low_stock_count ?? globalStats.totalLowStock, icon: AlertTriangle, color: "text-destructive" },
            ].map((kpi) => (
              <Card key={kpi.label} className="card-elevated">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                  </div>
                  <p className="text-xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </CardContent>
              </Card>
            ));
          })()}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="stores" className="space-y-4">
          <TabsList className="grid grid-cols-2 sm:grid-cols-6 gap-1 h-auto p-1">
            <TabsTrigger value="stores" className="text-xs sm:text-sm">
              <Store className="h-4 w-4 mr-1" />
              <span className="hidden lg:inline">Classement Magasins</span>
              <span className="lg:hidden">Magasins</span>
            </TabsTrigger>
            <TabsTrigger value="articles" className="text-xs sm:text-sm">
              <Trophy className="h-4 w-4 mr-1" />
              <span className="hidden lg:inline">Top / Bad Articles</span>
              <span className="lg:hidden">Articles</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="text-xs sm:text-sm">
              <Users className="h-4 w-4 mr-1" />
              <span className="hidden lg:inline">Utilisateurs</span>
              <span className="lg:hidden">Users</span>
            </TabsTrigger>
            <TabsTrigger value="sellers" className="text-xs sm:text-sm">
              <UserCog className="h-4 w-4 mr-1" />
              <span className="hidden lg:inline">Performance Vendeurs</span>
              <span className="lg:hidden">Vendeurs</span>
            </TabsTrigger>
            <TabsTrigger value="movements" className="text-xs sm:text-sm">
              <Activity className="h-4 w-4 mr-1" />
              <span className="hidden lg:inline">Mouvements Stock</span>
              <span className="lg:hidden">Stock</span>
            </TabsTrigger>
            <TabsTrigger value="trends" className="text-xs sm:text-sm">
              <TrendingUp className="h-4 w-4 mr-1" />
              <span className="hidden lg:inline">Tendances</span>
              <span className="lg:hidden">Trends</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB: Store Rankings */}
          <TabsContent value="stores" className="space-y-4">
            {/* Sales trend per store bar chart */}
            {storeTrendData.length > 0 && (
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle className="text-lg">Ventes par magasin — {periodLabels[period]}</CardTitle>
                  <CardDescription>Évolution du chiffre d'affaires quotidien par magasin</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={storeTrendData}>
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v), "dd/MM", { locale: fr })} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                        <Tooltip
                          formatter={(value: number) => formatPrice(value)}
                          labelFormatter={(label) => format(new Date(label), "dd MMMM yyyy", { locale: fr })}
                        />
                        {storeNames.map((name, i) => (
                          <Bar key={name} dataKey={name} fill={COLORS[i % COLORS.length]} stackId="a" />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3">
                    {storeNames.map((name, i) => (
                      <div key={name} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span>{name}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Store ranking table */}
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowUpDown className="h-5 w-5" />
                  Classement des magasins par ventes
                </CardTitle>
                <CardDescription>
                  Performance comparative de chaque magasin — {periodLabels[period]}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingSummary ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : (storesSummary || []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Store className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Aucun magasin trouvé</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Magasin</TableHead>
                          <TableHead>Catégorie</TableHead>
                          <TableHead>Ville</TableHead>
                          <TableHead className="text-right">Ventes</TableHead>
                          <TableHead className="text-right">Transactions</TableHead>
                          <TableHead className="text-right">Panier moy.</TableHead>
                          <TableHead className="text-right">Dépenses</TableHead>
                          <TableHead className="text-right">Résultat net</TableHead>
                          <TableHead className="text-right">Produits</TableHead>
                          <TableHead className="text-center">Alerte</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(storesSummary || []).map((store, idx) => (
                          <TableRow key={store.organization_id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedStoreId(store.organization_id)}>
                            <TableCell>
                              {idx === 0 ? (
                                <Badge className="bg-yellow-500 text-white"><Trophy className="h-3 w-3 mr-1" />1</Badge>
                              ) : idx === 1 ? (
                                <Badge className="bg-gray-400 text-white">2</Badge>
                              ) : idx === 2 ? (
                                <Badge className="bg-amber-700 text-white">3</Badge>
                              ) : (
                                <span className="text-muted-foreground">{idx + 1}</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{store.store_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{storeCategoryLabels[store.store_category] || store.store_category}</Badge>
                            </TableCell>
                            <TableCell>{store.city || "—"}</TableCell>
                            <TableCell className="text-right font-semibold text-green-600">{formatPivotPrice(Number(store.total_sales), getCurrencyFromCountry(store.country))}</TableCell>
                            <TableCell className="text-right">{store.transaction_count}</TableCell>
                            <TableCell className="text-right">{formatPivotPrice(Number(store.avg_basket), getCurrencyFromCountry(store.country))}</TableCell>
                            <TableCell className="text-right text-orange-600">{formatPivotPrice(Number(store.total_expenses), getCurrencyFromCountry(store.country))}</TableCell>
                            <TableCell className="text-right font-semibold">
                              <span className={Number(store.net_revenue) >= 0 ? "text-green-600" : "text-destructive"}>
                                {Number(store.net_revenue) >= 0 ? "+" : ""}{formatPivotPrice(Number(store.net_revenue), getCurrencyFromCountry(store.country))}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{store.active_product_count}</TableCell>
                            <TableCell className="text-center">
                              {store.low_stock_count > 0 ? (
                                <Badge variant="destructive">{store.low_stock_count}</Badge>
                              ) : (
                                <Badge variant="outline" className="text-green-600 border-green-600">OK</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: Top / Bad Articles */}
          <TabsContent value="articles" className="space-y-4">
            {/* Top Articles */}
            <Card className="card-elevated border-green-500/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-green-700">
                  <Trophy className="h-5 w-5" />
                  Top Articles — Meilleures ventes
                </CardTitle>
                <CardDescription>
                  Les articles les plus rentables — {periodLabels[period]}
                  {selectedStoreId !== "all" && ` — ${(storesSummary || []).find(s => s.organization_id === selectedStoreId)?.store_name || ""}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingArticles ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
                  </div>
                ) : topArticles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Trophy className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>Aucune donnée de vente pour cette période</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Produit</TableHead>
                          <TableHead>Catégorie</TableHead>
                          {selectedStoreId === "all" && <TableHead>Magasin</TableHead>}
                          <TableHead className="text-right">Qté vendue</TableHead>
                          <TableHead className="text-right">CA</TableHead>
                          <TableHead className="text-right">Marge</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topArticles.map((article, idx) => (
                          <TableRow key={`${article.product_id}-${idx}`}>
                            <TableCell>
                              {idx < 3 ? (
                                <Badge className={idx === 0 ? "bg-yellow-500 text-white" : idx === 1 ? "bg-gray-400 text-white" : "bg-amber-700 text-white"}>
                                  {idx + 1}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">{idx + 1}</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{article.product_name}</TableCell>
                            <TableCell><Badge variant="outline">{article.category_name}</Badge></TableCell>
                            {selectedStoreId === "all" && <TableCell className="text-sm text-muted-foreground">{article.store_name}</TableCell>}
                            <TableCell className="text-right font-semibold">{article.quantity_sold}</TableCell>
                            <TableCell className="text-right font-semibold text-green-600">{formatPrice(Number(article.total_revenue))}</TableCell>
                            <TableCell className="text-right">
                              <span className={Number(article.margin) >= 0 ? "text-green-600" : "text-destructive"}>
                                {formatPrice(Number(article.margin))}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{article.current_stock}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bad Articles */}
            <Card className="card-elevated border-destructive/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <ThumbsDown className="h-5 w-5" />
                  Bad Articles — Plus faibles ventes
                </CardTitle>
                <CardDescription>
                  Les articles avec les plus faibles performances — {periodLabels[period]}
                  {selectedStoreId !== "all" && ` — ${(storesSummary || []).find(s => s.organization_id === selectedStoreId)?.store_name || ""}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingArticles ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-destructive" />
                  </div>
                ) : badArticles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ThumbsDown className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>Aucun article inactif détecté</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Produit</TableHead>
                          <TableHead>Catégorie</TableHead>
                          {selectedStoreId === "all" && <TableHead>Magasin</TableHead>}
                          <TableHead className="text-right">Qté vendue</TableHead>
                          <TableHead className="text-right">CA</TableHead>
                          <TableHead className="text-right">Marge</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {badArticles.map((article, idx) => {
                          const isZeroSales = Number(article.quantity_sold) === 0;
                          const hasHighStock = Number(article.current_stock) > 10;
                          return (
                            <TableRow key={`${article.product_id}-bad-${idx}`}>
                              <TableCell>
                                <span className="text-muted-foreground">{idx + 1}</span>
                              </TableCell>
                              <TableCell className="font-medium">{article.product_name}</TableCell>
                              <TableCell><Badge variant="outline">{article.category_name}</Badge></TableCell>
                              {selectedStoreId === "all" && <TableCell className="text-sm text-muted-foreground">{article.store_name}</TableCell>}
                              <TableCell className="text-right">{article.quantity_sold}</TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {Number(article.total_revenue) > 0 ? formatPrice(Number(article.total_revenue)) : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={Number(article.margin) >= 0 ? "text-muted-foreground" : "text-destructive"}>
                                  {formatPrice(Number(article.margin))}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">{article.current_stock}</TableCell>
                              <TableCell>
                                {isZeroSales ? (
                                  <Badge variant="destructive">Aucune vente</Badge>
                                ) : hasHighStock ? (
                                  <Badge className="bg-orange-500 text-white">Surstock</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-orange-600 border-orange-600">Faible</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: Users per Organization */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Utilisateurs par organisation
                  {selectedStoreId !== "all" && (
                    <Badge variant="secondary" className="ml-2">
                      Filtré : {(storesSummary || []).find(s => s.organization_id === selectedStoreId)?.store_name}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Répartition des utilisateurs (admin, manager, vendeur, comptable) par organisation.
                  Le super_admin n'est pas compté (réservé à la plateforme).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingUsersPerOrg ? (
                  <p className="text-muted-foreground text-center py-8">Chargement...</p>
                ) : (() => {
                  const filteredUsers = selectedStoreId !== "all"
                    ? (usersPerOrg || []).filter(u => u.organization_id === selectedStoreId)
                    : (usersPerOrg || []);
                  return filteredUsers.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Aucune organisation</p>
                  ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Organisation</TableHead>
                          <TableHead className="text-center">Admins</TableHead>
                          <TableHead className="text-center">Managers</TableHead>
                          <TableHead className="text-center">Vendeurs</TableHead>
                          <TableHead className="text-center">Comptables</TableHead>
                          <TableHead className="text-center font-bold">Total</TableHead>
                          <TableHead className="text-center">Actifs</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((u) => (
                          <TableRow key={u.organization_id}>
                            <TableCell className="font-medium">{u.org_name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{u.admin_count}</Badge>
                            </TableCell>
                            <TableCell className="text-center">{u.manager_count}</TableCell>
                            <TableCell className="text-center">{u.vendeur_count}</TableCell>
                            <TableCell className="text-center">{u.comptable_count}</TableCell>
                            <TableCell className="text-center font-bold">{u.total_users}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={u.active_users === u.total_users ? "default" : "outline"}>
                                {u.active_users}/{u.total_users}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Summary cards */}
            {(() => {
              const filteredUsers = selectedStoreId !== "all"
                ? (usersPerOrg || []).filter(u => u.organization_id === selectedStoreId)
                : (usersPerOrg || []);
              return filteredUsers.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <UserCog className="h-4 w-4 text-purple-600" />
                        <span className="text-xs text-muted-foreground">Total admins</span>
                      </div>
                      <p className="text-xl font-bold">
                        {filteredUsers.reduce((s, u) => s + u.admin_count, 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-blue-600" />
                        <span className="text-xs text-muted-foreground">Total vendeurs</span>
                      </div>
                      <p className="text-xl font-bold">
                        {filteredUsers.reduce((s, u) => s + u.vendeur_count, 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-muted-foreground">Total managers</span>
                      </div>
                      <p className="text-xl font-bold">
                        {filteredUsers.reduce((s, u) => s + u.manager_count, 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-orange-600" />
                        <span className="text-xs text-muted-foreground">Total users</span>
                      </div>
                      <p className="text-xl font-bold">
                        {filteredUsers.reduce((s, u) => s + u.total_users, 0)}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </TabsContent>

          {/* TAB: Seller Performance */}
          <TabsContent value="sellers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCog className="h-5 w-5" />
                  Performance par vendeur — {periodLabels[period]}
                </CardTitle>
                <CardDescription>
                  KPIs par vendeur : nombre de ventes, CA généré, panier moyen, dernière activité.
                  {selectedStoreId !== "all" && " Filtré par organisation."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingSellerPerf ? (
                  <p className="text-muted-foreground text-center py-8">Chargement...</p>
                ) : (sellerPerformance || []).length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Aucun vendeur sur cette période</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendeur</TableHead>
                          <TableHead>Rôle</TableHead>
                          <TableHead>Organisation</TableHead>
                          <TableHead className="text-center">Ventes</TableHead>
                          <TableHead className="text-right">CA généré (€)</TableHead>
                          <TableHead className="text-right">Panier moyen (€)</TableHead>
                          <TableHead>Dernière vente</TableHead>
                          <TableHead>Dernière connexion</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(sellerPerformance || []).map((s) => (
                          <TableRow key={s.seller_id}>
                            <TableCell className="font-medium">{s.seller_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">{s.seller_role}</Badge>
                            </TableCell>
                            <TableCell>{s.org_name}</TableCell>
                            <TableCell className="text-center font-bold">{s.total_sales}</TableCell>
                            <TableCell className="text-right font-semibold text-green-600">
                              {formatPivotPrice(s.total_revenue)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatPivotPrice(s.avg_sale_amount)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {s.last_sale_at ? formatDistanceToNow(new Date(s.last_sale_at), { addSuffix: true, locale: fr }) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {s.last_login_at ? formatDistanceToNow(new Date(s.last_login_at), { addSuffix: true, locale: fr }) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: Stock Movements */}
          <TabsContent value="movements" className="space-y-4">
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Mouvements de stock — {periodLabels[period]}
                </CardTitle>
                <CardDescription>
                  Historique des mouvements de stock
                  {selectedStoreId !== "all" && ` — ${(storesSummary || []).find(s => s.organization_id === selectedStoreId)?.store_name || ""}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingMovements ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : (stockMovements || []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Aucun mouvement de stock pour cette période</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>Date</TableHead>
                          {selectedStoreId === "all" && <TableHead>Magasin</TableHead>}
                          <TableHead>Produit</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Qté</TableHead>
                          <TableHead className="text-right">Avant</TableHead>
                          <TableHead className="text-right">Après</TableHead>
                          <TableHead>Raison</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(stockMovements || []).map((mov) => {
                          const isPositive = mov.movement_type === "restock" || mov.movement_type === "return";
                          return (
                            <TableRow key={mov.movement_id}>
                              <TableCell className="text-xs whitespace-nowrap">
                                {format(new Date(mov.created_at), "dd/MM HH:mm", { locale: fr })}
                              </TableCell>
                              {selectedStoreId === "all" && <TableCell className="text-sm">{mov.store_name}</TableCell>}
                              <TableCell className="font-medium text-sm">{mov.product_name}</TableCell>
                              <TableCell>
                                <Badge variant={isPositive ? "default" : "destructive"} className="text-xs">
                                  {movementTypeLabels[mov.movement_type] || mov.movement_type}
                                </Badge>
                              </TableCell>
                              <TableCell className={`text-right font-semibold ${isPositive ? "text-green-600" : "text-destructive"}`}>
                                {isPositive ? "+" : ""}{mov.quantity}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">{mov.previous_quantity}</TableCell>
                              <TableCell className="text-right font-medium">{mov.new_quantity}</TableCell>
                              <TableCell className="text-xs text-muted-foreground sm:max-w-[150px] truncate">{mov.reason || "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Movement summary by type */}
            {(stockMovements || []).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {["sale", "restock", "adjustment", "return"].map((type) => {
                  const movements = (stockMovements || []).filter((m) => m.movement_type === type);
                  const totalQty = movements.reduce((s, m) => s + Math.abs(m.quantity), 0);
                  const iconMap: Record<string, typeof ShoppingCart> = {
                    sale: ShoppingCart,
                    restock: Package,
                    adjustment: ArrowUpDown,
                    return: Activity,
                  };
                  const Icon = iconMap[type] || Activity;
                  const colorMap: Record<string, string> = {
                    sale: "text-destructive",
                    restock: "text-green-600",
                    adjustment: "text-orange-600",
                    return: "text-blue-600",
                  };
                  return (
                    <Card key={type} className="card-elevated">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className={`p-3 rounded-xl bg-muted ${colorMap[type]}`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{movements.length}</p>
                          <p className="text-xs text-muted-foreground">
                            {movementTypeLabels[type] || type} ({totalQty} unités)
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB: Trends & Charts */}
          <TabsContent value="trends" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Sales trend line chart */}
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle className="text-lg">Évolution des ventes</CardTitle>
                  <CardDescription>CA quotidien — {periodLabels[period]}</CardDescription>
                </CardHeader>
                <CardContent>
                  {aggregatedTrend.length > 0 ? (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={aggregatedTrend}>
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => format(new Date(v), "dd/MM", { locale: fr })} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                          <Tooltip
                            formatter={(value: number) => formatPrice(value)}
                            labelFormatter={(label) => format(new Date(label), "dd MMMM yyyy", { locale: fr })}
                          />
                          <Line type="monotone" dataKey="total" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} name="CA" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      Aucune donnée
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payment distribution pie chart */}
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle className="text-lg">Modes de paiement</CardTitle>
                  <CardDescription>Répartition du CA par mode — {periodLabels[period]}</CardDescription>
                </CardHeader>
                <CardContent>
                  {(paymentDistribution || []).length > 0 ? (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={paymentDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            dataKey="total_amount"
                            nameKey="payment_method"
                            label={({ payment_method, percentage }) => `${paymentLabels[payment_method] || payment_method} (${percentage}%)`}
                          >
                            {(paymentDistribution || []).map((_, idx) => (
                              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatPrice(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      Aucune donnée
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Per-store comparison bar */}
            {storesSummary && storesSummary.length > 0 && (
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle className="text-lg">Comparaison des magasins</CardTitle>
                  <CardDescription>Ventes vs Dépenses par magasin — {periodLabels[period]}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={storesSummary.slice(0, 10)} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                        <YAxis type="category" dataKey="store_name" tick={{ fontSize: 11 }} width={120} />
                        <Tooltip formatter={(value: number) => formatPrice(value)} />
                        <Bar dataKey="total_sales" fill="#10B981" name="Ventes" />
                        <Bar dataKey="total_expenses" fill="#F59E0B" name="Dépenses" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Net revenue per store */}
            {storesSummary && storesSummary.length > 0 && (
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle className="text-lg">Résultat net par magasin</CardTitle>
                  <CardDescription>Ventes - Dépenses — {periodLabels[period]}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={storesSummary.slice(0, 10)}>
                        <XAxis dataKey="store_name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={80} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                        <Tooltip formatter={(value: number) => formatPrice(value)} />
                        <Bar dataKey="net_revenue" name="Résultat net">
                          {(storesSummary || []).slice(0, 10).map((entry, idx) => (
                            <Cell key={idx} fill={Number(entry.net_revenue) >= 0 ? "#10B981" : "#EF4444"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
      </FeatureGate>
    </DashboardLayout>
  );
};

export default AdminAnalytics;
