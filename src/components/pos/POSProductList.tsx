import { memo, useState } from "react";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Minus, Loader2 } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

interface POSProductListProps {
  products: Product[];
  onAddToCart: (product: Product, qty?: number) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  totalCount?: number;
}

export const POSProductList = memo(({ products, onAddToCart, hasMore, isLoadingMore, onLoadMore, totalCount }: POSProductListProps) => {
  const { formatPrice } = useCurrency();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const getQty = (productId: string) => quantities[productId] || 1;

  const setQty = (productId: string, qty: number) => {
    if (qty < 1) return;
    const product = products.find((p) => p.id === productId);
    if (product && qty > product.stock_quantity) return;
    setQuantities((prev) => ({ ...prev, [productId]: qty }));
  };

  const handleAdd = (product: Product) => {
    const qty = getQty(product.id);
    onAddToCart(product, qty);
    setQuantities((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
  };

  return (
    <div>
      {/* Table header */}
      <div className="hidden md:grid md:grid-cols-[1fr_90px_80px_60px_120px] lg:grid-cols-[1fr_100px_100px_60px_130px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30 rounded-t-lg">
        <span>Produit</span>
        <span className="text-right">Prix</span>
        <span className="text-right">Stock</span>
        <span className="text-center">Qté</span>
        <span className="text-center">Action</span>
      </div>

      {/* Product rows */}
      <div className="divide-y">
        {products.map((product) => {
          const outOfStock = product.stock_quantity === 0;
          const qty = getQty(product.id);

          return (
            <div
              key={product.id}
              className={`grid grid-cols-[1fr_auto] md:grid-cols-[1fr_90px_80px_60px_120px] lg:grid-cols-[1fr_100px_100px_60px_130px] gap-2 items-center px-2 sm:px-3 py-2 sm:py-2.5 hover:bg-muted/30 transition-colors ${
                outOfStock ? "opacity-50" : ""
              }`}
            >
              {/* Product info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  {product.categories && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                      {product.categories.name}
                    </p>
                  )}
                </div>
              </div>

              {/* Price — visible on md+ */}
              <div className="hidden md:block text-right">
                <span className="font-bold text-sm text-primary">
                  {formatPrice(product.price)}
                </span>
                {product.unit && (
                  <span className="text-xs text-muted-foreground">/{product.unit}</span>
                )}
              </div>

              {/* Stock — visible on md+ */}
              <div className="hidden md:block text-right">
                {outOfStock ? (
                  <Badge variant="destructive" className="text-micro px-1.5 py-0">
                    Rupture
                  </Badge>
                ) : product.stock_quantity <= 5 ? (
                  <Badge variant="outline" className="text-micro px-1.5 py-0 border-warning text-warning" aria-label={`Stock bas : ${product.stock_quantity} restants`}>
                    x{product.stock_quantity}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    x{product.stock_quantity}
                  </span>
                )}
              </div>

              {/* Quantity selector — visible on md+ */}
              <div className="hidden md:flex md:justify-center">
                {!outOfStock && (
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setQty(product.id, qty - 1)}
                      disabled={qty <= 1}
                      aria-label={`Diminuer quantité ${product.name}`}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={product.stock_quantity}
                      value={qty}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v >= 1 && v <= product.stock_quantity) {
                          setQty(product.id, v);
                        }
                      }}
                      className="h-6 w-10 text-center text-xs p-0 border-0"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setQty(product.id, qty + 1)}
                      disabled={qty >= product.stock_quantity}
                      aria-label={`Augmenter quantité ${product.name}`}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Add button — visible on md+ */}
              <div className="hidden md:flex md:justify-center">
                <Button
                  size="sm"
                  disabled={outOfStock}
                  onClick={() => handleAdd(product)}
                  className="h-7 gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter
                </Button>
              </div>

              {/* Mobile: price + stock + add button compact */}
              <div className="flex md:hidden items-center gap-2">
                <div className="text-right">
                  <span className="font-bold text-sm text-primary">
                    {formatPrice(product.price)}
                  </span>
                  {!outOfStock && (
                    <span className="text-xs text-muted-foreground ml-1">
                      x{product.stock_quantity}
                    </span>
                  )}
                  {outOfStock && (
                    <Badge variant="destructive" className="text-[9px] px-1 py-0 ml-1">
                      Rupture
                    </Badge>
                  )}
                </div>
                {!outOfStock && (
                  <Button
                    size="sm"
                    onClick={() => handleAdd(product)}
                    className="h-7 w-7 p-0"
                    aria-label={`Ajouter ${product.name}`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more — server-side pagination */}
      {hasMore && onLoadMore && (
        <div className="flex justify-center mt-4 pb-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Chargement...
              </>
            ) : (
              <>Charger plus{(totalCount ? ` (${totalCount - products.length} restant${totalCount - products.length > 1 ? 's' : ''})` : '')}</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
});
