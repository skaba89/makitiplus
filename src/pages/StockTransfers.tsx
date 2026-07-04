/**
 * StockTransfers — Multi-store stock transfer management
 *
 * ⚠️ EXPERIMENTAL / NOT ROUTED YET
 * This module has not been commercially validated.
 * It is NOT added to App.tsx routes, DashboardLayout sidebar, or MobileBottomNav.
 * Do NOT expose until product/UX sign-off.
 *
 * Features:
 * - List all transfers with status filters
 * - Create new transfer (select source/target store + products)
 * - Send transfer (deduct stock from source)
 * - Receive transfer (add stock to destination)
 * - Cancel transfer (return stock to source)
 * - View transfer details with items
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useDemo } from "@/contexts/DemoContext";
import { useCurrency } from "@/hooks/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeftRight,
  Plus,
  Search,
  Send,
  PackageCheck,
  XCircle,
  Eye,
  Trash2,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Store,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  type StockTransferRpcRow,
  type StockTransferDetailRpcRow,
  type StockTransferItemRpcRow,
  type TransferStatus,
  TRANSFER_ROLES,
} from "@/types";
import { reportError } from "@/lib/sentry";

// ─── Status config ──────────────────────────────────────────

const STATUS_CONFIG: Record<
  TransferStatus,
  { label: string; color: string; icon: typeof Clock }
> = {
  draft: { label: "Brouillon", color: "bg-slate-100 text-slate-700", icon: Clock },
  pending: { label: "En attente", color: "bg-amber-100 text-amber-700", icon: Send },
  in_transit: { label: "En transit", color: "bg-blue-100 text-blue-700", icon: ArrowLeftRight },
  received: { label: "Reçu", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  partial: { label: "Partiel", color: "bg-orange-100 text-orange-700", icon: AlertCircle },
  cancelled: { label: "Annulé", color: "bg-red-100 text-red-700", icon: XCircle },
};

// ─── Product picker item ────────────────────────────────────

interface TransferItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  current_stock: number;
}

// ─── Component ──────────────────────────────────────────────

const StockTransfers = () => {
  const { user, userRole } = useAuth();
  const { blockMutation } = useDemo();
  const { stores, currentStore } = useStore();
  const { formatPrice } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ─── State ────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransferDetailRpcRow | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Create form state
  const [fromStoreId, setFromStoreId] = useState<string>("");
  const [toStoreId, setToStoreId] = useState<string>("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [receiveMode, setReceiveMode] = useState(false);
  const [receiveItems, setReceiveItems] = useState<Record<string, number>>({});

  // ─── Queries ──────────────────────────────────────────

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ["stock-transfers", statusFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        p_limit: 100,
        p_offset: 0,
      };
      if (statusFilter !== "all") {
        params.p_status = statusFilter;
      }
      const { data, error } = await supabase.rpc("get_stock_transfers", params);
      if (error) {
        reportError(error);
        throw error;
      }
      return (data as StockTransferRpcRow[]) || [];
    },
    enabled: !!user,
  });

  // Products from source store (for create form)
  const { data: sourceProducts = [] } = useQuery({
    queryKey: ["transfer-source-products", fromStoreId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock_quantity, cost_price, barcode")
        .eq("store_id", fromStoreId)
        .eq("is_active", true)
        .gt("stock_quantity", 0)
        .order("name");
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        stock_quantity: number;
        cost_price: number;
        barcode: string | null;
      }[];
    },
    enabled: !!fromStoreId,
  });

  const filteredProducts = useMemo(() => {
    if (!productSearch) return sourceProducts;
    const q = productSearch.toLowerCase();
    return sourceProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [sourceProducts, productSearch]);

  // Filtered transfers (search)
  const filteredTransfers = useMemo(() => {
    if (!searchQuery) return transfers;
    const q = searchQuery.toLowerCase();
    return transfers.filter(
      (t) =>
        t.transfer_number.toLowerCase().includes(q) ||
        t.from_store_name.toLowerCase().includes(q) ||
        t.to_store_name.toLowerCase().includes(q)
    );
  }, [transfers, searchQuery]);

  // ─── Mutations ────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async () => {
      const items = transferItems.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
      }));
      const { data, error } = await supabase.rpc("create_stock_transfer", {
        p_from_store_id: fromStoreId,
        p_to_store_id: toStoreId,
        p_items: items,
        p_notes: transferNotes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Transfert créé", description: "Le brouillon de transfert a été créé avec succès." });
      resetCreateForm();
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
    },
    onError: (error: Error) => {
      reportError(error);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase.rpc("send_stock_transfer", {
        p_transfer_id: transferId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Transfert envoyé", description: "Le stock a été déduit de la boutique source." });
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      setIsDetailOpen(false);
      setSelectedTransfer(null);
    },
    onError: (error: Error) => {
      reportError(error);
      toast({ title: "Erreur d'envoi", description: error.message, variant: "destructive" });
    },
  });

  const receiveMutation = useMutation({
    mutationFn: async (transferId: string) => {
      // Build received items array with partial quantities
      const receivedItems = selectedTransfer?.items.map((item) => ({
        product_id: item.product_id,
        quantity_received: receiveItems[item.product_id ?? ""] ?? item.quantity,
      }));
      const { error } = await supabase.rpc("receive_stock_transfer", {
        p_transfer_id: transferId,
        p_received_items: receivedItems,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Transfert reçu", description: "Le stock a été ajouté à la boutique destination." });
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      setIsDetailOpen(false);
      setSelectedTransfer(null);
      setReceiveMode(false);
      setReceiveItems({});
    },
    onError: (error: Error) => {
      reportError(error);
      toast({ title: "Erreur de réception", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_stock_transfer", {
        p_transfer_id: id,
        p_reason: cancelReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Transfert annulé", description: "Le stock a été retourné à la boutique source." });
      setCancelId(null);
      setCancelReason("");
      setIsCancelOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      setIsDetailOpen(false);
      setSelectedTransfer(null);
    },
    onError: (error: Error) => {
      reportError(error);
      toast({ title: "Erreur d'annulation", description: error.message, variant: "destructive" });
    },
  });

  // ─── Helpers ──────────────────────────────────────────

  const resetCreateForm = () => {
    setFromStoreId("");
    setToStoreId("");
    setTransferNotes("");
    setTransferItems([]);
    setProductSearch("");
    setIsCreateOpen(false);
  };

  const addItem = (product: (typeof sourceProducts)[0]) => {
    if (transferItems.some((i) => i.product_id === product.id)) {
      toast({ title: "Produit déjà ajouté", variant: "destructive" });
      return;
    }
    setTransferItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_cost: product.cost_price,
        current_stock: product.stock_quantity,
      },
    ]);
  };

  const removeItem = (productId: string) => {
    setTransferItems((prev) => prev.filter((i) => i.product_id !== productId));
  };

  const updateItemQuantity = (productId: string, quantity: number) => {
    setTransferItems((prev) =>
      prev.map((i) =>
        i.product_id === productId
          ? { ...i, quantity: Math.min(Math.max(1, quantity), i.current_stock) }
          : i
      )
    );
  };

  const openDetail = async (transferId: string) => {
    const { data, error } = await supabase.rpc("get_stock_transfer_details", {
      p_transfer_id: transferId,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    const detail = Array.isArray(data) ? data[0] : data;
    setSelectedTransfer(detail as StockTransferDetailRpcRow);
    setIsDetailOpen(true);
  };

  const startReceive = () => {
    if (!selectedTransfer) return;
    const init: Record<string, number> = {};
    selectedTransfer.items.forEach((item) => {
      if (item.product_id) {
        init[item.product_id] = item.quantity;
      }
    });
    setReceiveItems(init);
    setReceiveMode(true);
  };

  const canCreate = userRole && TRANSFER_ROLES.includes(userRole as never);
  const canSend = userRole && TRANSFER_ROLES.includes(userRole as never);
  const canReceive = userRole && TRANSFER_ROLES.includes(userRole as never);
  const canCancel = userRole && TRANSFER_ROLES.includes(userRole as never);

  // ─── Render ───────────────────────────────────────────

  return (
    <DashboardLayout>
      <FeatureGate feature="supplier_management">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ArrowLeftRight className="h-6 w-6" />
                Transferts de stock
              </h1>
              <p className="text-muted-foreground">
                Transférez des produits entre vos boutiques
              </p>
            </div>
            {canCreate && stores.length >= 2 && (
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nouveau transfert
              </Button>
            )}
          </div>

          {/* Multi-store requirement notice */}
          {stores.length < 2 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">
                      Plusieurs boutiques requises
                    </p>
                    <p className="text-sm text-amber-700">
                      Les transferts de stock nécessitent au moins 2 boutiques dans votre organisation.
                      Créez une nouvelle boutique pour commencer.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters + Search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par numéro, boutique..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all">Tous</TabsTrigger>
                <TabsTrigger value="draft">Brouillons</TabsTrigger>
                <TabsTrigger value="pending">En attente</TabsTrigger>
                <TabsTrigger value="received">Reçus</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                { label: "En attente", count: transfers.filter((t) => t.status === "pending").length, color: "text-amber-600", icon: Clock },
                { label: "En transit", count: transfers.filter((t) => t.status === "in_transit").length, color: "text-blue-600", icon: ArrowLeftRight },
                { label: "Reçus", count: transfers.filter((t) => t.status === "received" || t.status === "partial").length, color: "text-green-600", icon: CheckCircle2 },
                { label: "Annulés", count: transfers.filter((t) => t.status === "cancelled").length, color: "text-red-600", icon: XCircle },
              ] as const
            ).map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2">
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    <span className="text-2xl font-bold">{stat.count}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Transfers list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Liste des transferts</CardTitle>
              <CardDescription>
                {filteredTransfers.length} transfert(s) trouvé(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTransfers.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Aucun transfert trouvé</p>
                  {stores.length >= 2 && canCreate && (
                    <Button
                      variant="outline"
                      className="mt-3 gap-2"
                      onClick={() => setIsCreateOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Créer un transfert
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N°</TableHead>
                        <TableHead>De</TableHead>
                        <TableHead>Vers</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Articles</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransfers.map((transfer) => {
                        const cfg = STATUS_CONFIG[transfer.status];
                        return (
                          <TableRow key={transfer.id}>
                            <TableCell className="font-mono font-medium">
                              {transfer.transfer_number}
                            </TableCell>
                            <TableCell>{transfer.from_store_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                {transfer.to_store_name}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cfg.color}>
                                <cfg.icon className="h-3 w-3 mr-1" />
                                {cfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {transfer.item_count} ({transfer.total_quantity} pcs)
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(transfer.created_at), "dd MMM yyyy", { locale: fr })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openDetail(transfer.id)}
                                  title="Voir détails"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {transfer.status === "draft" && canSend && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => { if (blockMutation("Envoyer le transfert")) return; sendMutation.mutate(transfer.id); }}
                                    disabled={sendMutation.isPending}
                                    title="Envoyer"
                                    className="text-amber-600 hover:text-amber-700"
                                  >
                                    <Send className="h-4 w-4" />
                                  </Button>
                                )}
                                {(transfer.status === "pending" || transfer.status === "in_transit") &&
                                  canReceive && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={async () => {
                                        await openDetail(transfer.id);
                                      }}
                                      title="Réceptionner"
                                      className="text-green-600 hover:text-green-700"
                                    >
                                      <PackageCheck className="h-4 w-4" />
                                    </Button>
                                  )}
                                {["draft", "pending", "in_transit"].includes(transfer.status) &&
                                  canCancel && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setCancelId(transfer.id);
                                        setIsCancelOpen(true);
                                      }}
                                      title="Annuler"
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      <XCircle className="h-4 w-4" />
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
              )}
            </CardContent>
          </Card>

          {/* ─── Create Transfer Dialog ──────────────────── */}
          <Dialog open={isCreateOpen} onOpenChange={(open) => !open && resetCreateForm()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5" />
                  Nouveau transfert
                </DialogTitle>
                <DialogDescription>
                  Transférez des produits entre boutiques de votre organisation
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Store selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Boutique source</Label>
                    <Select value={fromStoreId} onValueChange={setFromStoreId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        {stores
                          .filter((s) => s.is_active)
                          .map((store) => (
                            <SelectItem key={store.id} value={store.id}>
                              <div className="flex items-center gap-2">
                                <Store className="h-3 w-3" />
                                {store.name}
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Boutique destination</Label>
                    <Select value={toStoreId} onValueChange={setToStoreId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        {stores
                          .filter((s) => s.is_active && s.id !== fromStoreId)
                          .map((store) => (
                            <SelectItem key={store.id} value={store.id}>
                              <div className="flex items-center gap-2">
                                <Store className="h-3 w-3" />
                                {store.name}
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes (optionnel)</Label>
                  <Textarea
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    placeholder="Raison du transfert, instructions..."
                    rows={2}
                  />
                </div>

                {/* Product search + add */}
                {fromStoreId && (
                  <div className="space-y-3">
                    <Label>Ajouter des produits</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Rechercher un produit..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>

                    {/* Product suggestions */}
                    {productSearch && (
                      <div className="border rounded-lg max-h-40 overflow-y-auto">
                        {filteredProducts
                          .filter((p) => !transferItems.some((ti) => ti.product_id === p.id))
                          .slice(0, 10)
                          .map((product) => (
                            <button
                              key={product.id}
                              onClick={() => addItem(product)}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted text-left"
                            >
                              <div>
                                <p className="text-sm font-medium">{product.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Stock: {product.stock_quantity}
                                  {product.cost_price > 0 &&
                                    ` · ${formatPrice(product.cost_price)}`}
                                </p>
                              </div>
                              <Plus className="h-4 w-4 text-muted-foreground" />
                            </button>
                          ))}
                        {filteredProducts.filter(
                          (p) => !transferItems.some((ti) => ti.product_id === p.id)
                        ).length === 0 && (
                          <p className="text-sm text-muted-foreground p-3 text-center">
                            Aucun produit trouvé
                          </p>
                        )}
                      </div>
                    )}

                    {/* Transfer items table */}
                    {transferItems.length > 0 && (
                      <div className="border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Produit</TableHead>
                              <TableHead>Stock dispo.</TableHead>
                              <TableHead>Qté</TableHead>
                              <TableHead className="w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transferItems.map((item) => (
                              <TableRow key={item.product_id}>
                                <TableCell className="font-medium">
                                  {item.product_name}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {item.current_stock}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={item.current_stock}
                                    value={item.quantity}
                                    onChange={(e) =>
                                      updateItemQuantity(
                                        item.product_id,
                                        parseInt(e.target.value) || 1
                                      )
                                    }
                                    className="w-20 h-8"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeItem(item.product_id)}
                                    className="h-8 w-8 text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="px-4 py-2 border-t bg-muted/50 text-sm">
                          Total: {transferItems.reduce((acc, i) => acc + i.quantity, 0)} articles
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={resetCreateForm}>
                  Annuler
                </Button>
                <Button
                  onClick={() => { if (blockMutation("Créer un transfert")) return; createMutation.mutate(); }}
                  disabled={
                    createMutation.isPending ||
                    !fromStoreId ||
                    !toStoreId ||
                    transferItems.length === 0
                  }
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Créer le brouillon
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ─── Detail Dialog ───────────────────────────── */}
          <Dialog open={isDetailOpen} onOpenChange={(open) => {
            if (!open) {
              setIsDetailOpen(false);
              setSelectedTransfer(null);
              setReceiveMode(false);
              setReceiveItems({});
            }
          }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              {selectedTransfer && (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <span className="font-mono">{selectedTransfer.transfer_number}</span>
                      <Badge
                        variant="outline"
                        className={STATUS_CONFIG[selectedTransfer.status].color}
                      >
                        {STATUS_CONFIG[selectedTransfer.status].label}
                      </Badge>
                    </DialogTitle>
                    <DialogDescription>
                      <div className="flex items-center gap-2 mt-1">
                        <span>{selectedTransfer.from_store_name}</span>
                        <ArrowRight className="h-4 w-4" />
                        <span>{selectedTransfer.to_store_name}</span>
                      </div>
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    {/* Transfer info */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Créé par</span>
                        <p className="font-medium">
                          {selectedTransfer.created_by_name || "Inconnu"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date de création</span>
                        <p className="font-medium">
                          {format(
                            new Date(selectedTransfer.created_at),
                            "dd MMM yyyy HH:mm",
                            { locale: fr }
                          )}
                        </p>
                      </div>
                      {selectedTransfer.sent_at && (
                        <div>
                          <span className="text-muted-foreground">Envoyé le</span>
                          <p className="font-medium">
                            {format(
                              new Date(selectedTransfer.sent_at),
                              "dd MMM yyyy HH:mm",
                              { locale: fr }
                            )}
                          </p>
                        </div>
                      )}
                      {selectedTransfer.received_at && (
                        <div>
                          <span className="text-muted-foreground">Reçu le</span>
                          <p className="font-medium">
                            {format(
                              new Date(selectedTransfer.received_at),
                              "dd MMM yyyy HH:mm",
                              { locale: fr }
                            )}
                          </p>
                        </div>
                      )}
                      {selectedTransfer.received_by_name && (
                        <div>
                          <span className="text-muted-foreground">Réceptionné par</span>
                          <p className="font-medium">{selectedTransfer.received_by_name}</p>
                        </div>
                      )}
                    </div>

                    {selectedTransfer.notes && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Notes</span>
                        <p className="mt-1 p-2 bg-muted rounded-md">
                          {selectedTransfer.notes}
                        </p>
                      </div>
                    )}

                    {/* Items table */}
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Produit</TableHead>
                            <TableHead className="text-center">Qté envoyée</TableHead>
                            {receiveMode && (
                              <TableHead className="text-center">Qté reçue</TableHead>
                            )}
                            {!receiveMode && selectedTransfer.status !== "draft" && (
                              <TableHead className="text-center">Qté reçue</TableHead>
                            )}
                            <TableHead className="text-right">Coût unit.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedTransfer.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">
                                {item.product_name}
                              </TableCell>
                              <TableCell className="text-center">
                                {item.quantity}
                              </TableCell>
                              {receiveMode && item.product_id ? (
                                <TableCell className="text-center">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={item.quantity}
                                    value={receiveItems[item.product_id] ?? item.quantity}
                                    onChange={(e) =>
                                      setReceiveItems((prev) => ({
                                        ...prev,
                                        [item.product_id ?? "unknown"]: Math.min(
                                          parseInt(e.target.value) || 0,
                                          item.quantity
                                        ),
                                      }))
                                    }
                                    className="w-20 h-8 mx-auto"
                                  />
                                </TableCell>
                              ) : selectedTransfer.status !== "draft" ? (
                                <TableCell className="text-center">
                                  {item.quantity_received}
                                  {item.quantity_received < item.quantity && (
                                    <span className="text-amber-600 ml-1">
                                      /{item.quantity}
                                    </span>
                                  )}
                                </TableCell>
                              ) : null}
                              <TableCell className="text-right">
                                {item.unit_cost > 0 ? formatPrice(item.unit_cost) : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      {selectedTransfer.status === "draft" && canSend && (
                        <Button
                          onClick={() => { if (blockMutation("Envoyer le transfert")) return; sendMutation.mutate(selectedTransfer.id); }}
                          disabled={sendMutation.isPending}
                          className="gap-2"
                        >
                          {sendMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Envoyer le transfert
                        </Button>
                      )}
                      {(selectedTransfer.status === "pending" ||
                        selectedTransfer.status === "in_transit") &&
                        canReceive &&
                        !receiveMode && (
                          <Button
                            onClick={startReceive}
                            className="gap-2"
                            variant="default"
                          >
                            <PackageCheck className="h-4 w-4" />
                            Réceptionner
                          </Button>
                        )}
                      {receiveMode && (
                        <Button
                          onClick={() => { if (blockMutation("Recevoir le transfert")) return; receiveMutation.mutate(selectedTransfer.id); }}
                          disabled={receiveMutation.isPending}
                          className="gap-2"
                        >
                          {receiveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Confirmer la réception
                        </Button>
                      )}
                      {["draft", "pending", "in_transit"].includes(
                        selectedTransfer.status
                      ) &&
                        canCancel && (
                          <Button
                            variant="destructive"
                            onClick={() => {
                              setCancelId(selectedTransfer.id);
                              setIsCancelOpen(true);
                            }}
                            className="gap-2"
                          >
                            <XCircle className="h-4 w-4" />
                            Annuler
                          </Button>
                        )}
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* ─── Cancel Confirmation ─────────────────────── */}
          <AlertDialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Annuler le transfert ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action annulera le transfert et retournera le stock à la
                  boutique source. Cette action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label>Raison de l'annulation (optionnel)</Label>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Expliquez pourquoi ce transfert est annulé..."
                  rows={2}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    setCancelId(null);
                    setCancelReason("");
                  }}
                >
                  Non, garder
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { if (cancelId && !blockMutation("Annuler le transfert")) cancelMutation.mutate(cancelId); }}
                  disabled={cancelMutation.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {cancelMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Oui, annuler
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </FeatureGate>
    </DashboardLayout>
  );
};

export default StockTransfers;
