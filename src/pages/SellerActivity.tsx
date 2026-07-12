/**
 * Seller Activity Page — Admin/Manager Only
 *
 * Shows:
 *   - Seller performance (total sales, revenue, avg sale amount)
 *   - Login/disconnection timestamps
 *   - Activity timeline (sales, stock adjustments, etc.)
 *   - Filter by period (today, week, month, custom)
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  BarChart3,
  Clock,
  LogIn,
  LogOut,
  ShoppingCart,
  Package,
  AlertTriangle,
  Eye,
  TrendingUp,
  Users,
  RefreshCw,
  Search,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle as AlertIcon } from "lucide-react";
import { extractErrorMessage } from "@/lib/extractErrorMessage";
import { startOfDay, startOfWeek, startOfMonth, subMonths, format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────

interface SellerPerformance {
  user_id: string;
  seller_name: string;
  role: string;
  total_sales: number;
  total_revenue: number;
  avg_sale_amount: number;
  last_login_at: string | null;
  last_logout_at: string | null;
  last_seen_at: string | null;
  is_active: boolean;
}

interface SellerActivity {
  id: string;
  user_id: string;
  seller_name: string;
  action: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Action icons & colors ────────────────────────────────────

const ACTION_CONFIG: Record<string, { icon: typeof ShoppingCart; color: string; label: string }> = {
  login: { icon: LogIn, color: "text-green-600", label: "Connexion" },
  logout: { icon: LogOut, color: "text-red-500", label: "Déconnexion" },
  sale_created: { icon: ShoppingCart, color: "text-blue-600", label: "Vente créée" },
  product_created: { icon: Package, color: "text-purple-600", label: "Produit créé" },
  stock_adjusted: { icon: TrendingUp, color: "text-amber-600", label: "Stock ajusté" },
  default: { icon: BarChart3, color: "text-gray-500", label: "Activité" },
};

const ROLE_STYLES: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  super_admin: { label: "Super Admin", variant: "destructive" },
  admin: { label: "Admin", variant: "default" },
  manager: { label: "Manager", variant: "secondary" },
  vendeur: { label: "Vendeur", variant: "outline" },
  comptable: { label: "Comptable", variant: "outline" },
};

// ─── Component ────────────────────────────────────────────────

export default function SellerActivity() {
  const { userRole } = useAuth();
  const { formatPrice } = useCurrency();
  const { toast } = useToast();

  const [periodFilter, setPeriodFilter] = useState<string>("month");
  const [search, setSearch] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);

  // ─── Compute period dates ─────────────────────────────────
  const { periodStart, periodEnd } = useMemo(() => {
    const now = new Date();
    switch (periodFilter) {
      case "today":
        return { periodStart: startOfDay(now).toISOString(), periodEnd: now.toISOString() };
      case "week":
        return { periodStart: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), periodEnd: now.toISOString() };
      case "month":
        return { periodStart: startOfMonth(now).toISOString(), periodEnd: now.toISOString() };
      case "3months":
        return { periodStart: subMonths(now, 3).toISOString(), periodEnd: now.toISOString() };
      default:
        return { periodStart: startOfMonth(now).toISOString(), periodEnd: now.toISOString() };
    }
  }, [periodFilter]);

  // ─── Fetch seller performance ─────────────────────────────
  const { data: sellers, isLoading, error, refetch } = useQuery({
    queryKey: ["seller-performance", periodFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_seller_performance", {
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });
      if (error) throw error;
      return (data ?? []) as SellerPerformance[];
    },
    enabled: userRole === "super_admin" || userRole === "admin" || userRole === "manager",
  });

  // ─── Fetch seller activities ──────────────────────────────
  const {
    data: activities,
    isLoading: activitiesLoading,
    error: activitiesError,
  } = useQuery({
    queryKey: ["seller-activities", selectedSellerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_seller_activities", {
        p_user_id: selectedSellerId,
        p_limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as SellerActivity[];
    },
    enabled:
      !!selectedSellerId &&
      (userRole === "super_admin" || userRole === "admin" || userRole === "manager"),
  });

  // ─── Stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!sellers || !Array.isArray(sellers) || sellers.length === 0) {
      return { totalSellers: 0, totalRevenue: 0, totalSales: 0, activeNow: 0 };
    }
    return {
      totalSellers: sellers.length,
      totalRevenue: sellers.reduce((sum: number, s: SellerPerformance) => sum + Number(s.total_revenue || 0), 0),
      totalSales: sellers.reduce((sum: number, s: SellerPerformance) => sum + Number(s.total_sales || 0), 0),
      activeNow: sellers.filter((s: SellerPerformance) => {
        if (!s.last_seen_at) return false;
        const diff = Date.now() - new Date(s.last_seen_at).getTime();
        return diff < 5 * 60 * 1000; // Active within last 5 min
      }).length,
    };
  }, [sellers]);

  // ─── Filter by search and role ────────────────────────────
  const filteredSellers = useMemo(() => {
    if (!sellers) return [];
    
    // Étape 1 : filtrer par rôle
    // - super_admin ne doit pas apparaître dans la liste des vendeurs
    // - admin voit tous les autres membres du magasin
    // - manager ne voit que les membres de son magasin (vendeurs, comptables, autres managers)
    const roleFiltered = sellers.filter((s) => {
      // Cacher les super_admins de la liste des vendeurs
      if (s.role === "super_admin") return false;
      return true;
    });

    // Étape 2 : filtrer par recherche
    if (!search.trim()) return roleFiltered;
    const q = search.toLowerCase();
    return roleFiltered.filter(
      (s) =>
        s.seller_name?.toLowerCase().includes(q) ||
        s.role?.toLowerCase().includes(q)
    );
  }, [sellers, search]);

  // ─── Selected seller details ──────────────────────────────
  const selectedSeller = sellers?.find((s) => s.user_id === selectedSellerId);

  // ─── Guard ────────────────────────────────────────────────
  if (userRole !== "super_admin" && userRole !== "admin" && userRole !== "manager") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <AlertIcon className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold">Accès refusé</h2>
            <p className="text-muted-foreground mt-2">Cette page est réservée aux administrateurs et managers.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Activité Vendeurs
            </h1>
            <p className="text-muted-foreground">Suivi des performances et activités de l'équipe</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Aujourd'hui</SelectItem>
                <SelectItem value="week">Cette semaine</SelectItem>
                <SelectItem value="month">Ce mois</SelectItem>
                <SelectItem value="3months">3 derniers mois</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                <div className="text-2xl font-bold">{stats.totalSellers}</div>
              </div>
              <p className="text-xs text-muted-foreground">Membres</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-green-600" />
                <div className="text-2xl font-bold">{stats.totalSales}</div>
              </div>
              <p className="text-xs text-muted-foreground">Ventes totales</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-600" />
                <div className="text-lg font-bold">{formatPrice(stats.totalRevenue)}</div>
              </div>
              <p className="text-xs text-muted-foreground">Chiffre d'affaires</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-600" />
                <div className="text-2xl font-bold">{stats.activeNow}</div>
              </div>
              <p className="text-xs text-muted-foreground">En ligne maintenant</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un vendeur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <p className="text-destructive font-medium">Erreur de chargement</p>
              <p className="text-sm text-muted-foreground">{extractErrorMessage(error)}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Seller Performance Table */}
            <div className={`${selectedSellerId ? "lg:col-span-2" : "lg:col-span-3"}`}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Performances par vendeur</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendeur</TableHead>
                          <TableHead>Rôle</TableHead>
                          <TableHead className="text-right">Ventes</TableHead>
                          <TableHead className="text-right">CA</TableHead>
                          <TableHead className="text-right">Panier moy.</TableHead>
                          <TableHead>Dernière connexion</TableHead>
                          <TableHead className="hidden sm:table-cell">Statut</TableHead>
                          <TableHead className="text-right">Détails</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSellers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              Aucun vendeur trouvé
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredSellers.map((seller) => {
                            const roleStyle = ROLE_STYLES[seller.role] || { label: seller.role, variant: "outline" as const };
                            const isOnline = seller.last_seen_at
                              ? Date.now() - new Date(seller.last_seen_at).getTime() < 5 * 60 * 1000
                              : false;
                            return (
                              <TableRow
                                key={seller.user_id}
                                className={selectedSellerId === seller.user_id ? "bg-muted/50" : "cursor-pointer"}
                                onClick={() => setSelectedSellerId(seller.user_id)}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-300"}`} />
                                    <div>
                                      <p className="font-medium">{seller.seller_name}</p>
                                      {seller.last_logout_at && (
                                        <p className="text-xs text-muted-foreground">
                                          Déco: {format(new Date(seller.last_logout_at), "dd/MM HH:mm")}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={roleStyle.variant}>{roleStyle.label}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">{Number(seller.total_sales)}</TableCell>
                                <TableCell className="text-right font-medium">{formatPrice(Number(seller.total_revenue))}</TableCell>
                                <TableCell className="text-right">{formatPrice(Number(seller.avg_sale_amount))}</TableCell>
                                <TableCell className="text-sm">
                                  {seller.last_login_at
                                    ? format(new Date(seller.last_login_at), "dd/MM/yyyy HH:mm")
                                    : "—"}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  {isOnline ? (
                                    <Badge variant="default" className="text-xs bg-green-600">En ligne</Badge>
                                  ) : seller.is_active ? (
                                    <Badge variant="secondary" className="text-xs">Hors ligne</Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-xs">Désactivé</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSellerId(
                                        selectedSellerId === seller.user_id ? null : seller.user_id
                                      );
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Activity Timeline (shows when a seller is selected) */}
            {selectedSellerId && selectedSeller && (
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Activité de {selectedSeller.seller_name}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>
                        <LogIn className="h-3 w-3 inline mr-1 text-green-600" />
                        Connexion: {selectedSeller.last_login_at
                          ? format(new Date(selectedSeller.last_login_at), "dd/MM/yyyy HH:mm")
                          : "—"}
                      </p>
                      <p>
                        <LogOut className="h-3 w-3 inline mr-1 text-red-500" />
                        Déconnexion: {selectedSeller.last_logout_at
                          ? format(new Date(selectedSeller.last_logout_at), "dd/MM/yyyy HH:mm")
                          : "—"}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {activitiesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : activitiesError ? (
                      <div className="text-sm text-destructive text-center py-8">
                        {extractErrorMessage(activitiesError)}
                      </div>
                    ) : !activities || activities.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Aucune activité enregistrée</p>
                    ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {activities.map((activity) => {
                          const config = ACTION_CONFIG[activity.action] || ACTION_CONFIG.default;
                          const Icon = config.icon;
                          return (
                            <div
                              key={activity.id}
                              className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50"
                            >
                              <div className={`mt-0.5 ${config.color}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{config.label}</p>
                                {activity.description && (
                                  <p className="text-xs text-muted-foreground">{activity.description}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {format(new Date(activity.created_at), "dd/MM HH:mm")}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
