import { useState, useEffect, useCallback, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ProductsPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { ProductList } from "@/components/products/ProductList";
import { ProductForm } from "@/components/products/ProductForm";
import { StockAdjustDialog } from "@/components/products/StockAdjustDialog";
import { ProductImportDialog } from "@/components/products/ProductImportDialog";
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
import { OrgSelector } from "@/components/ui/org-selector";
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
  const { t } = useTranslation("products");
  const { user, userRole } = useAuth();
  const { effectiveOrgId } = useOrgSelector();
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
  // Filtre organisation (super_admin peut sélectionner une org, autres = leur org)
  if (effectiveOrgId) {
    filters.push({ column: "organization_id", operator: "eq", value: effectiveOrgId });
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
    queryKey: ["products", user?.id ?? "", storeFilter, effectiveOrgId ?? ""],
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
        p_category_id: product.category_id || undefined,
        p_barcode: product.barcode || undefined,
        p_unit: product.unit || 'unité',
        p_stock_quantity: product.stock_quantity ?? 0,
        p_min_stock_alert: product.min_stock_alert ?? 5,
        p_cost_price: product.cost_price || undefined,
        p_supplier_id: product.supplier_id || undefined,
        p_store_id: product.store_id || undefined,
        p_description: product.description || undefined,
        p_image_url: product.image_url || undefined,
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
      toast({ title: t("toasts.createSuccess") });
      setIsFormOpen(false);
    },
    onError: (error: unknown) => {
      // Supabase RPC errors are PostgrestError objects — extractErrorMessage handles them
      const msg = extractErrorMessage(error);
      const isPlanLimit = msg.includes('Limite') || msg.includes('plan') || msg.includes('Upgrad');
      const isRlsError = msg.includes('policy') || msg.includes('row-level') || msg.includes('violates') || msg.includes('409');
      toast({
        variant: "destructive",
        title: isPlanLimit ? t("toasts.createLimitTitle") : t("toasts.genericErrorTitle"),
        description: isPlanLimit
          ? t("toasts.createLimitDescription")
          : isRlsError
          ? t("toasts.createRlsDescription")
          : t("toasts.createErrorDescription", { message: msg }),
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
      toast({ title: t("toasts.updateSuccess") });
      setIsFormOpen(false);
      setSelectedProduct(null);
    },
    onError: (error: unknown) => {
      const msg = extractErrorMessage(error);
      const isRlsError = msg.includes('policy') || msg.includes('row-level') || msg.includes('violates') || msg.includes('409');
      toast({
        variant: "destructive",
        title: t("toasts.genericErrorTitle"),
        description: isRlsError
          ? t("toasts.updateRlsDescription")
          : t("toasts.updateErrorDescription", { message: msg }),
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
      toast({ title: t("toasts.deleteSuccess") });
    },
    onError: (error: unknown) => {
      const msg = extractErrorMessage(error);
      const isRlsError = msg.includes('policy') || msg.includes('row-level') || msg.includes('violates') || msg.includes('409');
      toast({
        variant: "destructive",
        title: t("toasts.genericErrorTitle"),
        description: isRlsError
          ? t("toasts.deleteRlsDescription")
          : t("toasts.deleteErrorDescription", { message: msg }),
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
          p_reason: data.reason || undefined,
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
        restock: t("toasts.stockRestockSuccess"),
        loss: t("toasts.stockLossSuccess"),
        adjustment: t("toasts.stockAdjustedSuccess"),
      };
      toast({ title: typeLabels[variables.type] });
      setIsStockAdjustOpen(false);
      setStockAdjustProduct(null);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("toasts.genericErrorTitle"),
        description: t("toasts.stockAdjustErrorDescription"),
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
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importExistingProducts, setImportExistingProducts] = useState<
    { name: string; barcode: string | null }[]
  >([]);

  const handleOpenImportDialog = useCallback(async () => {
    try {
      const filters: Array<{ column: string; operator: "eq"; value: unknown }> = [];
      if (effectiveOrgId) {
        filters.push({ column: "organization_id", operator: "eq", value: effectiveOrgId });
      }
      const data = await fetchAllRows<{ name: string; barcode: string | null }>(
        "products",
        "name, barcode",
        { filters }
      );
      setImportExistingProducts(data ?? []);
    } catch (err) {
      setImportExistingProducts([]);
      reportError(err instanceof Error ? err : new Error(String(err)));
    }
    setIsImportDialogOpen(true);
  }, [effectiveOrgId]);

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
          title: t("toasts.exportSuccessTitle"),
          description: t("toasts.exportSuccessDescription", { count: data.length }),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("toasts.exportEmptyTitle"),
          description: t("toasts.exportEmptyDescription"),
        });
      }
    } catch {
      toast({ variant: "destructive", title: t("toasts.genericErrorTitle"), description: t("toasts.exportErrorDescription") });
    }
  }, [currency, toast, effectiveOrgId, t]);

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <OrgSelector />
            <CurrencyDisplaySelector
              orgCurrencyCode={orgCurrencyCode}
              displayCurrencyCode={displayCurrencyCode}
              onDisplayCurrencyChange={setDisplayCurrency}
              ratesLoading={ratesLoading}
              onRefreshRates={refreshRates}
            />
            {canModify && (
              <Button
                variant="outline"
                onClick={handleOpenImportDialog}
              >
                <Upload className="mr-2 h-4 w-4" />
                {t("actions.importCsv")}
              </Button>
            )}
            <FeatureGate feature="exports" fallback={null}>
              <Button
                variant="outline"
                onClick={handleExport}
              >
                <Download className="mr-2 h-4 w-4" />
                {t("actions.export")}
              </Button>
            </FeatureGate>
            {canModify && (
              <PlanLimitGuard limitType="products" showUpgrade={true}>
                <Button onClick={handleOpenForm} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("actions.addProduct")}
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
                  {t("stockAlerts.outOfStock", { count: outOfStockCount })}
                </span>
              )}
              {outOfStockCount > 0 && lowStockCount > 0 && (
                <span className="text-muted-foreground"> · </span>
              )}
              {lowStockCount > 0 && (
                <span className="font-medium text-warning">
                  {t("stockAlerts.lowStock", { count: lowStockCount })}
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
              placeholder={t("search.placeholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
          {/* Filtre magasin explicite — visible pour l'utilisateur */}
          {stores.length > 1 && (
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder={t("storeFilter.allStoresPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("storeFilter.allStores")}</SelectItem>
                {activeCurrentStore && (
                  <SelectItem value={activeCurrentStore.id}>
                    {t("storeFilter.currentStore", { name: activeCurrentStore.name })}
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
              {t("categoryFilter.all", { count: totalProducts })}
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
            <h3 className="text-lg font-medium mb-2">{t("empty.title")}</h3>
            <p className="text-muted-foreground mb-4">
              {t("empty.description")}
            </p>
            {canModify && (
              <Button onClick={handleOpenForm} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                {t("empty.addFirst")}
              </Button>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {t("pagination.showing", { from: ((safeCurrentPage - 1) * PAGE_SIZE) + 1, to: Math.min(safeCurrentPage * PAGE_SIZE, totalCount), total: totalCount })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
              >
                {t("pagination.previous")}
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
                {t("pagination.next")}
              </Button>
            </div>
          </div>
        )}

        {/* Product Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>
                {selectedProduct ? t("form.editTitle") : t("form.newTitle")}
              </DialogTitle>
            </DialogHeader>
            <ProductForm
              product={selectedProduct}
              onSubmit={handleSubmit}
              isLoading={createProductMutation.isPending || updateProductMutation.isPending}
            />
          </DialogContent>
        </Dialog>

        {/* Product Import Dialog */}
        <ProductImportDialog
          open={isImportDialogOpen}
          onOpenChange={setIsImportDialogOpen}
          existingProducts={importExistingProducts}
          existingCategories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
        />

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
              <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteDialog.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteTarget(null)}>{t("deleteDialog.cancel")}</AlertDialogCancel>
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
                {t("deleteDialog.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Products;
