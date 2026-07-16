import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/useCurrency";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { CurrencyDisplaySelector } from "@/components/ui/currency-display-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { format } from "date-fns";
import { formatDateTime } from "@/lib/utils";
import { reportError } from "@/lib/sentry";
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
  const navigate = useNavigate();

  // Super admin: sélecteur d'organisation pour voir les données de n'importe quelle org
  const isSuperAdmin = userRole === "super_admin";
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  // Fetch toutes les organisations (super_admin seulement)
  const { data: allOrgs = [] } = useQuery({
    queryKey: ["dashboard-all-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, country, currency")
        .order("name");
      if (error) return [];
      return data as { id: string; name: string; country: string | null; currency: string | null }[];
    },
    enabled: isSuperAdmin,
  });

  // L'org effective pour les queries :
  // - super_admin → org sélectionnée (ou toutes si vide)
  // - autres → leur org de profil
  const effectiveOrgId = isSuperAdmin ? (selectedOrgId || undefined) : (profile?.organization_id || undefined);

  const today = new Date();
  const dayStart = startOfDay(today).toISOString();
  const dayEnd = endOfDay(today).toISOString();
  const monthStart = startOfMonth(today).toISOString();
  const monthEnd = endOfMonth(today).toISOString();

  // ⚡ Stats du Dashboard via RPC — une seule requête au lieu de 5+ fetchAllRows
  // L'agrégation (SUM, COUNT) se fait côté serveur, réduisant drastiquement le transfert de données
  // ⚠️ Pour super_admin, on désactive le RPC (qui utilise le profil du user) et on utilise
  //    les queries client-side qui respectent effectiveOrgId (sélecteur d'org)
  const { data: dashboardStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["dashboard-stats", user?.id, effectiveOrgId],
    queryFn: async () => {
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
      return Array.isArray(data) ? data[0] : data;
    },
    enabled: !!user && !isSuperAdmin,
    retry: 1,
  });

  // Produits les plus vendus (30 derniers jours) — RPC avec agrégation serveur
  const { data: topProducts } = useQuery({
    queryKey: ["dashboard-top-products", user?.id],
    queryFn: async () => {
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
      if (Array.isArray(data)) return data;
      if (data && typeof data === "object") return [data];
      return [];
    },
    enabled: !!user && !isSuperAdmin,
    retry: 1,
  });

  // Month sales (for profit calculation) — client-side, respecte effectiveOrgId
  const { data: monthSales } = useQuery({
    queryKey: ["dashboard-sales-month", user?.id],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select("total_amount")
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
    enabled: !!user && (isSuperAdmin || !!profile?.organization_id),
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
      value: formatDisplayPrice(totalSalesToday, { showOriginal: isConverted }),
      change: `${transactionsToday} vente(s)`,
      trend: "up" as const,
      icon: ShoppingCart,
    },
    {
      title: "Ventes du mois",
      value: formatDisplayPrice(totalSalesMonth, { showOriginal: isConverted }),
      change: (dashboardStats?.monthCreditCount ?? 0) > 0 ? `${dashboardStats.monthCreditCount} à crédit` : "voir rapports",
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
      title: "Dépenses du mois",
      value: formatDisplayPrice(totalExpensesMonth, { showOriginal: isConverted }),
      change: `${monthExpenses?.length || 0} dépense(s)`,
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
              Bonjour, {profile?.owner_name?.split(" ")[0] || "Utilisateur"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Voici un aperçu de votre activité - {userRole && roleLabels[userRole]}
            </p>
          </div>
          {/* Bouton envoyer résumé par WhatsApp */}
          <div className="flex items-center gap-2 flex-wrap">
            {isSuperAdmin && (
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="🌍 Toutes les organisations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">🌍 Toutes les organisations</SelectItem>
                  {allOrgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      🏪 {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
                const phone = prompt("Numéro WhatsApp du gérant (ex: 224622000000):");
                if (!phone) return;
                const cleanPhone = phone.replace(/[\s+\-()]/g, "");
                const today = format(new Date(), "dd/MM/yyyy");
                const msg = `📊 *Rapport MakitiPlus — ${today}*

💰 Ventes du jour : ${formatPrice(totalSalesToday)}
🛒 Transactions : ${transactionsToday}
📦 Produits en stock : ${totalProducts}
⚠️ Stock bas : ${lowStockProducts.length}
💸 Dépenses du mois : ${formatPrice(totalExpensesMonth)}
📊 Bénéfice net : ${netProfit >= 0 ? "+" : ""}${formatPrice(netProfit)}

${lowStockProducts.length > 0 ? `*Alertes stock :*\n${lowStockProducts.slice(0, 5).map(p => `• ${p.name} (${p.stock_quantity})`).join("\n")}` : "✅ Aucune alerte de stock"}

— MakitiPlus`;
                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
              }}
            >
              <MessageCircle className="h-4 w-4" />
              Rapport WhatsApp
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Bénéfice net du mois</CardTitle>
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
                  Ventes {formatDisplayPrice(totalSalesMonth, { showOriginal: isConverted })} − Dépenses {formatDisplayPrice(totalExpensesMonth, { showOriginal: isConverted })}
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Fournisseurs actifs</CardTitle>
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Truck className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{suppliersCount || 0}</div>
              <div className="flex items-center gap-1 mt-1">
                <ArrowUpRight className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-600 group-hover:underline">
                  Voir les fournisseurs
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stock Alerts — now clickable with supplier info */}
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
                        Stock: {p.stock_quantity} / Seuil: {p.min_stock_alert || 5}
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
                Alertes de péremption ({expiryAlertProducts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Produits périmés ou expirant dans les {EXPIRY_WARNING_DAYS} prochains jours.
                Vérifiez le stock et appliquez une remise ou un retrait si nécessaire.
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
                            ? `Périmé depuis ${Math.abs(p.expiryDays)} jour(s)`
                            : isToday
                            ? "Expire aujourd'hui"
                            : `Expire dans ${p.expiryDays} jour(s)`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Stock: {p.stock_quantity} {p.suppliers?.name ? `· ${p.suppliers.name}` : ""}
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
          <h2 className="text-lg font-semibold mb-4">Actions rapides</h2>
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
                  <span className="font-medium">Analyse Multi-Magasins</span>
                </CardContent>
              </Card>
            )}
            {userRole && POS_ROLES.includes(userRole) && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                aria-label="Nouvelle vente"
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
                aria-label="Ajouter produit"
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
                  <span className="font-medium">Fournisseurs</span>
                </CardContent>
              </Card>
            )}
            {userRole && FINANCIAL_ROLES.includes(userRole) && (
              <Card
                className="card-elevated hover:shadow-medium transition-shadow cursor-pointer group"
                role="button"
                aria-label="Enregistrer dépense"
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
              aria-label="Voir rapports"
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
                  <span className="font-bold text-primary">{formatDisplayPrice(totalSalesMonth, { showOriginal: isConverted })}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-destructive" />
                    <span className="text-sm">Depenses</span>
                  </div>
                  <span className="font-bold text-destructive">{formatDisplayPrice(totalExpensesMonth, { showOriginal: isConverted })}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border-2 border-dashed">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    <span className="text-sm font-medium">Resultat net</span>
                  </div>
                  <span className={`font-bold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatDisplayPrice(netProfit, { showOriginal: isConverted })}
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
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
