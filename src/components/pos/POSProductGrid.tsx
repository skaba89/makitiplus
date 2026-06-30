import { memo } from "react";
import { Database } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Loader2 } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

interface POSProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  totalCount?: number;
}

export const POSProductGrid = memo(({ products, onAddToCart, hasMore, isLoadingMore, onLoadMore, totalCount }: POSProductGridProps) => {
  const { formatPrice } = useCurrency();

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
        {products.map((product) => (
          <Card
            key={product.id}
            role="button"
            tabIndex={product.stock_quantity > 0 ? 0 : -1}
            aria-label={`${product.name} — ${formatPrice(product.price)}${product.stock_quantity === 0 ? ' — Rupture' : ''}`}
            className={`card-elevated cursor-pointer hover:shadow-medium transition-all active:scale-95 overflow-hidden ${product.stock_quantity === 0 ? 'opacity-50 pointer-events-none' : ''}`}
            onClick={() => product.stock_quantity > 0 && onAddToCart(product)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && product.stock_quantity > 0) {
                e.preventDefault();
                onAddToCart(product);
              }
            }}
          >
            <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            <CardContent className="p-2 sm:p-3">
              <h3 className="font-medium text-xs sm:text-sm line-clamp-1 mb-0.5 sm:mb-1">{product.name}</h3>
              <div className="flex items-center justify-between">
                <span className="text-primary font-bold text-xs sm:text-sm">
                  {formatPrice(product.price)}
                </span>
                <span className={`text-[10px] sm:text-xs ${product.stock_quantity === 0 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                  {product.stock_quantity === 0 ? 'Rupture' : `x${product.stock_quantity}`}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {hasMore && onLoadMore && (
        <div className="flex justify-center mt-4">
          <Button
            variant="outline"
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
