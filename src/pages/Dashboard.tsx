import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/useCurrency";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { CurrencyDisplaySelector } from "@/components/ui/currency-display-selector";
import { OrgSelector } from "@/components/ui/org-selector";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  AlertTriangle,
  Truck,
  DollarSign,
  BarChart3,
  MessageCircle,
} from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { ProductKpisCard } from "@/components/products/ProductKpisCard";
import { EnhancedDashboardStats } from "@/components/reports/EnhancedDashboardStats";
import { SellerKpisCard } from "@/components/reports/SellerKpisCard";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { format } from "date-fns";
import { formatDateTime } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { INVENTORY_ROLES, POS_ROLES, MANAGEMENT_ROLES, FINANCIAL_ROLES } from "@/types";
import { logger } from "@/lib/logger";

/** Product with optional category icon + supplier name for stock alerts */
interface DashboardProduct {
  id: string;
  name: string;
  stock_quantity: number;
  min_stock_alert: number | null;
  expiry_date: string | null;
  categories: { icon: string | null } | null;
  suppliers: { name: string } | null;
}

const EXPIRY_WARNING_DAYS = 7;

const Dashboard = () => {
  const { t } = useTranslation("dashboard");
  const { user, profile, userRole } = useAuth();
  const { formatPrice } = useCurrency();
  const {
    formatDisplayPrice,
    displayCurrencyCode,
    orgCurrencyCode,
    setDisplayCurrency,
    ratesLoading,
    refreshRates,
    isConverted,
  } = useDisplayCurrency();
  const { isSuperAdmin, effectiveOrgId } = useOrgSelector();
  const navigate = useNavigate();

  const today = new Date();
  const dayStart = startOfDay(today).toISOString();
  const dayEnd = endOfDay(today).toISOString();
  const monthStart = startOfMonth(today).toISOString();
  const monthEnd = endOfMonth(today).toISOString();

  // Formes attendues des RPC — typées `Json` côté Supabase (retour composite),
  // TypeScript ne connaît donc pas leur forme réelle sans annotation explicite.
  interface DashboardStats {
    todaySales: number;
    todayTransactions: number;
    monthCreditCount: number;
    totalCredits: number;
    creditsCount: number;
  }
  interface TopProduct {
    product_name: string;
    total_quantity: number;
    total_revenue: number;
  }

  // ⚡ Stats du Dashboard via RPC — une seule requête au lieu de 5+ fetchAllRows
  // L'agrégation (SUM, COUNT) se fait côté serveur, réduisant drastiquement le transfert de données
  const { data: dashboardStats } = useQuery({
    queryKey: ["dashboard-stats", user?.id, effectiveOrgId],
    queryFn: async (): Promise<DashboardStats | null> => {
      // Pour super_admin : ne pas appeler le RPC (il utilise le profil du user,
      // pas l'org sélectionnée). Les queries client-side sont utilisées à la place.
      if (isSuperAdmin) return null;
      const { data, error } = await supabase.rpc("get_dashboard_stats", {
        p_day_start: dayStart,
        p_day_end: dayEnd,
        p_month_start: monthStart,
        p_month_end: monthEnd,
      });
      if (error) {
        // Graceful fallback: RPC not deployed yet — return zeros so the dashboard renders
        logger.warn("[Dashboard] get_dashboard_stats RPC failed:", error.message);
        return null;
      }
      // RPC returns array with single object
      return (Array.isArray(data) ? data[0] : data) as unknown as DashboardStats;
    },
    enabled: !!user && !isSuperAdmin,
    retry: 1,
  });

  // Produits les plus vendus (30 derniers jours) — RPC avec agrégation serveur
  // Pour super_admin : ne pas appeler le RPC (utilise le profil du user)
  const { data: topProducts } = useQuery({
    queryKey: ["dashboard-top-products", user?.id, effectiveOrgId],
    queryFn: async (): Promise<TopProduct[]> => {
      if (isSuperAdmin) return [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase.rpc("get_top_products", {
        p_since: thirtyDaysAgo.toISOString(),
        p_limit: 5,
      });
      if (error) {
        // Non-critical: get_top_products may 404 if RPC not deployed.
        // Return empty array instead of crashing the dashboard.
        logger.warn("[Dashboard] get_top_products RPC failed:", error.message);
        return [];
      }
      // Handle both array (TABLE) and JSONB responses
      const rows = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
      return rows as unknown as TopProduct[];
    },
    enabled: !!user && !isSuperAdmin,
    retry: 1,
  });

  // Month sales (for profit calculation)
  const { data: monthSales } = useQuery({
    queryKey: ["dashboard-sales-month", user?.id],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select("total_amount, created_at")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);
      if (effectiveOrgId) {
        query = query.eq("organization_id", effectiveOrgId);
      }
      const { data, error } = await query;
      if (error) return [];
      return data;
    },
    enabled: !!user,
  });

  // Month expenses
  const { data: monthExpenses } = useQuery({
    queryKey: ["dashboard-expenses-month", user?.id],
    queryFn: async () => {
      let query = supabase
        .from("expenses")
        .select("amount")
        .gte("expense_date", format(startOfMonth(today), "yyyy-MM-dd"))
        .lte("expense_date", format(endOfMonth(today), "yyyy-MM-dd"));
      if (effectiveOrgId) {
        query = query.eq("organization_id", effectiveOrgId);
      }
      const { data, error } = await query;
      if (error) return [];
      return data;
    },
    enabled: !!user,
  });

  // Products count & stock alerts (with supplier info for restock)
  const { data: products } = useQuery({
    queryKey: ["dashboard-products", user?.id],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, name, stock_quantity, min_stock_alert, expiry_date, categories(icon), suppliers(name)")
        .eq("is_active", true);
      if (effectiveOrgId) {
        query = query.eq("organization_id", effectiveOrgId);
      }
      const { data, error } = await query;
      if (error) return [] as DashboardProduct[];
      return data as DashboardProduct[];
    },
    enabled: !!user,
  });

  // Active suppliers count
  const { data: suppliersCount } = useQuery({
    queryKey: ["dashboard-suppliers-count", user?.id],
    queryFn: async () => {
      let query = supabase
        .from("suppliers")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);
      if (effectiveOrgId) {
        query = query.eq("organization_id", effectiveOrgId);
      }
      const { count, error } = await query;
      if (error) return 0;
      return count || 0;
    },
    enabled: !!user,
  });

  // Ventes du jour par moyen de paiement — pour la vue patron (P1.2)
  const { data: todayPaymentBreakdown } = useQuery({
    queryKey: ["dashboard-today-payment-breakdown", user?.id, effectiveOrgId, dayStart, dayEnd],
    queryFn: async (): Promise<{ payment_method: string; total: number; count: number }[]> => {
      if (isSuperAdmin) return [];
      let query = supabase
        .from("sales")
        .select("payment_method, total_amount")
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd);
      if (effectiveOrgId) {
        query = query.eq("organization_id", effectiveOrgId);
      }
      const { data, error } = await query;
      if (error || !data) return [];
      const byMethod = new Map<string, { total: number; count: number }>();
      for (const sale of data) {
        const entry = byMethod.get(sale.payment_method) ?? { total: 0, count: 0 };
        entry.total += sale.total_amount;
        entry.count += 1;
        byMethod.set(sale.payment_method, entry);
      }
      return Array.from(byMethod.entries())
        .map(([payment_method, v]) => ({ payment_method, ...v }))
        .sort((a, b) => b.total - a.total);
    },
    enabled: !!user && !isSuperAdmin,
  });

  // Recent sales
  const { data: recentSales } = useQuery({
    queryKey: ["dashboard-recent-sales", user?.id, effectiveOrgId],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select("id, sale_number, total_amount, payment_method, created_at, customer_name")
        .order("created_at", { ascending: false })
        .limit(5);
      // Filtrer par organisation si disponible (évite de voir les ventes d'autres orgs)
      if (effectiveOrgId) {
        query = query.eq("organization_id", effectiveOrgId);
      }
      const { data, error } = await query;
      if (error) return [];
      return data;
    },
    enabled: !!user,
  });

  // Dérivés depuis dashboardStats RPC (agrégation serveur) + fallback client-side
  const totalSalesToday = dashboardStats?.todaySales ?? monthSales?.filter(
    (s) => s.created_at >= dayStart && s.created_at <= dayEnd
  ).reduce((s, sale) => s + sale.total_amount, 0) ?? 0;
  const transactionsToday = dashboardStats?.todayTransactions ?? 0;
  const totalSalesMonth = monthSales?.reduce((s, sale) => s + sale.total_amount, 0) ?? 0;
  const totalExpensesMonth = monthExpenses?.reduce((s, e) => s + e.amount, 0) ?? 0;
  const netProfit = totalSalesMonth - totalExpensesMonth;
  const totalProducts = products?.length || 0;
  const lowStockProducts = products?.filter(
    (p) => p.stock_quantity <= (p.min_stock_alert || 5)
  ) || [];

  // Alertes péremption : produits périmés ou expirant dans les 7 prochains jours
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiryAlertProducts = (products || [])
    .filter((p) => p.expiry_date)
    .map((p) => {
      const expiry = new Date(p.expiry_date!);
      expiry.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { ...p, expiryDays: diffDays };
    })
    .filter((p) => p.expiryDays <= EXPIRY_WARNING_DAYS)
    .sort((a, b) => a.expiryDays - b.expiryDays);

  const roleLabels: Record<string, string> = {
    admin: t("roles.admin"),
    manager: t("roles.manager"),
    vendeur: t("roles.vendeur"),
    comptable: t("roles.comptable"),
  };

  const paymentLabels: Record<string, string> = {
    cash: t("payments.cash"),
    wave: t("payments.wave"),
    orange_money: t("payments.orange_money"),
    mtn_money: t("payments.mtn_money"),
    card: t("payments.card"),
    credit: t("payments.credit"),
  };

  const stats = [
    {
      title: t("stats.salesToday.title"),
      value: formatDisplayPrice(totalSalesToday, { showOriginal: isConverted }),
      change: t("stats.salesToday.change", { count: transactionsToday }),
      trend: "up" as const,
      icon: ShoppingCart,
    },
    {
      title: t("stats.salesMonth.title"),
      value: formatDisplayPrice(totalSalesMonth, { showOriginal: isConverted }),
      change: (dashboardStats?.monthCreditCount ?? 0) > 0
        ? t("stats.salesMonth.changeWithCredit", { count: dashboardStats?.monthCreditCount })
        : t("stats.salesMonth.changeSeeReports"),
      trend: "up" as const,
      icon: BarChart3,
    },
    {
      title: t("stats.productsInStock.title"),
      value: String(totalProducts),
      change: lowStockProducts.length > 0
        ? t("stats.productsInStock.alert", { count: lowStockProducts.length })
        : t("stats.productsInStock.ok"),
      trend: lowStockProducts.length > 0 ? "down" as const : "up" as const,
      icon: Package,
    },
    {
      title: t("stats.expensesMonth.title"),
      value: formatDisplayPrice(totalExpensesMonth, { showOriginal: isConverted }),
      change: t("stats.expensesMonth.change", { count: monthExpenses?.length || 0 }),
      trend: "down" as const,
      icon: Wallet,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
              {t("greeting", { name: profile?.owner_name?.split(" ")[0] || t("greetingFallbackName") })}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("overviewSubtitle", { role: userRole ? roleLabels[userRole] : "" })}
            </p>
          </div>
          {/* Bouton envoyer résumé par WhatsApp */}
          <div className="flex items-center gap-2 flex-wrap">
            <OrgSelector />
            <CurrencyDisplaySelector
              orgCurrencyCode={orgCurrencyCode}
              displayCurrencyCode={displayCurrencyCode}
              onDisplayCurrencyChange={setDisplayCurrency}
              ratesLoading={ratesLoading}
              onRefreshRates={refreshRates}
            />
          {userRole && FINANCIAL_ROLES.includes(userRole) && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const phone = prompt(t("whatsapp.promptPhone"));
                if (!phone) return;
                const cleanPhone = phone.replace(/[\s+\-()]/g, "");
                const today = format(new Date(), "dd/MM/yyyy");
                const stockAlertsBlock = lowStockProducts.length > 0
                  ? `${t("whatsapp.stockAlertsTitle")}\n${lowStockProducts.slice(0, 5).map(p => `• ${p.name} (${p.stock_quantity})`).join("\n")}`
                  : t("whatsapp.noStockAlerts");
                const msg = `${t("whatsapp.title", { date: today })}

${t("whatsapp.salesToday", { amount: formatPrice(totalSalesToday) })}
${t("whatsapp.transactions", { count: transactionsToday })}
${(todayPaymentBreakdown ?? []).map((e) => `   • ${paymentLabels[e.payment_method] || e.payment_method} : ${formatPrice(e.total)}`).join("\n")}
${t("whatsapp.stockCount", { count: totalProducts })}
${t("whatsapp.lowStock", { count: lowStockProducts.length })}
${t("whatsapp.credits", { amount: formatPrice(dashboardStats?.totalCredits ?? 0), count: dashboardStats?.creditsCount ?? 0 })}
${t("whatsapp.expenses", { amount: formatPrice(totalExpensesMonth) })}
${t("whatsapp.netProfit", { sign: netProfit >= 0 ? "+" : "", amount: formatPrice(netProfit) })}

${stockAlertsBlock}

${t("whatsapp.footer")}`;
                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
              }}
            >
              <MessageCircle className="h-4 w-4" />
              {t("whatsapp.button")}
            </Button>
          )}
          </div>
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

        {/* Net Profit + Suppliers Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("netProfit.title")}</CardTitle>
              <div className={`p-2 rounded-lg ${netProfit >= 0 ? "bg-green-500/10" : "bg-destructive/10"}`}>
                <DollarSign className={`h-4 w-4 ${netProfit >= 0 ? "text-green-600" : "text-destructive"}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                {netProfit >= 0 ? "+" : ""}{formatDisplayPrice(netProfit, { showOriginal: isConverted })}
              </div>
              <div className="flex items-center gap-1 mt-1">
                {netProfit >= 0 ? (
                  <ArrowUpRight className="h-4 w-4 text-green-600" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-destructive" />
                )}
                <span className={`text-sm ${netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                  {t("netProfit.formula", {
                    sales: formatDisplayPrice(totalSalesMonth, { showOriginal: isConverted }),
                    expenses: formatDisplayPrice(totalExpensesMonth, { showOriginal: isConverted }),
                  })}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card
            className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/dashboard/suppliers")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/suppliers"); } }}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("suppliers.title")}</CardTitle>
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Truck className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{suppliersCount || 0}</div>
              <div className="flex items-center gap-1 mt-1">
                <ArrowUpRight className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-600 group-hover:underline">
                  {t("suppliers.seeSuppliers")}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Crédits clients + Ventes du jour par moyen de paiement — vue patron (P1.2) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card
            className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/dashboard/customers")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/customers"); } }}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("customerCredits.title")}</CardTitle>
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Wallet className="h-4 w-4 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatDisplayPrice(dashboardStats?.totalCredits ?? 0, { showOriginal: isConverted })}
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-sm text-muted-foreground group-hover:underline">
                  {t("customerCredits.balance", { count: dashboardStats?.creditsCount ?? 0 })}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("paymentBreakdown.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {todayPaymentBreakdown && todayPaymentBreakdown.length > 0 ? (
                <div className="space-y-2">
                  {todayPaymentBreakdown.map((entry) => (
                    <div key={entry.payment_method} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {paymentLabels[entry.payment_method] || entry.payment_method} ({entry.count})
                      </span>
                      <span className="font-medium">
                        {formatDisplayPrice(entry.total, { showOriginal: isConverted })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("paymentBreakdown.empty")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stock Alerts — now clickable with supplier info */}
        {lowStockProducts.length > 0 && (
          <Card className="card-elevated border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {t("stockAlerts.title", { count: lowStockProducts.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lowStockProducts.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate("/dashboard/products")}
                    className="flex items-center gap-3 p-3 bg-destructive/5 rounded-lg hover:bg-destructive/10 transition-colors text-left w-full"
                  >
                    <CategoryIcon iconName={p.categories?.icon} className="h-5 w-5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-destructive">
                        {t("stockAlerts.stockLabel", { stock: p.stock_quantity, threshold: p.min_stock_alert || 5 })}
                      </p>
                      {p.suppliers?.name && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Truck className="h-3 w-3" />
                          {p.suppliers.name}
                        </p>
                      )}
                    </div>
                    <Badge variant="destructive" className="text-xs">{p.stock_quantity}</Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expiry Alerts — produits périmés ou proches de la péremption */}
        {expiryAlertProducts.length > 0 && (
          <Card className="card-elevated border-orange-500/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                <AlertTriangle className="h-5 w-5" />
                {t("expiryAlerts.title", { count: expiryAlertProducts.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                {t("expiryAlerts.description", { days: EXPIRY_WARNING_DAYS })}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {expiryAlertProducts.slice(0, 6).map((p) => {
                  const isExpired = p.expiryDays < 0;
                  const isToday = p.expiryDays === 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate("/dashboard/products")}
                      className="flex items-center gap-3 p-3 bg-orange-500/5 rounded-lg hover:bg-orange-500/10 transition-colors text-left w-full"
                    >
                      <CategoryIcon iconName={p.categories?.icon} className="h-5 w-5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        <p className="text-xs text-orange-600 dark:text-orange-400">
                          {isExpired
                            ? t("expiryAlerts.expiredSince", { days: Math.abs(p.expiryDays) })
                            : isToday
                            ? t("expiryAlerts.expiresToday")
                            : t("expiryAlerts.expiresIn", { days: p.expiryDays })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("expiryAlerts.stockLabel", { stock: p.stock_quantity })} {p.suppliers?.name ? `· ${p.suppliers.name}` : ""}
                        </p>
                      </div>
                      <Badge
                        className={isExpired ? "bg-destructive text-destructive-foreground text-xs" : "bg-orange-500 text-white text-xs"}
                      >
                        {new Date(p.expiry_date!).toLocaleDateString("fr-FR")}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4">{t("quickActions.title")}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {userRole === "super_admin" && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                tabIndex={0}
                onClick={() => navigate("/dashboard/admin-analytics")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/admin-analytics"); } }}
              >
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <div className="p-4 rounded-2xl bg-purple-500/10 mb-4 group-hover:scale-110 transition-transform">
                    <BarChart3 className="h-8 w-8 text-purple-600" />
                  </div>
                  <span className="font-medium">{t("quickActions.multiStoreAnalytics")}</span>
                </CardContent>
              </Card>
            )}
            {userRole && POS_ROLES.includes(userRole) && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                aria-label={t("quickActions.newSale")}
                tabIndex={0}
                onClick={() => navigate("/dashboard/pos")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/pos"); } }}
              >
                <CardContent className="flex flex-col items-center justify-center py-6 sm:py-8">
                  <div className="p-3 sm:p-4 rounded-2xl bg-hero-gradient mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                    <ShoppingCart className="h-6 w-6 sm:h-8 sm:w-8 text-primary-foreground" />
                  </div>
                  <span className="font-medium text-sm sm:text-base">{t("quickActions.newSale")}</span>
                </CardContent>
              </Card>
            )}
            {userRole && INVENTORY_ROLES.includes(userRole) && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                aria-label={t("quickActions.addProduct")}
                tabIndex={0}
                onClick={() => navigate("/dashboard/products")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/products"); } }}
              >
                <CardContent className="flex flex-col items-center justify-center py-6 sm:py-8">
                  <div className="p-3 sm:p-4 rounded-2xl bg-success-gradient mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                    <Package className="h-6 w-6 sm:h-8 sm:w-8 text-success-foreground" />
                  </div>
                  <span className="font-medium text-sm sm:text-base">{t("quickActions.addProduct")}</span>
                </CardContent>
              </Card>
            )}
            {userRole && MANAGEMENT_ROLES.includes(userRole) && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                tabIndex={0}
                onClick={() => navigate("/dashboard/suppliers")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/suppliers"); } }}
              >
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <div className="p-4 rounded-2xl bg-blue-500/10 mb-4 group-hover:scale-110 transition-transform">
                    <Truck className="h-8 w-8 text-blue-600" />
                  </div>
                  <span className="font-medium">{t("quickActions.suppliers")}</span>
                </CardContent>
              </Card>
            )}
            {userRole && FINANCIAL_ROLES.includes(userRole) && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                aria-label={t("quickActions.recordExpense")}
                tabIndex={0}
                onClick={() => navigate("/dashboard/expenses")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/expenses"); } }}
              >
                <CardContent className="flex flex-col items-center justify-center py-6 sm:py-8">
                  <div className="p-3 sm:p-4 rounded-2xl bg-secondary mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                    <Wallet className="h-6 w-6 sm:h-8 sm:w-8 text-secondary-foreground" />
                  </div>
                  <span className="font-medium text-sm sm:text-base">{t("quickActions.recordExpense")}</span>
                </CardContent>
              </Card>
            )}
            <Card
              className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
              role="button"
              aria-label={t("quickActions.seeReports")}
              tabIndex={0}
              onClick={() => navigate("/dashboard/reports")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/dashboard/reports"); } }}
            >
              <CardContent className="flex flex-col items-center justify-center py-6 sm:py-8">
                <div className="p-3 sm:p-4 rounded-2xl bg-muted mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                  <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                </div>
                <span className="font-medium text-sm sm:text-base">{t("quickActions.seeReports")}</span>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Sales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("recentSales.title")}</CardTitle>
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
                        <p className="font-bold text-primary">{formatDisplayPrice(sale.total_amount, { showOriginal: isConverted })}</p>
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
                  <p className="text-sm">{t("recentSales.empty")}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>{t("financialSummary.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-sm">{t("financialSummary.totalSales")}</span>
                  </div>
                  <span className="font-bold text-primary">{formatDisplayPrice(totalSalesMonth, { showOriginal: isConverted })}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-destructive" />
                    <span className="text-sm">{t("financialSummary.expenses")}</span>
                  </div>
                  <span className="font-bold text-destructive">{formatDisplayPrice(totalExpensesMonth, { showOriginal: isConverted })}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border-2 border-dashed">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    <span className="text-sm font-medium">{t("financialSummary.netResult")}</span>
                  </div>
                  <span className={`font-bold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatDisplayPrice(netProfit, { showOriginal: isConverted })}
                  </span>
                </div>
              </div>

              {/* Top products */}
              {topProducts && topProducts.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-sm font-medium mb-2">{t("topProducts.title")}</p>
                  <div className="space-y-2">
                    {topProducts.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                          <span className="truncate">{item.product_name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary" className="text-micro">x{item.total_quantity}</Badge>
                          <span className="font-medium">{formatDisplayPrice(item.total_revenue, { showOriginal: isConverted })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <EnhancedDashboardStats />
        <ProductKpisCard />
        <SellerKpisCard />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
