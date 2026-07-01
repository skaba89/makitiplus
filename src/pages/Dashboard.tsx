import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/useCurrency";
import { POS_ROLES, INVENTORY_ROLES, FINANCIAL_ROLES } from "@/types";
import { DashboardPageSkeleton } from "@/components/skeletons/PageSkeletons";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CreditCard,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { format } from "date-fns";
import { formatDateTime } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const { user, profile, userRole } = useAuth();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();

  const today = new Date();
  const dayStart = startOfDay(today).toISOString();
  const dayEnd = endOfDay(today).toISOString();
  const monthStart = startOfMonth(today).toISOString();
  const monthEnd = endOfMonth(today).toISOString();

  // ⚡ Stats du Dashboard via RPC — une seule requête au lieu de 5+ fetchAllRows
  // L'agrégation (SUM, COUNT) se fait côté serveur, réduisant drastiquement le transfert de données
  const { data: dashboardStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["dashboard-stats", user?.id, profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_stats", {
        p_organization_id: profile?.organization_id || null,
        p_day_start: dayStart,
        p_day_end: dayEnd,
        p_month_start: monthStart,
        p_month_end: monthEnd,
      });
      if (error) throw error;
      // RPC returns array with single object
      return Array.isArray(data) ? data[0] : data;
    },
    enabled: !!user,
  });

  // Produits les plus vendus (30 derniers jours) — RPC avec agrégation serveur
  const { data: topProducts } = useQuery({
    queryKey: ["dashboard-top-products", user?.id, profile?.organization_id],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase.rpc("get_top_products", {
        p_organization_id: profile?.organization_id || null,
        p_since: thirtyDaysAgo.toISOString(),
        p_limit: 5,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Ventes récentes — petite requête limitée, filtrée par organisation
  const { data: recentSales } = useQuery({
    queryKey: ["dashboard-recent-sales", user?.id, profile?.organization_id],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select("id, sale_number, total_amount, payment_method, created_at, customer_name")
        .order("created_at", { ascending: false })
        .limit(5);
      // Filtrer par organisation si disponible (évite de voir les ventes d'autres orgs)
      if (profile?.organization_id) {
        query = query.eq("organization_id", profile.organization_id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!profile?.organization_id,
  });

  // Produits en alerte stock — RPC pour comparaison croisée (stock_quantity <= min_stock_alert)
  // PostgREST ne permet pas les comparaisons entre colonnes, d'où le RPC.
  // Avant: .lte("stock_quantity", 5) — seuil codé en dur, ne respectait pas min_stock_alert.
  const { data: lowStockProducts } = useQuery({
    queryKey: ["dashboard-low-stock", user?.id, profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase.rpc("get_low_stock_products", {
        p_organization_id: profile.organization_id,
        p_limit: 6,
      });
      if (error) throw error;
      // Mapper le résultat pour correspondre au format attendu par le JSX
      return (data || []).map((p: { id: string; name: string; stock_quantity: number; min_stock_alert: number | null; category_icon: string | null }) => ({
        id: p.id,
        name: p.name,
        stock_quantity: p.stock_quantity,
        min_stock_alert: p.min_stock_alert,
        categories: { icon: p.category_icon },
      }));
    },
    enabled: !!user && !!profile?.organization_id,
  });

  const totalSalesToday = dashboardStats?.todaySales ?? 0;
  const transactionsToday = dashboardStats?.todayTransactions ?? 0;
  const totalSalesMonth = dashboardStats?.monthSales ?? 0;
  const creditSalesMonth = dashboardStats?.monthCreditCount ?? 0;
  const totalExpensesMonth = dashboardStats?.monthExpenses ?? 0;
  const totalProducts = dashboardStats?.totalProducts ?? 0;
  const lowStockCount = dashboardStats?.lowStockProducts ?? 0;
  const totalCredits = dashboardStats?.totalCredits ?? 0;
  const creditsCount = dashboardStats?.creditsCount ?? 0;
  const netResult = totalSalesMonth - totalExpensesMonth;

  const isDashboardLoading = isLoadingStats;

  if (isDashboardLoading) {
    return (
      <DashboardLayout>
        <DashboardPageSkeleton />
      </DashboardLayout>
    );
  }

  const roleLabels: Record<string, string> = {
    admin: "Administrateur",
    manager: "Manager",
    vendeur: "Vendeur",
    comptable: "Comptable",
  };

  const paymentLabels: Record<string, string> = {
    cash: "Espèces",
    wave: "Wave",
    orange_money: "Orange Money",
    mtn_money: "MTN Money",
    card: "Carte",
    credit: "Crédit",
  };

  const stats = [
    {
      title: "Ventes du jour",
      value: formatPrice(totalSalesToday),
      change: `${transactionsToday} vente(s)`,
      trend: "up" as const,
      icon: ShoppingCart,
    },
    {
      title: "Ventes du mois",
      value: formatPrice(totalSalesMonth),
      change: creditSalesMonth > 0 ? `${creditSalesMonth} a credit` : "voir rapports",
      trend: "up" as const,
      icon: BarChart3,
    },
    {
      title: "Produits en stock",
      value: String(totalProducts),
      change: lowStockCount > 0 ? `${lowStockCount} en alerte` : "Stock OK",
      trend: lowStockCount > 0 ? "down" as const : "up" as const,
      icon: Package,
    },
    {
      title: "Credits en cours",
      value: formatPrice(totalCredits),
      change: `${creditsCount} client${creditsCount > 1 ? "s" : ""}`,
      trend: totalCredits > 0 ? "down" as const : "up" as const,
      icon: CreditCard,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
            Bonjour, {profile?.owner_name?.split(" ")[0] || "Utilisateur"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Voici un aperçu de votre activité - {userRole && roleLabels[userRole]}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="card-elevated">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className="p-2 rounded-lg bg-primary/10"><stat.icon className="h-4 w-4 text-primary" /></div>
              </CardHeader>
              <CardContent className="pb-3 sm:pb-4">
                <div className="text-lg sm:text-2xl font-bold">{stat.value}</div>
                <div className="flex items-center gap-1 mt-1">
                  {stat.trend === "up" ? (
                    <ArrowUpRight className="h-4 w-4 text-success" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-destructive" />
                  )}
                  <span className={stat.trend === "up" ? "text-success text-sm" : "text-destructive text-sm"}>
                    {stat.change}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stock Alerts */}
        {lowStockProducts && lowStockProducts.length > 0 && (
          <Card className="card-elevated border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Alertes de stock ({lowStockCount})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lowStockProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 bg-destructive/5 rounded-lg">
                    <CategoryIcon iconName={p.categories?.icon} className="h-5 w-5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-destructive">
                        Stock: {p.stock_quantity} / Seuil: {p.min_stock_alert || 5}
                      </p>
                    </div>
                    <Badge variant="destructive" className="text-xs">{p.stock_quantity}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Actions rapides</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {userRole && POS_ROLES.includes(userRole) && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                tabIndex={0}
                onClick={() => navigate("/dashboard/pos")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/pos"); } }}
              >
                <CardContent className="flex flex-col items-center justify-center py-6 sm:py-8">
                  <div className="p-3 sm:p-4 rounded-2xl bg-hero-gradient mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                    <ShoppingCart className="h-6 w-6 sm:h-8 sm:w-8 text-primary-foreground" />
                  </div>
                  <span className="font-medium text-sm sm:text-base">Nouvelle vente</span>
                </CardContent>
              </Card>
            )}
            {userRole && INVENTORY_ROLES.includes(userRole) && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                tabIndex={0}
                onClick={() => navigate("/dashboard/products")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/products"); } }}
              >
                <CardContent className="flex flex-col items-center justify-center py-6 sm:py-8">
                  <div className="p-3 sm:p-4 rounded-2xl bg-success-gradient mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                    <Package className="h-6 w-6 sm:h-8 sm:w-8 text-success-foreground" />
                  </div>
                  <span className="font-medium text-sm sm:text-base">Ajouter produit</span>
                </CardContent>
              </Card>
            )}
            {userRole && FINANCIAL_ROLES.includes(userRole) && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                tabIndex={0}
                onClick={() => navigate("/dashboard/expenses")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/expenses"); } }}
              >
                <CardContent className="flex flex-col items-center justify-center py-6 sm:py-8">
                  <div className="p-3 sm:p-4 rounded-2xl bg-secondary mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                    <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-secondary-foreground" />
                  </div>
                  <span className="font-medium text-sm sm:text-base">Enregistrer dépense</span>
                </CardContent>
              </Card>
            )}
            <Card
              className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
              role="button"
              tabIndex={0}
              onClick={() => navigate("/dashboard/reports")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/reports"); } }}
            >
              <CardContent className="flex flex-col items-center justify-center py-6 sm:py-8">
                <div className="p-3 sm:p-4 rounded-2xl bg-muted mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                  <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                </div>
                <span className="font-medium text-sm sm:text-base">Voir rapports</span>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Sales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Ventes recentes</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/reports")}>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {recentSales && recentSales.length > 0 ? (
                <div className="space-y-3">
                  {recentSales.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{sale.sale_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(sale.created_at)}
                          {sale.customer_name && ` - ${sale.customer_name}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{formatPrice(sale.total_amount)}</p>
                        <Badge variant="outline" className="text-xs">
                          {paymentLabels[sale.payment_method] || sale.payment_method}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Aucune vente pour le moment</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Resume financier du mois</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-sm">Ventes totales</span>
                  </div>
                  <span className="font-bold text-primary">{formatPrice(totalSalesMonth)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-destructive" />
                    <span className="text-sm">Depenses</span>
                  </div>
                  <span className="font-bold text-destructive">{formatPrice(totalExpensesMonth)}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border-2 border-dashed">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    <span className="text-sm font-medium">Resultat net</span>
                  </div>
                  <span className={`font-bold ${netResult >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatPrice(netResult)}
                  </span>
                </div>
              </div>

              {/* Top products */}
              {topProducts && topProducts.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-sm font-medium mb-2">Top produits (30j)</p>
                  <div className="space-y-2">
                    {topProducts.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                          <span className="truncate">{item.product_name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary" className="text-micro">x{item.total_quantity}</Badge>
                          <span className="font-medium">{formatPrice(item.total_revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
