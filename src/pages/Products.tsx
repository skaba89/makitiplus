import { useState, useEffect, useCallback, useDeferredValue } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Package, Download, AlertTriangle } from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
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
import { usePaginatedQuery } from "@/hooks/usePaginatedQuery";
import { useCategories } from "@/hooks/useCategories";
import { useProductStats } from "@/hooks/useProductStats";
import { fetchAllRows } from "@/lib/batchedFetch";
import { ProductWithCategory, AdjustStockRpcRow } from "@/types";
import { PlanLimitGuard, FeatureGate } from "@/components/saas/PlanLimitGuard";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductWithCat = ProductWithCategory;

const Products = () => {
  const { user, profile, userRole } = useAuth();
  const { currency } = useCurrency();
  const { toast } = useToast();
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

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  const filters: Array<{
    column: string;
    operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is";
    value: unknown;
  }> = [];
  if (selectedCategory) {
    filters.push({ column: "category_id", operator: "eq", value: selectedCategory });
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
    queryKey: ["products", user?.id ?? ""],
    enabled: !!user,
  });

  // ── Product stats via RPC hook ──
  const { data: productStats } = useProductStats();

  const { data: categories } = useCategories();

  const canModify = userRole === 'admin' || userRole === 'manager' || userRole === 'super_admin';

  const createProductMutation = useMutation({
    mutationFn: async (product: Omit<ProductInsert, "user_id">) => {
      const insertData: Record<string, unknown> = {
        ...product,
        user_id: user!.id,
      };

      // Explicitly set organization_id from profile to avoid relying solely on trigger
      if (profile?.organization_id) {
        insertData.organization_id = profile.organization_id;
      }

      const { data, error } = await supabase
        .from("products")
        .insert(insertData as ProductInsert)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-stats"] });
      toast({ title: "Produit créé avec succès" });
      setIsFormOpen(false);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error) ? String((error as Record<string, unknown>).message) : String(error);
      const isRlsError = msg.includes('policy') || msg.includes('row-level') || msg.includes('violates') || msg.includes('409');
      toast({
        variant: "destructive",
        title: "Erreur",
        description: isRlsError
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

      if (error) throw error;
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
      const msg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error) ? String((error as Record<string, unknown>).message) : String(error);
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
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-stats"] });
      toast({ title: "Produit supprimé" });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error) ? String((error as Record<string, unknown>).message) : String(error);
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
      reportError(error instanceof Error ? error : new Error(String(error)));
    },
  });

  const handleSubmit = (productData: Omit<ProductInsert, "user_id">) => {
    if (selectedProduct) {
      updateProductMutation.mutate({ id: selectedProduct.id, ...productData });
    } else {
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
      if (profile?.organization_id) {
        filters.push({ column: "organization_id", operator: "eq", value: profile.organization_id });
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
            price: p.price,
            cost_price: p.cost_price,
            stock_quantity: p.stock_quantity,
            min_stock_alert: p.min_stock_alert,
            unit: p.unit,
            is_active: p.is_active,
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
  }, [currency, toast, profile?.organization_id]);

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
          <div className="flex gap-2">
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

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un produit..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
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
          onConfirm={(data) => stockAdjustMutation.mutate(data)}
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
