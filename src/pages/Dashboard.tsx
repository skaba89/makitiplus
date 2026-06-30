import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/useCurrency";
import { ProductWithCategoryIcon, POS_ROLES, INVENTORY_ROLES, FINANCIAL_ROLES } from "@/types";
import { DashboardPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { fetchAllRows } from "@/lib/batchedFetch";
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

  // Ventes du jour
  const { data: todaySales, isLoading: isLoadingTodaySales } = useQuery({
    queryKey: ["dashboard-sales-today", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("total_amount")
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Ventes du mois
  const { data: monthSales, isLoading: isLoadingMonthSales } = useQuery({
    queryKey: ["dashboard-sales-month", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("total_amount, payment_method")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Dépenses du mois
  const { data: monthExpenses, isLoading: isLoadingExpenses } = useQuery({
    queryKey: ["dashboard-expenses-month", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount")
        .gte("expense_date", format(startOfMonth(today), "yyyy-MM-dd"))
        .lte("expense_date", format(endOfMonth(today), "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Nombre de produits et alertes de stock — fetchAllRows pour contourner la limite PostgREST
  const { data: products, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["dashboard-products", user?.id],
    queryFn: () =>
      fetchAllRows<ProductWithCategoryIcon>(
        "products",
        "id, name, stock_quantity, min_stock_alert, categories(icon)",
        {
          filters: [{ column: "is_active", operator: "eq", value: true }],
        }
      ),
    enabled: !!user,
  });

  // Crédits clients
  const { data: credits } = useQuery({
    queryKey: ["dashboard-credits", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("total_credit")
        .gt("total_credit", 0);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Produits les plus vendus (30 derniers jours)
  const { data: topProducts } = useQuery({
    queryKey: ["dashboard-top-products", user?.id],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_name, quantity, total_price")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("quantity", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Ventes récentes
  const { data: recentSales } = useQuery({
    queryKey: ["dashboard-recent-sales", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_number, total_amount, payment_method, created_at, customer_name")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const totalSalesToday = todaySales?.reduce((s, sale) => s + sale.total_amount, 0) || 0;
  const transactionsToday = todaySales?.length || 0;
  const totalSalesMonth = monthSales?.reduce((s, sale) => s + sale.total_amount, 0) || 0;
  const creditSalesMonth = monthSales?.filter((s) => s.payment_method === "credit").length || 0;
  const totalExpensesMonth = monthExpenses?.reduce((s, e) => s + e.amount, 0) || 0;
  const totalProducts = products?.length || 0;
  const lowStockProducts = products?.filter(
    (p) => p.stock_quantity <= (p.min_stock_alert || 5)
  ) || [];
  const totalCredits = credits?.reduce((s, c) => s + Number(c.total_credit), 0) || 0;
  const creditsCount = credits?.length || 0;
  const netResult = totalSalesMonth - totalExpensesMonth;

  const isDashboardLoading = isLoadingTodaySales || isLoadingMonthSales || isLoadingExpenses || isLoadingProducts;

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
      change: creditSalesMonth > 0 ? `${creditSalesMonth} a crédit` : `${monthSales?.length || 0} vente(s)`,
      trend: "up" as const,
      icon: BarChart3,
    },
    {
      title: "Produits en stock",
      value: String(totalProducts),
      change: lowStockProducts.length > 0 ? `${lowStockProducts.length} en alerte` : "Stock OK",
      trend: lowStockProducts.length > 0 ? "down" as const : "up" as const,
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
        {lowStockProducts.length > 0 && (
          <Card className="card-elevated border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Alertes de stock ({lowStockProducts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lowStockProducts.slice(0, 6).map((p: ProductWithCategoryIcon) => (
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
                          <Badge variant="secondary" className="text-micro">x{item.quantity}</Badge>
                          <span className="font-medium">{formatPrice(item.total_price)}</span>
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
