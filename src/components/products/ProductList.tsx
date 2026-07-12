import { useState, memo } from "react";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Edit,
  Trash2,
  AlertTriangle,
  Printer,
  Warehouse,
  History,
  Package,
  Calendar,
  EyeOff,
  TrendingUp,
} from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { BarcodeLabelPrinter } from "./BarcodeLabelPrinter";

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

/**
 * Calcule le nombre de jours avant péremption.
 * Retourne null si pas de date de péremption.
 * Retourne un nombre négatif si déjà périmé.
 */
const daysUntilExpiry = (expiryDate: string | null): number | null => {
  if (!expiryDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diffMs = expiry.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

export const ProductList = memo(({ products, onEdit, onDelete, onStockAdjust, onStockHistory }: ProductListProps) => {
  const { formatPrice } = useCurrency();
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {products.map((product) => {
        const isLowStock =
          product.min_stock_alert && product.stock_quantity <= product.min_stock_alert;
        const isOutOfStock = product.stock_quantity === 0;
        const isActive = product.is_active !== false; // null ou true = actif
        const expiryDays = daysUntilExpiry(product.expiry_date);
        const isExpired = expiryDays !== null && expiryDays < 0;
        const isExpiringSoon = expiryDays !== null && expiryDays >= 0 && expiryDays <= 7;
        // Marge brute = prix de vente - coût d'achat (si coût renseigné)
        const costPrice = Number(product.cost_price || 0);
        const margin = costPrice > 0 ? product.price - costPrice : 0;
        const marginPct = costPrice > 0 ? Math.round((margin / product.price) * 100) : 0;

        return (
          <Card
            key={product.id}
            className={`card-elevated overflow-hidden transition-opacity ${
              !isActive ? "opacity-60" : ""
            }`}
          >
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
              {/* Stock + expiry + active badges overlay */}
              <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                {!isActive && (
                  <Badge variant="secondary" className="text-xs bg-gray-500 text-white">
                    <EyeOff className="h-3 w-3 mr-1" />
                    Inactif
                  </Badge>
                )}
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
                {isExpired && (
                  <Badge variant="destructive" className="text-xs">
                    <Calendar className="h-3 w-3 mr-1" />
                    Périmé
                  </Badge>
                )}
                {isExpiringSoon && (
                  <Badge className="bg-orange-500 text-white text-xs">
                    <Calendar className="h-3 w-3 mr-1" />
                    {expiryDays === 0 ? "Auj." : `${expiryDays}j`}
                  </Badge>
                )}
              </div>
            </div>
            <CardContent className="p-3 sm:p-4">
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
                    color: product.categories.color ? "hsl(0 0% 100%)" : undefined,
                  }}
                >
                  <CategoryIcon iconName={product.categories.icon} className="h-3 w-3 mr-1" /> {product.categories.name}
                </Badge>
              )}

              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-base sm:text-lg font-bold text-primary">
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

              {/* Marge + péremption info */}
              <div className="flex flex-wrap items-center gap-1 mb-2 text-xs">
                {costPrice > 0 && (
                  <Badge variant="outline" className="text-xs gap-1" title={`Coût: ${formatPrice(costPrice)}`}>
                    <TrendingUp className="h-3 w-3" />
                    Marge: {formatPrice(margin)} ({marginPct}%)
                  </Badge>
                )}
                {product.expiry_date && !isExpired && !isExpiringSoon && (
                  <Badge variant="outline" className="text-xs gap-1" title={`Péremption: ${product.expiry_date}`}>
                    <Calendar className="h-3 w-3" />
                    {new Date(product.expiry_date).toLocaleDateString("fr-FR")}
                  </Badge>
                )}
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
                  aria-label={`Historique stock ${product.name}`}
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
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => onDelete(product.id)}
                  aria-label="Supprimer le produit"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
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
