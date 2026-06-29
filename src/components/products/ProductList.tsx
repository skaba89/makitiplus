import { useState, memo } from "react";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, AlertTriangle, Printer, Warehouse, History, Package} from "lucide-react";
import { BarcodeLabelPrinter } from "./BarcodeLabelPrinter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCurrency } from "@/hooks/useCurrency";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

interface ProductListProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onStockAdjust: (product: Product) => void;
  onStockHistory: (product: Product) => void;
}

export const ProductList = memo(({ products, onEdit, onDelete, onStockAdjust, onStockHistory }: ProductListProps) => {
  const { formatPrice } = useCurrency();
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((product) => {
        const isLowStock =
          product.min_stock_alert && product.stock_quantity <= product.min_stock_alert;
        const isOutOfStock = product.stock_quantity === 0;

        return (
          <Card key={product.id} className="card-elevated overflow-hidden">
            <div className="aspect-square bg-muted flex items-center justify-center relative">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="h-16 w-16 text-muted-foreground" />
              )}
              {/* Stock badge overlay */}
              <div className="absolute top-2 right-2">
                {isOutOfStock ? (
                  <Badge variant="destructive" className="text-xs">
                    Rupture
                  </Badge>
                ) : isLowStock ? (
                  <Badge className="bg-yellow-500 text-white text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Bas
                  </Badge>
                ) : null}
              </div>
            </div>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-foreground line-clamp-1">
                  {product.name}
                </h3>
              </div>

              {product.categories && (
                <Badge
                  variant="secondary"
                  className="mb-2"
                  style={{
                    backgroundColor: product.categories.color || undefined,
                    color: product.categories.color ? "#fff" : undefined,
                  }}
                >
                  {product.categories.icon} {product.categories.name}
                </Badge>
              )}

              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-bold text-primary">
                  {formatPrice(product.price)}
                </span>
                <span
                  className={`text-sm ${
                    isOutOfStock
                      ? "text-destructive font-bold"
                      : isLowStock
                      ? "text-warning font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  Stock: {product.stock_quantity} {product.unit || "unité(s)"}
                </span>
              </div>

              {/* Stock management buttons */}
              <div className="flex gap-1.5 mb-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => onStockAdjust(product)}
                >
                  <Warehouse className="h-3.5 w-3.5" />
                  Stock
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => onStockHistory(product)}
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Edit / Delete buttons */}
              <div className="flex gap-2">
                {product.barcode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLabelProduct(product)}
                    aria-label="Imprimer l'étiquette"
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onEdit(product)}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Modifier
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive" aria-label="Supprimer le produit">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irréversible. Le produit "{product.name}" sera
                        définitivement supprimé.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(product.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Barcode Label Printer */}
      {labelProduct && (
        <BarcodeLabelPrinter
          product={labelProduct}
          isOpen={!!labelProduct}
          onClose={() => setLabelProduct(null)}
        />
      )}
    </div>
  );
});
