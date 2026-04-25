import { useState, useRef, useEffect } from "react";
import { Search, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Database } from "@/integrations/supabase/types";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

interface ProductAutocompleteProps {
  products: Product[];
  onSelect: (product: Product) => void;
  placeholder?: string;
}

export const ProductAutocomplete = ({
  products,
  onSelect,
  placeholder = "Rechercher par nom ou code-barres...",
}: ProductAutocompleteProps) => {
  const { formatPrice } = useCurrency();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = query.trim()
    ? products
        .filter((p) => {
          const q = query.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.toLowerCase().includes(q))
          );
        })
        .slice(0, 8)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const handleSelect = (product: Product) => {
    onSelect(product);
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || matches.length === 0) {
      if (e.key === "Enter" && query.trim()) {
        // Try exact barcode match
        const exact = products.find((p) => p.barcode === query.trim());
        if (exact) handleSelect(exact);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="pl-10"
      />
      {open && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-80 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Aucun produit trouvé
            </div>
          ) : (
            matches.map((product, idx) => (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelect(product)}
                onMouseEnter={() => setHighlight(idx)}
                className={cn(
                  "w-full text-left px-3 py-2 flex items-center gap-3 border-b last:border-0 transition-colors",
                  idx === highlight ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl">{product.categories?.icon || "📦"}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{product.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {product.barcode && <span>#{product.barcode}</span>}
                    <span>Stock: {product.stock_quantity}</span>
                  </div>
                </div>
                <div className="text-sm font-bold text-primary flex-shrink-0">
                  {formatPrice(product.price)}
                </div>
                {product.stock_quantity === 0 && (
                  <Package className="h-4 w-4 text-destructive flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
