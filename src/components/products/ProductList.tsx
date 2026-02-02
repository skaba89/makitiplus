import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, AlertTriangle } from "lucide-react";
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

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

interface ProductListProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
}

export const ProductList = ({ products, onEdit, onDelete }: ProductListProps) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("fr-FR").format(price) + " FCFA";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((product) => {
        const isLowStock =
          product.min_stock_alert && product.stock_quantity <= product.min_stock_alert;

        return (
          <Card key={product.id} className="card-elevated overflow-hidden">
            <div className="aspect-square bg-muted flex items-center justify-center">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-6xl">{product.categories?.icon || "📦"}</span>
              )}
            </div>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-foreground line-clamp-1">
                  {product.name}
                </h3>
                {isLowStock && (
                  <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                )}
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
                    isLowStock ? "text-warning font-medium" : "text-muted-foreground"
                  }`}
                >
                  Stock: {product.stock_quantity} {product.unit || "unité(s)"}
                </span>
              </div>

              <div className="flex gap-2">
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
                    <Button variant="outline" size="sm" className="text-destructive">
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
    </div>
  );
};
