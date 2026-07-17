import { useState, useEffect, useCallback, useDeferredValue, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ProductsPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { ProductList } from "@/components/products/ProductList";
import { ProductForm } from "@/components/products/ProductForm";
import { StockAdjustDialog } from "@/components/products/StockAdjustDialog";
import { StockMovementHistory } from "@/components/products/StockMovementHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Package, Download, AlertTriangle, Upload } from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
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
import { Database } from "@/integrations/supabase/types";
import { exportProductsToCSV } from "@/utils/exportUtils";
import { useCurrency } from "@/hooks/useCurrency";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { CurrencyDisplaySelector } from "@/components/ui/currency-display-selector";
import { usePaginatedQuery } from "@/hooks/usePaginatedQuery";
import { useCategories } from "@/hooks/useCategories";
import { useProductStats } from "@/hooks/useProductStats";
import { useStore } from "@/contexts/StoreContext";
import { fetchAllRows } from "@/lib/batchedFetch";
import { ProductWithCategory, AdjustStockRpcRow, MANAGEMENT_ROLES } from "@/types";
import { PlanLimitGuard, FeatureGate } from "@/components/saas/PlanLimitGuard";
import { useDemo } from "@/contexts/DemoContext";
import { reportError } from "@/lib/sentry";
import { extractErrorMessage } from "@/lib/extractErrorMessage";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductWithCat = ProductWithCategory;

const Products = () => {
  const { user, profile, userRole } = useAuth();
  const { currency } = useCurrency();
  const {
    displayCurrencyCode,
    orgCurrencyCode,
    setDisplayCurrency,
    ratesLoading,
    refreshRates,
  } = useDisplayCurrency();
  const { toast } = useToast();
  const { blockMutation } = useDemo();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const searchQuery = useDeferredValue(searchInput);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Stock adjust state
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [isStockAdjustOpen, setIsStockAdjustOpen] = useState(false);

  // Stock history state
  const [stockHistoryProduct, setStockHistoryProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [isStockHistoryOpen, setIsStockHistoryOpen] = useState(false);

  // ── Server-side paginated + filtered query ────────────────────────────────
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  // Filtre magasin explicite (UI visible)
  // - "all" : tous les produits de l'org (par défaut)
  // - storeId : produits d'un magasin spécifique
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const { currentStore: activeCurrentStore, stores } = useStore();

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, storeFilter]);

  const filters: Array<{
    column: string;
    operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is";
    value: unknown;
  }> = [];
  if (selectedCategory) {
    filters.push({ column: "category_id", operator: "eq", value: selectedCategory });
  }
  // Filtre magasin EXPLICITE (vs ancien filtre invisible)
  if (storeFilter !== "all") {
    filters.push({ column: "store_id", operator: "eq", value: storeFilter });
  }

  const {
    data: paginatedProducts,
    totalCount,
    totalPages,
    isLoading,
  } = usePaginatedQuery<ProductWithCategory>({
    table: "products",
    select: "*, categories(name, color, icon)",
    filters,
    search: searchQuery
      ? { columns: ["name", "barcode"], query: searchQuery }
      : undefined,
    orderBy: { column: "created_at", ascending: false },
    page: currentPage,
    pageSize: PAGE_SIZE,
    queryKey: ["products", user?.id ?? "", storeFilter],
    enabled: !!user,
  });

  // ── Product stats via RPC hook ──
  const { data: productStats } = useProductStats();

  const { data: categories } = useCategories();

  const canModify = userRole !== null && MANAGEMENT_ROLES.includes(userRole);

  const createProductMutation = useMutation({
    mutationFn: async (product: Omit<ProductInsert, "user_id">) => {
      // Use server-side plan-enforced RPC
      // ⚠️ Le paramètre DB s'appelle p_cost_price (et NON p_buy_price).
      // Voir migration 20260703020000_p1_server_side_plan_enforcement.sql ligne 23.
      const { data, error } = await supabase.rpc("create_product", {
        p_name: product.name,
        p_price: product.price,
        p_category_id: product.category_id || null,
        p_barcode: product.barcode || null,
        p_unit: product.unit || 'unité',
        p_stock_quantity: product.stock_quantity ?? 0,
        p_min_stock_alert: product.min_stock_alert ?? 5,
        p_cost_price: product.cost_price || null,
        p_supplier_id: product.supplier_id || null,
        p_store_id: product.store_id || null,
        p_description: product.description || null,
        p_image_url: product.image_url || null,
        p_is_active: product.is_active ?? true,
      });

      if (error) return [];

      // Fetch the created product for cache update
      const { data: newProduct, error: fetchError } = await supabase
        .from("products")
        .select()
        .eq("id", data)
        .single();

      if (fetchError) throw fetchError;
      return newProduct;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-stats"] });
      toast({ title: "Produit créé avec succès" });
      setIsFormOpen(false);
    },
    onError: (error: unknown) => {
      // Supabase RPC errors are PostgrestError objects — extractErrorMessage handles them
      const msg = extractErrorMessage(error);
      const isPlanLimit = msg.includes('Limite') || msg.includes('plan') || msg.includes('Upgrad');
      const isRlsError = msg.includes('policy') || msg.includes('row-level') || msg.includes('violates') || msg.includes('409');
      toast({
        variant: "destructive",
        title: isPlanLimit ? "Limite atteinte" : "Erreur",
        description: isPlanLimit
          ? "Limite de produits atteinte pour votre plan. Upgradez votre abonnement."
          : isRlsError
          ? "Permission insuffisante. Seuls les administrateurs et managers peuvent créer des produits."
          : `Impossible de créer le produit: ${msg}`,
      });
      reportError(error instanceof Error ? error : new Error(msg));
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, stock_quantity, ...product }: Partial<Product> & { id: string }) => {
      // ⚠️ stock_quantity retiré du payload — les mises à jour de stock
      // doivent passer UNIQUEMENT par adjust_product_stock RPC (atomicité)
      // sinon un edit produit peut écraser un ajustement concurrent (lost update)
      const { data, error } = await supabase
        .from("products")
        .update(product)
        .eq("id", id)
        .select()
        .single();

      if (error) return [];
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-stats"] });
      toast({ title: "Produit mis à jour" });
      setIsFormOpen(false);
      setSelectedProduct(null);
    },
    onError: (error: unknown) => {
      const msg = extractErrorMessage(error);
      const isRlsError = msg.includes('policy') || msg.includes('row-level') || msg.includes('violates') || msg.includes('409');
      toast({
        variant: "destructive",
        title: "Erreur",
        description: isRlsError
          ? "Permission insuffisante pour modifier ce produit."
          : `Impossible de modifier le produit: ${msg}`,
      });
      reportError(error instanceof Error ? error : new Error(msg));
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) return [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-stats"] });
      toast({ title: "Produit supprimé" });
    },
    onError: (error: unknown) => {
      const msg = extractErrorMessage(error);
      const isRlsError = msg.includes('policy') || msg.includes('row-level') || msg.includes('violates') || msg.includes('409');
      toast({
        variant: "destructive",
        title: "Erreur",
        description: isRlsError
          ? "Permission insuffisante pour supprimer ce produit."
          : `Impossible de supprimer le produit: ${msg}`,
      });
      reportError(error instanceof Error ? error : new Error(msg));
    },
  });

  // Stock adjustment mutation — atomique via RPC adjust_product_stock
  const stockAdjustMutation = useMutation({
    mutationFn: async (data: {
      productId: string;
      type: "restock" | "adjustment" | "loss";
      quantity: number;
      reason: string;
      previousQuantity: number; // utilisé uniquement pour l'affichage UI (pas pour le calcul)
    }) => {
      // Utiliser la RPC atomique pour éviter les race conditions (lost updates)
      // quand plusieurs utilisateurs ajustent le stock simultanément.
      const { data: result, error: rpcError } = await supabase.rpc(
        "adjust_product_stock",
        {
          p_product_id: data.productId,
          p_type: data.type,
          p_quantity: data.quantity,
          p_reason: data.reason || null,
        }
      );

      if (rpcError) throw rpcError;

      const typed = result as unknown as AdjustStockRpcRow[];
      return { newQuantity: typed?.[0]?.new_quantity ?? data.quantity };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-stats"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements", variables.productId] });

      const typeLabels = {
        restock: "Réapprovisionnement enregistré",
        loss: "Perte enregistrée",
        adjustment: "Stock ajusté",
      };
      toast({ title: typeLabels[variables.type] });
      setIsStockAdjustOpen(false);
      setStockAdjustProduct(null);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible d'ajuster le stock",
      });
      reportError(error instanceof Error ? error : new Error(extractErrorMessage(error)));
    },
  });

  const handleSubmit = (productData: Omit<ProductInsert, "user_id">) => {
    if (selectedProduct) {
      if (blockMutation('Modifier un produit')) return;
      updateProductMutation.mutate({ id: selectedProduct.id, ...productData });
    } else {
      if (blockMutation('Créer un produit')) return;
      createProductMutation.mutate(productData);
    }
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    const product = paginatedProducts?.find((p) => p.id === id) || null;
    setDeleteTarget(product);
  };

  const handleOpenForm = () => {
    setSelectedProduct(null);
    setIsFormOpen(true);
  };

  // ─── Import CSV ───────────────────────────────────────────────
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        toast({ variant: "destructive", title: "CSV vide", description: "Le fichier doit contenir au moins 1 ligne d'en-tête + 1 produit" });
        return;
      }

      // Parser l'en-tête
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

      let created = 0;
      let errors = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ""; });

        const name = row["nom"] || row["name"] || "";
        if (!name) { errors++; continue; }

        const price = parseFloat(row["prix"] || row["price"] || "0") || 0;
        const stock = parseInt(row["stock"] || row["stock_quantity"] || "0") || 0;
        const costPrice = parseFloat(row["cout"] || row["cost_price"] || "0") || 0;
        const barcode = row["code-barres"] || row["barcode"] || null;
        const unit = row["unite"] || row["unit"] || "unité";

        try {
          const { error } = await supabase.rpc("create_product", {
            p_name: name,
            p_price: price,
            p_stock_quantity: stock,
            p_min_stock_alert: 5,
            p_cost_price: costPrice || null,
            p_category_id: null,
            p_barcode: barcode,
            p_unit: unit,
            p_supplier_id: null,
            p_store_id: null,
            p_description: null,
            p_image_url: null,
            p_is_active: true,
          });
          if (error) { errors++; } else { created++; }
        } catch { errors++; }
      }

      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-stats"] });

      toast({
        title: "Import terminé",
        description: `${created} produit(s) importé(s)${errors > 0 ? `, ${errors} erreur(s)` : ""}`,
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de lire le fichier CSV" });
      reportError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  const handleStockAdjust = (product: Product) => {
    setStockAdjustProduct(product);
    setIsStockAdjustOpen(true);
  };

  const handleStockHistory = (product: Product) => {
    setStockHistoryProduct(product);
    setIsStockHistoryOpen(true);
  };

  // Clamp current page to valid range (e.g. after deletion reduces totalPages)
  const safeCurrentPage = Math.min(currentPage, Math.max(1, totalPages));
  useEffect(() => {
    if (currentPage !== safeCurrentPage && safeCurrentPage > 0) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  // Stats (from RPC aggregate)
  const totalProducts = productStats?.totalProducts ?? 0;
  const lowStockCount = productStats?.lowStockCount ?? 0;
  const outOfStockCount = productStats?.outOfStockCount ?? 0;

  // Category counts for filter buttons (from RPC aggregate)
  const catCounts = new Map<string, number>(
    Object.entries(productStats?.categoryCounts ?? {}).map(([k, v]) => [k, v as number])
  );

  // On-demand fetch for CSV export — fetchAllRows avec filtre org_id
  const handleExport = useCallback(async () => {
    try {
      const filters: Array<{ column: string; operator: "eq"; value: unknown }> = [];
      if (effectiveOrgId) {
        filters.push({ column: "organization_id", operator: "eq", value: effectiveOrgId });
      }
      const data = await fetchAllRows<ProductWithCat>(
        "products",
        "*, categories(name, color, icon)",
        {
          filters,
          orderBy: { column: "created_at", ascending: false },
        }
      );

      if (data && data.length > 0) {
        exportProductsToCSV(
          data.map((p) => ({
            name: p.name,
            category: p.categories?.name || "",
            barcode: p.barcode,
            price: p.price,
            cost_price: p.cost_price,
            stock_quantity: p.stock_quantity,
            min_stock_alert: p.min_stock_alert,
            unit: p.unit,
            is_active: p.is_active,
            expiry_date: p.expiry_date,
          })),
          currency.displaySymbol || currency.symbol
        );
        toast({
          title: "Export réussi",
          description: `${data.length} produits exportés`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Aucun produit",
          description: "Pas de produits à exporter",
        });
      }
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible d'exporter les produits" });
    }
  }, [currency, toast, effectiveOrgId]);

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
              Produits
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gérez votre inventaire de produits
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CurrencyDisplaySelector
              orgCurrencyCode={orgCurrencyCode}
              displayCurrencyCode={displayCurrencyCode}
              onDisplayCurrencyChange={setDisplayCurrency}
              ratesLoading={ratesLoading}
              onRefreshRates={refreshRates}
            />
            {canModify && (
              <>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleImportCSV}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => csvInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Importer CSV
                </Button>
              </>
            )}
            <FeatureGate feature="exports" fallback={null}>
              <Button
                variant="outline"
                onClick={handleExport}
              >
                <Download className="mr-2 h-4 w-4" />
                Exporter
              </Button>
            </FeatureGate>
            {canModify && (
              <PlanLimitGuard limitType="products" showUpgrade={true}>
                <Button onClick={handleOpenForm} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Ajouter un produit
                </Button>
              </PlanLimitGuard>
            )}
          </div>
        </div>

        {/* Stock alerts banner */}
        {(lowStockCount > 0 || outOfStockCount > 0) && (
          <div className="flex items-center gap-3 p-3 bg-warning/10 border border-warning/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
            <div className="text-sm">
              {outOfStockCount > 0 && (
                <span className="font-medium text-destructive">
                  {outOfStockCount} produit{outOfStockCount > 1 ? "s" : ""} en rupture
                </span>
              )}
              {outOfStockCount > 0 && lowStockCount > 0 && (
                <span className="text-muted-foreground"> · </span>
              )}
              {lowStockCount > 0 && (
                <span className="font-medium text-warning">
                  {lowStockCount} produit{lowStockCount > 1 ? "s" : ""} en stock bas
                </span>
              )}
            </div>
          </div>
        )}

        {/* Search + Store Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un produit..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
          {/* Filtre magasin explicite — visible pour l'utilisateur */}
          {stores.length > 1 && (
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Tous les magasins" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les magasins</SelectItem>
                {activeCurrentStore && (
                  <SelectItem value={activeCurrentStore.id}>
                    Magasin courant ({activeCurrentStore.name})
                  </SelectItem>
                )}
                {stores
                  .filter((s) => s.id !== activeCurrentStore?.id)
                  .map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Category Filters */}
        {categories && categories.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              Toutes ({totalProducts})
            </Button>
            {categories.map((category) => {
              const count = catCounts.get(category.id) || 0;
              return (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  style={{
                    backgroundColor:
                      selectedCategory === category.id
                        ? category.color || undefined
                        : undefined,
                  }}
                >
                  <CategoryIcon iconName={category.icon} className="h-3.5 w-3.5" /> {category.name} ({count})
                </Button>
              );
            })}
          </div>
        )}

        {/* Products List */}
        {isLoading ? (
          <ProductsPageSkeleton />
        ) : paginatedProducts && paginatedProducts.length > 0 ? (
          <ProductList
            products={paginatedProducts}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onStockAdjust={handleStockAdjust}
            onStockHistory={handleStockHistory}
          />
        ) : (
          <div className="text-center py-12 bg-card rounded-xl border">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Aucun produit</h3>
            <p className="text-muted-foreground mb-4">
              Commencez par ajouter votre premier produit
            </p>
            {canModify && (
              <Button onClick={handleOpenForm} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un produit
              </Button>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {((safeCurrentPage - 1) * PAGE_SIZE) + 1}–{Math.min(safeCurrentPage * PAGE_SIZE, totalCount)} sur {totalCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
              >
                Précédent
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (safeCurrentPage <= 3) {
                    page = i + 1;
                  } else if (safeCurrentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = safeCurrentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={page}
                      variant={page === safeCurrentPage ? "default" : "outline"}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}

        {/* Product Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>
                {selectedProduct ? "Modifier le produit" : "Nouveau produit"}
              </DialogTitle>
            </DialogHeader>
            <ProductForm
              product={selectedProduct}
              onSubmit={handleSubmit}
              isLoading={createProductMutation.isPending || updateProductMutation.isPending}
            />
          </DialogContent>
        </Dialog>

        {/* Stock Adjust Dialog */}
        <StockAdjustDialog
          product={stockAdjustProduct}
          isOpen={isStockAdjustOpen}
          onClose={() => {
            setIsStockAdjustOpen(false);
            setStockAdjustProduct(null);
          }}
          onConfirm={(data) => {
            if (blockMutation('Ajuster le stock')) return;
            stockAdjustMutation.mutate(data);
          }}
          isLoading={stockAdjustMutation.isPending}
        />

        {/* Stock Movement History Dialog */}
        <StockMovementHistory
          productId={stockHistoryProduct?.id ?? null}
          productName={stockHistoryProduct?.name ?? ""}
          isOpen={isStockHistoryOpen}
          onClose={() => {
            setIsStockHistoryOpen(false);
            setStockHistoryProduct(null);
          }}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le produit?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Les ventes associées seront conservées.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteTarget) {
                    if (blockMutation('Supprimer un produit')) return;
                    deleteProductMutation.mutate(deleteTarget.id);
                    setDeleteTarget(null);
                  }
                }}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Products;
