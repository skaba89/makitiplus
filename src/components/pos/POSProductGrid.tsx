import { memo, useState } from "react";
import { Database } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

interface POSProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

const PAGE_SIZE = 24;

export const POSProductGrid = memo(({ products, onAddToCart }: POSProductGridProps) => {
  const { formatPrice } = useCurrency();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleProducts = products.slice(0, visibleCount);
  const hasMore = visibleCount < products.length;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {visibleProducts.map((product) => (
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
            <div className="aspect-square bg-muted flex items-center justify-center">
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
            <CardContent className="p-3">
              <h3 className="font-medium text-sm line-clamp-1 mb-1">{product.name}</h3>
              <div className="flex items-center justify-between">
                <span className="text-primary font-bold text-sm">
                  {formatPrice(product.price)}
                </span>
                <span className={`text-xs ${product.stock_quantity === 0 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                  {product.stock_quantity === 0 ? 'Rupture' : `x${product.stock_quantity}`}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center mt-4">
          <Button
            variant="outline"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Charger plus ({products.length - visibleCount} restant{products.length - visibleCount > 1 ? "s" : ""})
          </Button>
        </div>
      )}
    </div>
  );
});
