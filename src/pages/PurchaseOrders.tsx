/**
 * Purchase Orders Page — Manage supplier orders
 *
 * Features:
 * - List purchase orders with status filtering
 * - Create new orders with line items
 * - Receive orders (updates stock automatically)
 * - View order details with supplier info
 * - Gated by FeatureGate("supplier_management")
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStoreId } from "@/contexts/StoreContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Truck,
  Plus,
  Search,
  Package,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  Send,
  FileText,
  XCircle,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Supplier, Product } from "@/types";
import { reportError } from "@/lib/sentry";
import { Lock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

interface PurchaseOrderItem {
  id?: string;
  product_id: string | null;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  tax_rate: number;
  line_total: number;
  notes?: string;
}

interface PurchaseOrder {
  id: string;
  organization_id: string;
  store_id: string | null;
  supplier_id: string;
  order_number: string;
  status: "draft" | "sent" | "confirmed" | "partial" | "received" | "cancelled";
  order_date: string;
  expected_delivery: string | null;
  received_date: string | null;
  notes: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  // Joined
  supplier_name?: string;
  items?: PurchaseOrderItem[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "Brouillon", color: "bg-gray-100 text-gray-800", icon: FileText },
  sent: { label: "Envoyée", color: "bg-blue-100 text-blue-800", icon: Send },
  confirmed: { label: "Confirmée", color: "bg-cyan-100 text-cyan-800", icon: CheckCircle },
  partial: { label: "Partielle", color: "bg-amber-100 text-amber-800", icon: Package },
  received: { label: "Reçue", color: "bg-green-100 text-green-800", icon: CheckCircle },
  cancelled: { label: "Annulée", color: "bg-red-100 text-red-800", icon: XCircle },
};

const PurchaseOrders = () => {
  const { user, profile, userRole } = useAuth();
  const storeId = useStoreId();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [formItems, setFormItems] = useState<PurchaseOrderItem[]>([
    { product_id: null, product_name: "", quantity_ordered: 1, quantity_received: 0, unit_cost: 0, tax_rate: 0, line_total: 0 },
  ]);
  const [formSupplier, setFormSupplier] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formExpectedDelivery, setFormExpectedDelivery] = useState("");
  const [receiveItems, setReceiveItems] = useState<Record<string, number>>({});

  const canModify =
    userRole === "admin" || userRole === "manager" || userRole === "super_admin";

  // ─── Fetch purchase orders ───────────────────────────────────
  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase-orders", user?.id, statusFilter, storeId ?? "no-store"],
    queryFn: async () => {
      let query = supabase
        .from("purchase_orders")
        .select("*, suppliers(name)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (profile?.organization_id) {
        query = query.eq("organization_id", profile.organization_id);
      }
      // Filter by current store if available
      if (storeId) {
        query = query.eq("store_id", storeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as (PurchaseOrder & { suppliers: { name: string } | null })[])?.map((o) => ({
        ...o,
        supplier_name: o.suppliers?.name || "Fournisseur inconnu",
      }));
    },
    enabled: !!user && !!profile?.organization_id,
  });

  // ─── Fetch suppliers for form ────────────────────────────────
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", user?.id, storeId ?? "no-store"],
    queryFn: async () => {
      let query = supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      // Filter by current store if available
      if (storeId) {
        query = query.eq("store_id", storeId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Pick<Supplier, "id" | "name">[];
    },
    enabled: !!user,
  });

  // ─── Fetch products for form ─────────────────────────────────
  const { data: products } = useQuery({
    queryKey: ["products-lookup", user?.id, storeId ?? "no-store"],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, name, cost_price")
        .eq("is_active", true)
        .order("name")
        .limit(200);
      // Filter by current store if available
      if (storeId) {
        query = query.eq("store_id", storeId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Pick<Product, "id" | "name" | "cost_price">[];
    },
    enabled: !!user && isFormOpen,
  });

  // ─── Create order ────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      // Generate order number
      const { data: orderNumber } = await supabase.rpc("generate_order_number", {
        p_org_id: profile!.organization_id,
      });

      const subtotal = formItems.reduce((s, i) => s + i.line_total, 0);
      const taxAmount = formItems.reduce(
        (s, i) => s + (i.line_total * i.tax_rate) / 100,
        0
      );

      const { data: order, error: orderError } = await supabase
        .from("purchase_orders")
        .insert({
          organization_id: profile!.organization_id,
          store_id: storeId,
          supplier_id: formSupplier,
          order_number: orderNumber || `BC-${Date.now()}`,
          status: "draft",
          order_date: new Date().toISOString().split("T")[0],
          expected_delivery: formExpectedDelivery || null,
          notes: formNotes || null,
          subtotal,
          tax_amount: taxAmount,
          total_amount: subtotal + taxAmount,
          currency: "GNF",
          created_by: profile!.id,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Insert items
      const items = formItems
        .filter((i) => i.product_name && i.quantity_ordered > 0)
        .map((item) => ({
          purchase_order_id: order.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity_ordered: item.quantity_ordered,
          quantity_received: 0,
          unit_cost: item.unit_cost,
          tax_rate: item.tax_rate,
          line_total: item.line_total,
        }));

      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from("purchase_order_items")
          .insert(items);
        if (itemsError) throw itemsError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Commande créée" });
      setIsFormOpen(false);
      resetForm();
    },
    onError: (error: unknown) => {
      reportError(error, { action: "create_purchase_order" });
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de créer la commande",
      });
    },
  });

  // ─── Update status ───────────────────────────────────────────
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Statut mis à jour" });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de modifier le statut",
      });
    },
  });

  // ─── Delete order ────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Commande supprimée" });
      setIsDeleteOpen(false);
      setSelectedOrder(null);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer la commande",
      });
    },
  });

  // ─── Fetch order items for receive dialog ─────────────────
  const { data: orderItems } = useQuery({
    queryKey: ["purchase-order-items", selectedOrder?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", selectedOrder!.id)
        .order("product_name");
      if (error) throw error;
      return data as PurchaseOrderItem[];
    },
    enabled: !!selectedOrder?.id && (isReceiveOpen || isDetailOpen),
  });

  // ─── Receive order mutation ────────────────────────────────────
  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrder) return;
      const items = orderItems
        ?.filter((item) => (receiveItems[item.id!] || 0) > 0)
        .map((item) => ({
          id: item.id,
          quantity_received: receiveItems[item.id!] || 0,
        }));
      if (!items || items.length === 0) {
        throw new Error("Veuillez saisir au moins une quantité reçue");
      }
      const { error } = await supabase.rpc("receive_purchase_order", {
        p_order_id: selectedOrder.id,
        p_items: items,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      toast({ title: "Commande réceptionnée", description: "Le stock a été mis à jour automatiquement." });
      setIsReceiveOpen(false);
      setSelectedOrder(null);
      setReceiveItems({});
    },
    onError: (error: unknown) => {
      reportError(error, { action: "receive_purchase_order" });
      const msg = error instanceof Error ? error.message : "Erreur lors de la réception";
      toast({
        variant: "destructive",
        title: "Erreur",
        description: msg,
      });
    },
  });

  // ─── Helpers ─────────────────────────────────────────────────
  const resetForm = () => {
    setFormSupplier("");
    setFormNotes("");
    setFormExpectedDelivery("");
    setFormItems([
      { product_id: null, product_name: "", quantity_ordered: 1, quantity_received: 0, unit_cost: 0, tax_rate: 0, line_total: 0 },
    ]);
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const updated = [...formItems];
    (updated[index] as Record<string, string | number | null>)[field] = value;
    // Recalculate line total
    if (["quantity_ordered", "unit_cost"].includes(field)) {
      updated[index].line_total =
        Number(updated[index].quantity_ordered) * Number(updated[index].unit_cost);
    }
    setFormItems(updated);
  };

  const addItem = () => {
    setFormItems([
      ...formItems,
      { product_id: null, product_name: "", quantity_ordered: 1, quantity_received: 0, unit_cost: 0, tax_rate: 0, line_total: 0 },
    ]);
  };

  const removeItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const handleProductSelect = (index: number, productId: string) => {
    const product = products?.find((p) => p.id === productId);
    if (product) {
      const updated = [...formItems];
      updated[index].product_id = product.id;
      updated[index].product_name = product.name;
      updated[index].unit_cost = Number(product.cost_price || 0);
      updated[index].line_total = updated[index].quantity_ordered * updated[index].unit_cost;
      setFormItems(updated);
    }
  };

  const filtered = orders?.filter(
    (o) =>
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.supplier_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─── Stats ───────────────────────────────────────────────────
  const totalOrders = orders?.length || 0;
  const pendingOrders = orders?.filter((o) => ["draft", "sent", "confirmed"].includes(o.status)).length || 0;
  const totalValue = orders?.reduce((s, o) => s + Number(o.total_amount || 0), 0) || 0;

  return (
    <DashboardLayout>
      <FeatureGate
        feature="supplier_management"
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Commandes fournisseurs</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              La gestion des commandes fournisseurs est disponible à partir du plan Croissance.
              Upgradéz votre abonnement pour accéder à cette fonctionnalité.
            </p>
            <Button onClick={() => (window.location.hash = "/dashboard/billing")}>
              Voir les abonnements
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                Commandes Fournisseurs
              </h1>
              <p className="text-muted-foreground mt-1">
                Gérez vos commandes d'approvisionnement
              </p>
            </div>
            {canModify && (
              <Button
                onClick={() => {
                  resetForm();
                  setIsFormOpen(true);
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Nouvelle commande
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="card-elevated">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total commandes</p>
                    <p className="text-2xl font-bold">{totalOrders}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">En attente</p>
                    <p className="text-2xl font-bold">{pendingOrders}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Truck className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Valeur totale</p>
                    <p className="text-2xl font-bold">{formatPrice(totalValue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par n° commande ou fournisseur..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="draft">Brouillon</SelectItem>
                <SelectItem value="sent">Envoyée</SelectItem>
                <SelectItem value="confirmed">Confirmée</SelectItem>
                <SelectItem value="partial">Partielle</SelectItem>
                <SelectItem value="received">Reçue</SelectItem>
                <SelectItem value="cancelled">Annulée</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered && filtered.length > 0 ? (
            <Card className="card-elevated">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N° Commande</TableHead>
                        <TableHead>Fournisseur</TableHead>
                        <TableHead className="hidden sm:table-cell">Date</TableHead>
                        <TableHead className="hidden md:table-cell">Livraison prévue</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((order) => {
                        const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;
                        const StatusIcon = statusConfig.icon;
                        return (
                          <TableRow key={order.id}>
                            <TableCell className="font-medium">
                              {order.order_number}
                            </TableCell>
                            <TableCell>{order.supplier_name}</TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {format(new Date(order.order_date), "dd MMM yyyy", { locale: fr })}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {order.expected_delivery
                                ? format(new Date(order.expected_delivery), "dd MMM yyyy", { locale: fr })
                                : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge className={statusConfig.color}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {statusConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatPrice(Number(order.total_amount))}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setIsDetailOpen(true);
                                  }}
                                  aria-label="Voir les détails"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {canModify && order.status === "draft" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      updateStatusMutation.mutate({ id: order.id, status: "sent" })
                                    }
                                    aria-label="Envoyer la commande"
                                  >
                                    <Send className="h-4 w-4 text-blue-500" />
                                  </Button>
                                )}
                                {canModify && ["sent", "confirmed"].includes(order.status) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setSelectedOrder(order);
                                      setIsReceiveOpen(true);
                                    }}
                                    aria-label="Réceptionner"
                                  >
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                  </Button>
                                )}
                                {canModify && ["draft"].includes(order.status) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setSelectedOrder(order);
                                      setIsDeleteOpen(true);
                                    }}
                                    aria-label="Supprimer"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12 bg-card rounded-xl border">
              <Truck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">Aucune commande</h3>
              <p className="text-muted-foreground mb-4">
                Créez votre première commande fournisseur
              </p>
              {canModify && (
                <Button onClick={() => setIsFormOpen(true)} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Nouvelle commande
                </Button>
              )}
            </div>
          )}

          {/* Create Order Dialog */}
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Nouvelle commande fournisseur</DialogTitle>
                <DialogDescription className="sr-only">
                  Formulaire de création d'une commande fournisseur
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Supplier & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fournisseur *</Label>
                    <Select value={formSupplier} onValueChange={setFormSupplier}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un fournisseur" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Livraison prévue</Label>
                    <Input
                      type="date"
                      value={formExpectedDelivery}
                      onChange={(e) => setFormExpectedDelivery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Articles</Label>
                    <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
                      <Plus className="h-3 w-3" />
                      Ajouter
                    </Button>
                  </div>
                  {formItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        {index === 0 && <Label className="text-xs">Produit</Label>}
                        <Select
                          value={item.product_id || ""}
                          onValueChange={(v) => handleProductSelect(index, v)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent>
                            {products?.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        {index === 0 && <Label className="text-xs">Qté</Label>}
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity_ordered}
                          onChange={(e) => updateItem(index, "quantity_ordered", Number(e.target.value))}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="col-span-3">
                        {index === 0 && <Label className="text-xs">Prix unitaire</Label>}
                        <Input
                          type="number"
                          min={0}
                          value={item.unit_cost}
                          onChange={(e) => updateItem(index, "unit_cost", Number(e.target.value))}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        {index === 0 && <Label className="text-xs">Total</Label>}
                        <div className="h-9 px-3 flex items-center text-sm font-medium bg-muted rounded-md">
                          {formatPrice(item.line_total)}
                        </div>
                      </div>
                      <div className="col-span-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => removeItem(index)}
                          disabled={formItems.length <= 1}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="flex justify-end border-t pt-4">
                  <div className="text-right space-y-1">
                    <p className="text-sm">
                      Sous-total : <span className="font-medium">{formatPrice(formItems.reduce((s, i) => s + i.line_total, 0))}</span>
                    </p>
                    <p className="text-lg font-bold">
                      Total : {formatPrice(formItems.reduce((s, i) => s + i.line_total, 0))}
                    </p>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Instructions spéciales, conditions..."
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !formSupplier}
                  className="gap-2"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Créer la commande
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Detail Dialog */}
          <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
            <DialogContent className="max-w-2xl" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Détails commande {selectedOrder?.order_number}</DialogTitle>
              </DialogHeader>
              {selectedOrder && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Fournisseur</p>
                      <p className="font-medium">{selectedOrder.supplier_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Statut</p>
                      <Badge className={STATUS_CONFIG[selectedOrder.status]?.color}>
                        {STATUS_CONFIG[selectedOrder.status]?.label}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Date commande</p>
                      <p className="font-medium">
                        {format(new Date(selectedOrder.order_date), "dd MMMM yyyy", { locale: fr })}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Montant total</p>
                      <p className="font-bold text-lg">
                        {formatPrice(Number(selectedOrder.total_amount))}
                      </p>
                    </div>
                  </div>
                  {selectedOrder.notes && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">{selectedOrder.notes}</p>
                    </div>
                  )}

                  {/* Order Items */}
                  {orderItems && orderItems.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Article</TableHead>
                            <TableHead className="text-right">Qté commandée</TableHead>
                            <TableHead className="text-right">Qté reçue</TableHead>
                            <TableHead className="text-right">Prix unit.</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderItems.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.product_name}</TableCell>
                              <TableCell className="text-right">{item.quantity_ordered}</TableCell>
                              <TableCell className="text-right">{item.quantity_received}</TableCell>
                              <TableCell className="text-right">{formatPrice(item.unit_cost)}</TableCell>
                              <TableCell className="text-right font-medium">{formatPrice(item.line_total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Receive Order Dialog */}
          <Dialog open={isReceiveOpen} onOpenChange={(open) => { setIsReceiveOpen(open); if (!open) { setReceiveItems({}); } }}>
            <DialogContent className="max-w-2xl" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Réceptionner la commande {selectedOrder?.order_number}</DialogTitle>
                <DialogDescription className="sr-only">
                  Saisir les quantités reçues pour chaque article de la commande
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Truck className="h-4 w-4" />
                    <span>Fournisseur : <strong className="text-foreground">{selectedOrder.supplier_name}</strong></span>
                    <span className="ml-4">Montant : <strong className="text-foreground">{formatPrice(Number(selectedOrder.total_amount))}</strong></span>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Article</TableHead>
                        <TableHead className="text-right">Qté commandée</TableHead>
                        <TableHead className="text-right">Qté reçue</TableHead>
                        <TableHead className="text-right">Prix unitaire</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-right">{item.quantity_ordered}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={item.quantity_ordered}
                              value={receiveItems[item.id!] ?? item.quantity_ordered}
                              onChange={(e) =>
                                setReceiveItems((prev) => ({
                                  ...prev,
                                  [item.id!]: Math.min(Number(e.target.value), item.quantity_ordered),
                                }))
                              }
                              className="w-20 h-8 text-sm text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">{formatPrice(item.unit_cost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => { setIsReceiveOpen(false); setReceiveItems({}); }}
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={() => receiveMutation.mutate()}
                      disabled={receiveMutation.isPending}
                      className="gap-2"
                    >
                      {receiveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      Confirmer la réception
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation */}
          <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer cette commande ?</AlertDialogTitle>
                <AlertDialogDescription>
                  La commande <strong>{selectedOrder?.order_number}</strong> sera définitivement supprimée.
                  Cette action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    if (selectedOrder) deleteMutation.mutate(selectedOrder.id);
                  }}
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </FeatureGate>
    </DashboardLayout>
  );
};

export default PurchaseOrders;
