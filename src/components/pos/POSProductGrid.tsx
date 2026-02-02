import { Database } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

interface POSProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

export const POSProductGrid = ({ products, onAddToCart }: POSProductGridProps) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("fr-FR").format(price);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {products.map((product) => (
        <Card
          key={product.id}
          className="card-elevated cursor-pointer hover:shadow-medium transition-all active:scale-95 overflow-hidden"
          onClick={() => onAddToCart(product)}
        >
          <div className="aspect-square bg-muted flex items-center justify-center">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-4xl">{product.categories?.icon || "📦"}</span>
            )}
          </div>
          <CardContent className="p-3">
            <h3 className="font-medium text-sm line-clamp-1 mb-1">{product.name}</h3>
            <div className="flex items-center justify-between">
              <span className="text-primary font-bold text-sm">
                {formatPrice(product.price)}
              </span>
              <span className="text-xs text-muted-foreground">
                x{product.stock_quantity}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
