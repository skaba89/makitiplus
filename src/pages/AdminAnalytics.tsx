import { useState, useMemo } from "react";
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
} from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";
import { format } from "date-fns";
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
  const { formatPrice } = useCurrency();
  const [period, setPeriod] = useState<Period>("month");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");

  // ====== DATA QUERIES ======

  // 1. Stores summary
  const { data: storesSummary, isLoading: loadingSummary } = useQuery({
    queryKey: ["admin-stores-summary", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_stores_summary", {
        p_period: period,
      });
      if (error) throw error;
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
      if (error) throw error;
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
      if (error) throw error;
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
      if (error) throw error;
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
      if (error) throw error;
      return (data || []) as PaymentDistribution[];
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
            <Button className="mt-4" onClick={() => window.location.hash = "/dashboard/billing"}>
              Voir les abonnements
            </Button>
          </div>
        }
      >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-primary" />
              Analyse Multi-Magasins
            </h1>
            <p className="text-muted-foreground mt-1">
              Vue globale et détaillée sur l'ensemble de vos magasins
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[160px]">
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
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les magasins</SelectItem>
                {(storesSummary || []).map((store) => (
                  <SelectItem key={store.organization_id} value={store.organization_id}>
                    {store.store_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Magasins", value: globalStats.totalStores, icon: Store, color: "text-blue-600" },
            { label: "Ventes totales", value: formatPrice(globalStats.totalSales), icon: ShoppingCart, color: "text-green-600" },
            { label: "Transactions", value: globalStats.totalTransactions, icon: TrendingUp, color: "text-primary" },
            { label: "Dépenses", value: formatPrice(globalStats.totalExpenses), icon: Wallet, color: "text-orange-600" },
            { label: "Produits actifs", value: globalStats.totalProducts, icon: Package, color: "text-purple-600" },
            { label: "Alertes stock", value: globalStats.totalLowStock, icon: AlertTriangle, color: "text-destructive" },
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
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="stores" className="space-y-4">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 gap-1 h-auto p-1">
            <TabsTrigger value="stores" className="text-xs sm:text-sm">
              <Store className="h-4 w-4 mr-1" />
              Classement Magasins
            </TabsTrigger>
            <TabsTrigger value="articles" className="text-xs sm:text-sm">
              <Trophy className="h-4 w-4 mr-1" />
              Top / Bad Articles
            </TabsTrigger>
            <TabsTrigger value="movements" className="text-xs sm:text-sm">
              <Activity className="h-4 w-4 mr-1" />
              Mouvements Stock
            </TabsTrigger>
            <TabsTrigger value="trends" className="text-xs sm:text-sm">
              <TrendingUp className="h-4 w-4 mr-1" />
              Tendances
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
                            <TableCell className="text-right font-semibold text-green-600">{formatPrice(Number(store.total_sales))}</TableCell>
                            <TableCell className="text-right">{store.transaction_count}</TableCell>
                            <TableCell className="text-right">{formatPrice(Number(store.avg_basket))}</TableCell>
                            <TableCell className="text-right text-orange-600">{formatPrice(Number(store.total_expenses))}</TableCell>
                            <TableCell className="text-right font-semibold">
                              <span className={Number(store.net_revenue) >= 0 ? "text-green-600" : "text-destructive"}>
                                {Number(store.net_revenue) >= 0 ? "+" : ""}{formatPrice(Number(store.net_revenue))}
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
                              <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{mov.reason || "—"}</TableCell>
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
