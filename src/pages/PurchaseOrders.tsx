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
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
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
  Sparkles,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  Send,
  FileText,
  XCircle,
  Loader2,
  Download,
  Mail,
  MessageCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { CurrencyDisplaySelector } from "@/components/ui/currency-display-selector";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Supplier, Product } from "@/types";
import { ReceiveOrderForm } from "@/components/purchase-orders/ReceiveOrderForm";
import { reportError } from "@/lib/sentry";
import { Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

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
  const navigate = useNavigate();
  const storeId = useStoreId();
  const { toast } = useToast();
  const { blockMutation } = useDemo();
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
  const [isQuickCreatingProduct, setIsQuickCreatingProduct] = useState(false);
  const [quickProductName, setQuickProductName] = useState("");

  const canModify =
    userRole === "admin" || userRole === "manager" || userRole === "super_admin";

  // ─── Fetch purchase orders ───────────────────────────────────
  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase-orders", user?.id, statusFilter],
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

      const { data, error } = await query;
      if (error) return [];
      return (data as (PurchaseOrder & { suppliers: { name: string } | null })[])?.map((o) => ({
        ...o,
        supplier_name: o.suppliers?.name || "Fournisseur inconnu",
      }));
    },
    enabled: !!user && !!profile?.organization_id,
  });

  // ─── Fetch suppliers for form ────────────────────────────────
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) return [];
      return data as Pick<Supplier, "id" | "name">[];
    },
    enabled: !!user,
  });

  // ─── Fetch products for form ─────────────────────────────────
  const { data: products } = useQuery({
    queryKey: ["products-lookup", user?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, cost_price")
          .eq("is_active", true)
          .order("name")
          .limit(200);
        if (error) return [];
        return data as Pick<Product, "id" | "name" | "cost_price">[];
      } catch {
        return [];
      }
    },
    enabled: !!user && isFormOpen,
    retry: 1,
  });

  // ─── Quick create product from PO form ──────────────────────
  const handleQuickCreateProduct = async (index: number) => {
    if (!quickProductName.trim()) return;
    setIsQuickCreatingProduct(true);
    try {
      const { data: productId, error } = await supabase.rpc("create_product", {
        p_name: quickProductName.trim(),
        p_price: 0,
        p_stock_quantity: 0,
        p_min_stock_alert: 0,
        p_cost_price: null,
        p_category_id: null,
        p_barcode: null,
        p_unit: "unité",
        p_supplier_id: null,
        p_store_id: storeId,
        p_description: null,
        p_image_url: null,
        p_is_active: true,
      });
      if (error) return [];

      // Mettre à jour la ligne avec le nouveau produit
      const newItems = [...formItems];
      newItems[index] = {
        ...newItems[index],
        product_id: productId,
        product_name: quickProductName.trim(),
      };
      setFormItems(newItems);

      toast({
        title: "Produit créé",
        description: `« ${quickProductName.trim()} » ajouté. Prix à définir plus tard.`,
      });

      // Invalider le cache des produits pour que le dropdown se mette à jour
      queryClient.invalidateQueries({ queryKey: ["products-lookup"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });

      setQuickProductName("");
    } catch (err) {
      reportError(err instanceof Error ? err : new Error(String(err)));
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de créer le produit.",
      });
    } finally {
      setIsQuickCreatingProduct(false);
    }
  };

  // ─── Create order ────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      // Generate order number
      const { data: orderNumber } = await supabase.rpc("generate_order_number", {
        p_org_id: profile?.organization_id ?? "",
      });

      const subtotal = formItems.reduce((s, i) => s + i.line_total, 0);
      const taxAmount = formItems.reduce(
        (s, i) => s + (i.line_total * i.tax_rate) / 100,
        0
      );

      const { data: order, error: orderError } = await supabase
        .from("purchase_orders")
        .insert({
          organization_id: profile?.organization_id ?? "",
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
          // created_by reference profiles(id) — pas auth.users(id)
          // On l'omet (nullable) pour éviter une violation FK
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
      if (error) return [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Statut mis à jour" });
    },
    onError: (error: unknown) => {
      reportError(error);
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
      if (error) return [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Commande supprimée" });
      setIsDeleteOpen(false);
      setSelectedOrder(null);
    },
    onError: (error: unknown) => {
      reportError(error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer la commande",
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

  // ─── Bon de commande (BL) — téléchargement ───────────────────
  const handleDownloadBL = (order: PurchaseOrder) => {
    const supplierName = order.supplier_name || "Fournisseur";
    const items = order.items || [];
    const date = format(new Date(order.order_date), "dd/MM/yyyy", { locale: fr });

    // Construire le HTML du bon de commande
    const itemsHtml = items.map((item, idx) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${idx + 1}</td>
        <td style="padding:8px;border:1px solid #ddd;">${item.product_name || "-"}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">${item.quantity_ordered}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatPrice(Number(item.unit_cost))}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatPrice(Number(item.unit_cost) * item.quantity_ordered)}</td>
      </tr>
    `).join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Bon de commande ${order.order_number}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
          h1 { color: #F97316; }
          .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .supplier { margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #F97316; color: white; padding: 8px; border: 1px solid #ddd; text-align: left; }
          .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 10px; }
          .notes { margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Bon de Commande</h1>
            <p><strong>N° ${order.order_number}</strong></p>
            <p>Date : ${date}</p>
          </div>
          <div>
            <p><strong>${profile?.business_name || "MakitiPlus"}</strong></p>
            <p>${profile?.address || ""}</p>
            <p>${profile?.phone || ""}</p>
          </div>
        </div>
        <div class="supplier">
          <p><strong>Fournisseur :</strong> ${supplierName}</p>
          ${order.expected_delivery ? `<p><strong>Livraison prévue :</strong> ${format(new Date(order.expected_delivery), "dd/MM/yyyy", { locale: fr })}</p>` : ""}
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Produit</th>
              <th style="text-align:center;">Qté</th>
              <th style="text-align:right;">Prix unitaire</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="total">
          <p>Sous-total : ${formatPrice(Number(order.subtotal))}</p>
          <p>Total : ${formatPrice(Number(order.total_amount))}</p>
        </div>
        ${order.notes ? `<div class="notes"><strong>Notes :</strong> ${order.notes}</div>` : ""}
      </body>
      </html>
    `;

    // Ouvrir dans une nouvelle fenêtre pour impression/téléchargement
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    } else {
      toast({
        variant: "destructive",
        title: "Popup bloqué",
        description: "Autorisez les popups pour télécharger le bon de commande.",
      });
    }
  };

  // ─── Envoyer par email ────────────────────────────────────────
  const handleSendEmail = async (order: PurchaseOrder) => {
    // Récupérer l'email du fournisseur
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("email, phone, name")
      .eq("id", order.supplier_id)
      .single();

    if (!supplier?.email) {
      toast({
        variant: "destructive",
        title: "Email manquant",
        description: `Le fournisseur "${supplier?.name || ""}" n'a pas d'email. Ajoutez-le dans la page Fournisseurs.`,
      });
      return;
    }

    const subject = `Bon de commande ${order.order_number}`;
    const body = `Bonjour,

Veuillez trouver ci-dessous notre bon de commande :

N° : ${order.order_number}
Date : ${format(new Date(order.order_date), "dd/MM/yyyy", { locale: fr })}
Fournisseur : ${order.supplier_name}
Total : ${formatPrice(Number(order.total_amount))}

Articles :
${(order.items || []).map((item, i) => `${i + 1}. ${item.product_name} — Qté: ${item.quantity_ordered} — Prix: ${formatPrice(Number(item.unit_cost))}`).join("\n")}

${order.notes ? `Notes : ${order.notes}` : ""}

Cordialement,
${profile?.business_name || "MakitiPlus"}
${profile?.phone || ""}`;

    // Ouvrir le client email avec mailto
    window.location.href = `mailto:${supplier.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    toast({
      title: "Email préparé",
      description: `Votre client email s'ouvre avec le bon de commande pour ${supplier.email}`,
    });
  };

  // ─── Envoyer par WhatsApp ─────────────────────────────────────
  const handleSendWhatsApp = async (order: PurchaseOrder) => {
    // Récupérer le téléphone du fournisseur
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("phone, name")
      .eq("id", order.supplier_id)
      .single();

    if (!supplier?.phone) {
      toast({
        variant: "destructive",
        title: "Téléphone manquant",
        description: `Le fournisseur "${supplier?.name || ""}" n'a pas de téléphone. Ajoutez-le dans la page Fournisseurs.`,
      });
      return;
    }

    // Nettoyer le numéro (enlever espaces, +, etc.)
    const cleanPhone = supplier.phone.replace(/[\s+\-()]/g, "");

    const message = `Bonjour,

Voici notre bon de commande :

N° : ${order.order_number}
Date : ${format(new Date(order.order_date), "dd/MM/yyyy", { locale: fr })}
Total : ${formatPrice(Number(order.total_amount))}

Articles :
${(order.items || []).map((item, i) => `${i + 1}. ${item.product_name} — Qté: ${item.quantity_ordered} — Prix: ${formatPrice(Number(item.unit_cost))}`).join("\n")}

${order.notes ? `Notes : ${order.notes}` : ""}

Cordialement,
${profile?.business_name || "MakitiPlus"}`;

    // Ouvrir WhatsApp avec le message pré-rempli
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");

    toast({
      title: "WhatsApp ouvert",
      description: `WhatsApp s'ouvre avec le bon de commande pour ${supplier.phone}`,
    });
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
              Upgradez votre abonnement pour accéder à cette fonctionnalité.
            </p>
            <Button onClick={() => navigate("/dashboard/billing")}>
              Voir les abonnements
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
                Commandes Fournisseurs
              </h1>
              <p className="text-muted-foreground mt-1">
                Gérez vos commandes d'approvisionnement
              </p>
            </div>
            <CurrencyDisplaySelector
              orgCurrencyCode={orgCurrencyCode}
              displayCurrencyCode={displayCurrencyCode}
              onDisplayCurrencyChange={setDisplayCurrency}
              ratesLoading={ratesLoading}
              onRefreshRates={refreshRates}
            />
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
                    <p className="text-2xl font-bold">{formatDisplayPrice(totalValue, { showOriginal: isConverted })}</p>
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
              <SelectTrigger className="w-full sm:w-40">
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
                              {formatDisplayPrice(Number(order.total_amount), { showOriginal: isConverted })}
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
                                    onClick={() => {
                                      if (blockMutation('Modifier le statut d\'une commande')) return;
                                      updateStatusMutation.mutate({ id: order.id, status: "sent" });
                                    }}
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
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
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
                    <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                      <div className="sm:col-span-4">
                        {index === 0 && <Label className="text-xs">Produit</Label>}
                        {item.product_id ? (
                          <div className="flex items-center gap-2">
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
                        ) : (
                          <div className="space-y-1">
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
                            {/* Création rapide de produit — toujours visible */}
                            <div className="flex gap-1">
                              <Input
                                type="text"
                                placeholder="Ou créer un nouveau produit..."
                                value={quickProductName}
                                onChange={(e) => setQuickProductName(e.target.value)}
                                className="h-9 text-sm flex-1"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && quickProductName.trim()) {
                                    e.preventDefault();
                                    handleQuickCreateProduct(index);
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1 shrink-0"
                                disabled={!quickProductName.trim() || isQuickCreatingProduct}
                                onClick={() => handleQuickCreateProduct(index)}
                              >
                                <Sparkles className="h-3 w-3" />
                                {isQuickCreatingProduct ? "..." : "Créer"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        {index === 0 && <Label className="text-xs">Qté</Label>}
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity_ordered}
                          onChange={(e) => updateItem(index, "quantity_ordered", Number(e.target.value))}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        {index === 0 && <Label className="text-xs">Prix unitaire</Label>}
                        <Input
                          type="number"
                          min={0}
                          value={item.unit_cost}
                          onChange={(e) => updateItem(index, "unit_cost", Number(e.target.value))}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        {index === 0 && <Label className="text-xs">Total</Label>}
                        <div className="h-9 px-3 flex items-center text-sm font-medium bg-muted rounded-md">
                          {formatDisplayPrice(item.line_total, { showOriginal: isConverted })}
                        </div>
                      </div>
                      <div className="sm:col-span-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => removeItem(index)}
                          disabled={formItems.length <= 1}
                          aria-label="Supprimer l'article"
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
                      Sous-total : <span className="font-medium">{formatDisplayPrice(formItems.reduce((s, i) => s + i.line_total, 0), { showOriginal: isConverted })}</span>
                    </p>
                    <p className="text-lg font-bold">
                      Total : {formatDisplayPrice(formItems.reduce((s, i) => s + i.line_total, 0), { showOriginal: isConverted })}
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
                  onClick={() => {
                    if (blockMutation('Cr\u00e9er une commande')) return;
                    createMutation.mutate();
                  }}
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
            <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Détails commande {selectedOrder?.order_number}</DialogTitle>
              </DialogHeader>
              {selectedOrder && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
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
                        {formatDisplayPrice(Number(selectedOrder.total_amount), { showOriginal: isConverted })}
                      </p>
                    </div>
                  </div>
                  {selectedOrder.notes && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">{selectedOrder.notes}</p>
                    </div>
                  )}

                  {/* Actions : Télécharger BL + Email + WhatsApp */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleDownloadBL(selectedOrder)}
                    >
                      <Download className="h-4 w-4" />
                      Télécharger le BL
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleSendEmail(selectedOrder)}
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleSendWhatsApp(selectedOrder)}
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
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
                    if (selectedOrder) {
                      if (blockMutation('Supprimer une commande')) return;
                      deleteMutation.mutate(selectedOrder.id);
                    }
                  }}
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Receive Order Dialog */}
          <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Réceptionner la commande</DialogTitle>
                <DialogDescription>
                  Indiquez les quantités reçues pour chaque article. Le stock sera mis à jour automatiquement.
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && (
                <ReceiveOrderForm
                  orderId={selectedOrder.id}
                  orderNumber={selectedOrder.order_number}
                  onSuccess={() => {
                    setIsReceiveOpen(false);
                    setSelectedOrder(null);
                    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
                    toast({ title: "Commande réceptionnée", description: "Le stock a été mis à jour." });
                  }}
                  onError={(msg: string) => {
                    toast({ variant: "destructive", title: "Erreur", description: msg });
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </FeatureGate>
    </DashboardLayout>
  );
};

export default PurchaseOrders;
