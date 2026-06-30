import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Package, Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database } from "@/integrations/supabase/types";
import { useCurrency } from "@/hooks/useCurrency";
import { useOrgTaxRate } from "@/hooks/useOrgTaxRate";
import { computeTax } from "@/lib/taxUtils";
import { cn } from "@/lib/utils";
import { useProductSearch, lookupBarcode } from "@/hooks/useProductSearch";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
  tax_rate?: number | null;
};

interface ProductAutocompleteProps {
  /** No longer needs products prop — uses server-side search */
  products?: never;
  onSelect: (product: Product, quantity: number) => void;
  placeholder?: string;
  /** External ref to allow parent to focus the input (keyboard shortcut) */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

/** Debounce delay in ms for server-side search */
const DEBOUNCE_MS = 200;

export const ProductAutocomplete = ({
  onSelect,
  placeholder = "Rechercher par nom ou code-barres...",
  inputRef,
}: ProductAutocompleteProps) => {
  const { formatPrice } = useCurrency();
  const orgTaxRate = useOrgTaxRate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce the search query before hitting the server
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  // Server-side search
  const { data: matches = [], isLoading: isSearching } = useProductSearch(debouncedQuery, 8);

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
  }, [debouncedQuery]);

  const getQty = (id: string) => quantities[id] || 1;
  const setQty = (id: string, q: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.max(1, q) }));

  const handleAdd = (product: Product, closeAfter = true) => {
    if (product.stock_quantity === 0) return;
    const qty = getQty(product.id);
    if (qty > product.stock_quantity) return;
    onSelect(product, qty);
    setQuantities((prev) => ({ ...prev, [product.id]: 1 }));
    if (closeAfter) {
      setQuery("");
      setDebouncedQuery("");
      setOpen(false);
    }
  };

  const handleKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    if (!open || matches.length === 0) {
      // Exact barcode match on Enter — server-side lookup
      if (e.key === "Enter" && query.trim()) {
        e.preventDefault();
        try {
          const found = await lookupBarcode(query.trim());
          if (found && found.stock_quantity > 0) {
            handleAdd(found as Product, true);
          }
        } catch {
          // Barcode not found — silently ignore
        }
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
      handleAdd(matches[highlight] as Product, true);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }, [open, matches, highlight, query, handleAdd]);

  return (
    <div ref={containerRef} className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef as React.LegacyRef<HTMLInputElement>}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        aria-label="Rechercher un produit"
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
        <div role="listbox" className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-dropdown sm:max-h-dropdown overflow-y-auto">
          {isSearching && debouncedQuery ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Recherche...
            </div>
          ) : matches.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Aucun produit trouvé
            </div>
          ) : (
            matches.map((product, idx) => {
              const tax = computeTax(
                Number(product.price),
                product.tax_rate,
                orgTaxRate
              );
              const qty = getQty(product.id);
              const isOOS = product.stock_quantity === 0;

              return (
                <div
                  key={product.id}
                  role="option"
                  aria-selected={idx === highlight}
                  onMouseEnter={() => setHighlight(idx)}
                  className={cn(
                    "px-3 py-2 border-b last:border-0 transition-colors",
                    idx === highlight ? "bg-accent" : "hover:bg-accent/50"
                  )}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs sm:text-sm truncate flex items-center gap-1 sm:gap-2">
                        {product.name}
                        {isOOS && (
                          <Badge variant="destructive" className="text-micro h-4">
                            Rupture
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 sm:gap-2 flex-wrap">
                        {product.barcode && <span>#{product.barcode}</span>}
                        <span>Stock: {product.stock_quantity}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <div className="text-sm font-bold text-primary">
                        {formatPrice(tax.ttc)}
                      </div>
                      {tax.rate > 0 ? (
                        <div className="text-micro text-muted-foreground leading-tight">
                          HT: {formatPrice(tax.ht)}
                          <br />
                          TVA {tax.rate}%: {formatPrice(tax.taxAmount)}
                        </div>
                      ) : (
                        <div className="text-micro text-muted-foreground">
                          Sans taxe
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 sm:hidden">
                      <div className="text-xs font-bold text-primary">
                        {formatPrice(tax.ttc)}
                      </div>
                    </div>
                  </div>

                  {/* Quantity + Add controls */}
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={isOOS}
                        onClick={() => setQty(product.id, qty - 1)}
                        aria-label="Diminuer la quantité"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={product.stock_quantity || undefined}
                        value={qty}
                        disabled={isOOS}
                        onChange={(e) => setQty(product.id, parseInt(e.target.value) || 1)}
                        className="h-7 w-12 sm:w-14 text-center text-sm px-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={isOOS || qty >= product.stock_quantity}
                        onClick={() => setQty(product.id, qty + 1)}
                        aria-label="Augmenter la quantité"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="text-[10px] sm:text-xs text-muted-foreground ml-1 sm:ml-2">
                        {formatPrice(tax.ttc * qty)}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0 sm:px-2"
                        disabled={isOOS}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdd(product as Product, false);
                        }}
                        title="Ajouter sans fermer"
                        aria-label="Ajouter sans fermer"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 sm:px-3"
                        disabled={isOOS}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdd(product as Product, true);
                        }}
                      >
                        <Plus className="h-3 w-3 hidden sm:inline" />
                        <span className="sm:hidden">OK</span>
                        <span className="hidden sm:inline">Ajouter</span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
