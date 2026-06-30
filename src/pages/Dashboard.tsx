import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/hooks/useCurrency";
import { ProductWithCategoryIcon, POS_ROLES, INVENTORY_ROLES, FINANCIAL_ROLES } from "@/types";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
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

  // Today's sales
  const { data: todaySales } = useQuery({
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

  // Month expenses
  const { data: monthExpenses } = useQuery({
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

  // Products count & stock alerts
  const { data: products } = useQuery({
    queryKey: ["dashboard-products", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock_quantity, min_stock_alert, categories(icon)")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Recent sales
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
  const totalExpensesMonth = monthExpenses?.reduce((s, e) => s + e.amount, 0) || 0;
  const totalProducts = products?.length || 0;
  const lowStockProducts = products?.filter(
    (p) => p.stock_quantity <= (p.min_stock_alert || 5)
  ) || [];

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
      title: "Transactions",
      value: String(transactionsToday),
      change: transactionsToday > 0 ? `Panier moy. ${formatPrice(Math.round(totalSalesToday / transactionsToday))}` : "Aucune vente",
      trend: "up" as const,
      icon: TrendingUp,
    },
    {
      title: "Produits en stock",
      value: String(totalProducts),
      change: lowStockProducts.length > 0 ? `${lowStockProducts.length} en alerte` : "Stock OK",
      trend: lowStockProducts.length > 0 ? "down" as const : "up" as const,
      icon: Package,
    },
    {
      title: "Dépenses du mois",
      value: formatPrice(totalExpensesMonth),
      change: `${monthExpenses?.length || 0} dépense(s)`,
      trend: "up" as const,
      icon: Wallet,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
            Bonjour, {profile?.owner_name?.split(" ")[0] || "Utilisateur"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Voici un aperçu de votre activité - {userRole && roleLabels[userRole]}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="card-elevated">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className="p-2 rounded-lg bg-primary/10"><stat.icon className="h-4 w-4 text-primary" /></div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {userRole && POS_ROLES.includes(userRole) && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                tabIndex={0}
                onClick={() => navigate("/dashboard/pos")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/pos"); } }}
              >
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <div className="p-4 rounded-2xl bg-hero-gradient mb-4 group-hover:scale-110 transition-transform">
                    <ShoppingCart className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <span className="font-medium">Nouvelle vente</span>
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
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <div className="p-4 rounded-2xl bg-success-gradient mb-4 group-hover:scale-110 transition-transform">
                    <Package className="h-8 w-8 text-success-foreground" />
                  </div>
                  <span className="font-medium">Ajouter produit</span>
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
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <div className="p-4 rounded-2xl bg-secondary mb-4 group-hover:scale-110 transition-transform">
                    <Wallet className="h-8 w-8 text-secondary-foreground" />
                  </div>
                  <span className="font-medium">Enregistrer dépense</span>
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
              <CardContent className="flex flex-col items-center justify-center py-8">
                <div className="p-4 rounded-2xl bg-muted mb-4 group-hover:scale-110 transition-transform">
                  <TrendingUp className="h-8 w-8 text-muted-foreground" />
                </div>
                <span className="font-medium">Voir rapports</span>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Sales */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Ventes récentes</CardTitle>
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
                        {sale.customer_name && ` • ${sale.customer_name}`}
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
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune vente pour le moment</p>
                <p className="text-sm">Commencez à vendre pour voir vos transactions ici</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
