import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ProductList } from "@/components/products/ProductList";
import { ProductForm } from "@/components/products/ProductForm";
import { StockAdjustDialog } from "@/components/products/StockAdjustDialog";
import { StockMovementHistory } from "@/components/products/StockMovementHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Package, Download, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Database } from "@/integrations/supabase/types";
import { exportProductsToCSV } from "@/utils/exportUtils";
import { ProductWithCategory } from "@/types";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductWithCat = ProductWithCategory;

const Products = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Stock adjust state
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [isStockAdjustOpen, setIsStockAdjustOpen] = useState(false);

  // Stock history state
  const [stockHistoryProduct, setStockHistoryProduct] = useState<Product | null>(null);
  const [isStockHistoryOpen, setIsStockHistoryOpen] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name, color, icon)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: categories } = useQuery({
    queryKey: ["categories", "products-page"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createProductMutation = useMutation({
    mutationFn: async (product: Omit<ProductInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("products")
        .insert({ ...product, user_id: user!.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Produit créé avec succès" });
      setIsFormOpen(false);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de créer le produit",
      });
      reportError(error instanceof Error ? error : new Error(String(error)));
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, ...product }: Partial<Product> & { id: string }) => {
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
      toast({ title: "Produit mis à jour" });
      setIsFormOpen(false);
      setSelectedProduct(null);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de modifier le produit",
      });
      reportError(error instanceof Error ? error : new Error(String(error)));
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Produit supprimé" });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer le produit",
      });
      reportError(error instanceof Error ? error : new Error(String(error)));
    },
  });

  // Stock adjustment mutation
  const stockAdjustMutation = useMutation({
    mutationFn: async (data: {
      productId: string;
      type: "restock" | "adjustment" | "loss";
      quantity: number;
      reason: string;
      previousQuantity: number;
    }) => {
      // Calculate new quantity
      let newQuantity: number;
      if (data.type === "restock") {
        newQuantity = data.previousQuantity + data.quantity;
      } else if (data.type === "loss") {
        newQuantity = Math.max(0, data.previousQuantity - data.quantity);
      } else {
        newQuantity = data.quantity; // adjustment = absolute
      }

      // Update product stock
      const { error: updateError } = await supabase
        .from("products")
        .update({
          stock_quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.productId);

      if (updateError) throw updateError;

      // Record stock movement
      const movementQuantity =
        data.type === "restock"
          ? data.quantity
          : data.type === "loss"
          ? -data.quantity
          : newQuantity - data.previousQuantity;

      const { error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: data.productId,
          type: data.type,
          quantity: movementQuantity,
          previous_quantity: data.previousQuantity,
          new_quantity: newQuantity,
          reason: data.reason || null,
          user_id: user!.id,
        });

      if (movementError) throw movementError;

      return { newQuantity };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
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
    deleteProductMutation.mutate(id);
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

  const filteredProducts = products?.filter((product) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      product.name.toLowerCase().includes(q) ||
      (product.barcode &&
        product.barcode.toLowerCase().includes(q));
    const matchesCategory =
      !selectedCategory || product.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Stats
  const totalProducts = products?.length || 0;
  const lowStockCount = products?.filter(
    (p) => p.min_stock_alert && p.stock_quantity <= p.min_stock_alert
  ).length || 0;
  const outOfStockCount = products?.filter((p) => p.stock_quantity === 0).length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              Produits
            </h1>
            <p className="text-muted-foreground mt-1">
              Gérez votre inventaire de produits
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (products && products.length > 0) {
                  exportProductsToCSV(
                    (products as ProductWithCat[]).map((p) => ({
                      name: p.name,
                      category: p.categories?.name || "",
                      price: p.price,
                      cost_price: p.cost_price,
                      stock_quantity: p.stock_quantity,
                      min_stock_alert: p.min_stock_alert,
                      unit: p.unit,
                      is_active: p.is_active,
                    }))
                  );
                  toast({
                    title: "Export réussi",
                    description: `${products.length} produits exportés`,
                  });
                } else {
                  toast({
                    variant: "destructive",
                    title: "Aucun produit",
                    description: "Pas de produits à exporter",
                  });
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Exporter
            </Button>
            <Button onClick={handleOpenForm} className="gap-2">
              <Plus className="h-4 w-4" />
              Ajouter un produit
            </Button>
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
              Toutes ({products?.length || 0})
            </Button>
            {categories.map((category) => {
              const count = products?.filter((p) => p.category_id === category.id).length || 0;
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
                  {category.icon} {category.name} ({count})
                </Button>
              );
            })}
          </div>
        )}

        {/* Products List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredProducts && filteredProducts.length > 0 ? (
          <ProductList
            products={filteredProducts}
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
            <Button onClick={handleOpenForm} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un produit
            </Button>
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
      </div>
    </DashboardLayout>
  );
};

export default Products;
