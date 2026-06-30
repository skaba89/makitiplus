import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePOSCartStore, useCartTotal } from "@/contexts/POSCartContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { POSProductGrid } from "@/components/pos/POSProductGrid";
import { POSCart } from "@/components/pos/POSCart";
import { POSPaymentDialog } from "@/components/pos/POSPaymentDialog";
import { ReceiptActionsDialog } from "@/components/pos/ReceiptActionsDialog";
import { BarcodeScannerDialog } from "@/components/pos/BarcodeScannerDialog";
import { ProductAutocomplete } from "@/components/pos/ProductAutocomplete";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { useOrgTaxRate } from "@/hooks/useOrgTaxRate";
import { computeTax } from "@/lib/taxUtils";
import { Search, ShoppingCart, Camera } from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Database } from "@/integrations/supabase/types";
import { ReceiptData } from "@/utils/receiptGenerator";
import { useBranding } from "@/contexts/BrandingContext";
import { useThemeSettings } from "@/contexts/ThemeContext";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

const POS = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { currency, formatPrice } = useCurrency();
  const orgTaxRate = useOrgTaxRate();
  const { branding } = useBranding();
  const { settings } = useThemeSettings();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const cart = usePOSCartStore((s) => s.items);
  const { addToCart: addToCartStore, updateQuantity, removeItem, clearCart } = usePOSCartStore();
  const cartTotal = useCartTotal();
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastReceiptData, setLastReceiptData] = useState<ReceiptData | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showOutOfStock, setShowOutOfStock] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", "pos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name, color, icon)")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data as Product[];
    },
    enabled: !!user,
  });

  const { data: categories } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*");

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createSaleMutation = useMutation({
    mutationFn: async ({
      paymentMethod,
      amountPaid,
      customerName,
      customerPhone,
    }: {
      paymentMethod: PaymentMethod;
      amountPaid: number;
      customerName?: string;
      customerPhone?: string;
    }) => {
      // Get sale number (fallback to timestamp+uuid if RPC not available)
      let finalSaleNumber = '';
      try {
        const { data: saleNumber, error: rpcError } = await supabase.rpc("generate_sale_number");
        if (rpcError) {
          console.warn("[POS] generate_sale_number RPC failed, using fallback:", rpcError.message);
        }
        finalSaleNumber = saleNumber || '';
      } catch {
        console.warn("[POS] generate_sale_number RPC exception, using fallback");
      }
      // Fallback: use crypto.randomUUID fragment — no collision risk across terminals
      if (!finalSaleNumber) {
        const uid = crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase();
        finalSaleNumber = `VTE-${uid}`;
      }

      const subtotal = cart.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
      );
      const taxAmount = cart.reduce((sum, item) => {
        const t = computeTax(item.product.price, item.product.tax_rate, orgTaxRate);
        return sum + t.taxAmount * item.quantity;
      }, 0);
      // Prices are TTC (tax-inclusive): subtotal already includes tax
      // totalAmount = subtotal (what customer pays)
      // For DB: store subtotal as TTC total, taxAmount as the tax portion
      const totalAmount = subtotal;
      const htAmount = subtotal - taxAmount;
      const changeAmount = amountPaid - totalAmount;

      // Try atomic sale creation via RPC first (C4: single transaction)
      const saleItems = cart.map((item) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        total_price: item.product.price * item.quantity,
      }));

      const orgId = profile?.organization_id || null;
      let sale: { id: string; sale_number: string; payment_method: string; amount_paid: number; customer_name: string | null; customer_phone: string | null } | null = null;
      let usedAtomicRPC = false;

      try {
        const { data: rpcSaleId, error: rpcError } = await supabase.rpc("create_full_sale", {
          p_user_id: user!.id,
          p_organization_id: orgId,
          p_sale_number: finalSaleNumber,
          p_subtotal: htAmount,
          p_tax_amount: taxAmount,
          p_total_amount: totalAmount,
          p_payment_method: paymentMethod,
          p_amount_paid: amountPaid,
          p_change_amount: changeAmount > 0 ? changeAmount : 0,
          p_customer_name: customerName || null,
          p_customer_phone: customerPhone || null,
          p_seller_name: profile?.owner_name || null,
          p_items: saleItems,
        });

        if (!rpcError && rpcSaleId) {
          // Atomic RPC succeeded — fetch the sale record for receipt
          const { data: saleRow } = await supabase
            .from("sales")
            .select("id, sale_number, payment_method, amount_paid, customer_name, customer_phone")
            .eq("id", rpcSaleId)
            .single();
          sale = saleRow;
          usedAtomicRPC = true;
        } else if (rpcError) {
          console.warn("[POS] create_full_sale RPC failed, falling back:", rpcError.message);
        }
      } catch {
        console.warn("[POS] create_full_sale RPC exception, falling back");
      }

      // Fallback: non-atomic path (for older DB without the RPC)
      if (!usedAtomicRPC || !sale) {
        const saleInsert: Record<string, unknown> = {
          user_id: user!.id,
          sale_number: finalSaleNumber,
          subtotal: htAmount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          amount_paid: amountPaid,
          change_amount: changeAmount > 0 ? changeAmount : 0,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          seller_name: profile?.owner_name || null,
        };
        if (orgId) saleInsert.organization_id = orgId;

        const { data: fallbackSale, error: saleError } = await supabase
          .from("sales")
          .insert(saleInsert)
          .select()
          .single();

        if (saleError) throw saleError;
        sale = fallbackSale;

        // Insert sale items
        const insertItems = saleItems.map((item) => ({
          ...item,
          sale_id: sale!.id,
          organization_id: orgId,
        }));
        const { error: itemsError } = await supabase
          .from("sale_items")
          .insert(insertItems);
        if (itemsError) throw itemsError;

        // Update stock — use batch_update_stock RPC, then relative fallback
        const stockItems = cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          previous_quantity: item.product.stock_quantity,
        }));

        const { error: stockError } = await supabase.rpc("batch_update_stock", {
          p_sale_id: sale.id,
          p_items: stockItems,
        });

        if (stockError) {
          console.warn("[POS] batch_update_stock RPC failed, using relative updates:", stockError.message);
          // Relative atomic update: stock_quantity = GREATEST(stock_quantity - X, 0)
          // This avoids the SELECT-then-UPDATE race condition (C5)
          for (const item of cart) {
            await supabase.rpc('decrement_stock', {
              p_product_id: item.product.id,
              p_quantity: item.quantity,
            }).catch(async () => {
              // Final fallback: just do the relative update via raw SQL-like approach
              // Since we can't use raw SQL client-side, use the old approach as last resort
              const { data: currentProduct } = await supabase
                .from("products")
                .select("stock_quantity")
                .eq("id", item.product.id)
                .single();
              const currentStock = currentProduct?.stock_quantity ?? 0;
              await supabase
                .from("products")
                .update({ stock_quantity: Math.max(0, currentStock - item.quantity), updated_at: new Date().toISOString() })
                .eq("id", item.product.id);
            });
          }
        }
      }

      // If credit sale, create a customer_credits entry for debt tracking
      if (paymentMethod === "credit" && totalAmount > 0) {
        let customerId: string | null = null;

        // Try to find existing customer by phone (if provided)
        if (customerPhone) {
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id")
            .eq("phone", customerPhone)
            .maybeSingle();

          if (existingCustomer) {
            customerId = existingCustomer.id;
          } else {
            // Auto-create customer if phone is provided but no record exists
            const newCustomer: Record<string, unknown> = {
              name: customerName || customerPhone,
              phone: customerPhone,
            };
            if (profile?.organization_id) {
              newCustomer.organization_id = profile.organization_id;
            }
            const { data: created, error: custErr } = await supabase
              .from("customers")
              .insert(newCustomer)
              .select("id")
              .single();
            if (!custErr && created) {
              customerId = created.id;
            }
          }
        } else if (customerName) {
          // No phone but name provided — try to find by name
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id")
            .eq("name", customerName)
            .maybeSingle();
          if (existingCustomer) {
            customerId = existingCustomer.id;
          }
        }

        if (customerId) {
          const creditInsert: Record<string, unknown> = {
            user_id: user!.id,
            customer_id: customerId,
            sale_id: sale.id,
            amount: totalAmount,
            type: "credit",
            description: `Vente crédit ${finalSaleNumber}`,
          };
          if (profile?.organization_id) {
            creditInsert.organization_id = profile.organization_id;
          }
          await supabase.from("customer_credits").insert(creditInsert);

          // Update customer total_credit atomically
          await supabase.rpc("increment_customer_credit", {
            p_customer_id: customerId,
            p_amount: totalAmount,
          }).catch(async () => {
            // Fallback: relative update
            const { data: cust } = await supabase
              .from("customers")
              .select("total_credit")
              .eq("id", customerId)
              .single();
            await supabase
              .from("customers")
              .update({ total_credit: (Number(cust?.total_credit || 0) + totalAmount) })
              .eq("id", customerId);
          });
        }
      }

      return { sale, changeAmount };
    },
    onSuccess: ({ sale, changeAmount }) => {
      // Compute tax for receipt display
      const receiptTaxAmount = cart.reduce((sum, item) => {
        const t = computeTax(item.product.price, item.product.tax_rate, orgTaxRate);
        return sum + t.taxAmount * item.quantity;
      }, 0);
      const receiptSubtotal = cartTotal - receiptTaxAmount;

      // Prepare receipt data for dialog
      const receiptData: ReceiptData = {
        saleNumber: sale.sale_number,
        date: new Date(),
        items: cart.map((item) => ({
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.product.price,
          total_price: item.product.price * item.quantity,
        })),
        subtotal: receiptSubtotal,
        total: cartTotal,
        paymentMethod: sale.payment_method,
        amountPaid: sale.amount_paid,
        change: changeAmount > 0 ? changeAmount : 0,
        customerName: sale.customer_name || undefined,
        customerPhone: sale.customer_phone || undefined,
        businessName: profile?.business_name || "Ma Boutique",
        businessAddress: profile?.address || undefined,
        businessPhone: profile?.phone || undefined,
        sellerName: profile?.owner_name || undefined,
        currencySymbol: currency.displaySymbol || currency.symbol,
        currencyPosition: currency.position,
        logoUrl: settings?.logo_url || branding.logoUrl,
        template: branding.receiptTemplate,
        paperSize: (settings?.extra_settings as Record<string, string>)?.receiptPaperSize as ReceiptData["paperSize"] || "80mm",
        showLogo: settings?.receipt_show_logo ?? true,
        showTax: settings?.receipt_show_tax ?? true,
        footerText: settings?.receipt_footer || undefined,
        organizationId: profile?.organization_id,
        taxRate: orgTaxRate,
      };

      setLastReceiptData(receiptData);
      setIsReceiptOpen(true);

      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      clearCart();
      setIsPaymentOpen(false);
    },
    onError: (error: unknown) => {
      // Supabase errors are plain objects, not Error instances
      let message = "Impossible d'enregistrer la vente";
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'object' && error !== null) {
        const err = error as Record<string, unknown>;
        if (typeof err.message === 'string') {
          message = err.message;
        } else if (typeof err.details === 'string') {
          message = err.details;
        } else if (typeof err.code === 'string') {
          message = `Erreur ${err.code}: veuillez réessayer`;
        } else {
          try {
            message = JSON.stringify(error);
          } catch {
            message = String(error);
          }
        }
      } else {
        message = String(error);
      }
      toast({
        variant: "destructive",
        title: "Erreur de vente",
        description: message,
      });
      reportError(error instanceof Error ? error : new Error(message));
    },
  });

  const addToCart = useCallback((product: Product, addQty: number = 1) => {
    const existing = cart.find((item) => item.product.id === product.id);
    const currentQty = existing?.quantity || 0;
    const targetQty = currentQty + addQty;

    if (targetQty > product.stock_quantity) {
      toast({
        variant: "destructive",
        title: "Stock insuffisant",
        description: `Seulement ${product.stock_quantity} ${product.unit || "unité(s)"} disponible(s)`,
      });
      return;
    }
    addToCartStore(product, addQty);
  }, [cart, toast, addToCartStore]);

  const updateCartQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    const item = cart.find((i) => i.product.id === productId);
    if (item && quantity > item.product.stock_quantity) {
      toast({
        variant: "destructive",
        title: "Stock insuffisant",
        description: `Seulement ${item.product.stock_quantity} disponible(s)`,
      });
      return;
    }
    updateQuantity(productId, quantity);
  }, [cart, toast, updateQuantity, removeItem]);

  const removeFromCart = useCallback((productId: string) => {
    removeItem(productId);
  }, [removeItem]);

  const handleBarcodeScan = (barcode: string) => {
    // Find product by barcode and add to cart
    const found = products?.find((p) => p.barcode === barcode);
    if (found) {
      addToCart(found);
    } else {
      setSearchQuery(barcode);
      toast({
        variant: "destructive",
        title: "Produit non trouvé",
        description: `Aucun produit avec le code-barres: ${barcode}`,
      });
    }
  };

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredProducts = products?.filter((product) => {
    const matchesSearch =
      !searchQuery ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.barcode && product.barcode.includes(searchQuery));
    const matchesStock = showOutOfStock || product.stock_quantity > 0;
    return matchesSearch && matchesStock;
  });

  const displayedProducts = selectedCategory
    ? filteredProducts?.filter((p) => p.category_id === selectedCategory)
    : filteredProducts;

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-6rem)] lg:h-[calc(100vh-2rem)] flex flex-col lg:flex-row gap-4">
        {/* Products Section */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search and Categories */}
          <div className="space-y-4 mb-4">
            <div className="flex gap-2">
              <ProductAutocomplete
                products={products || []}
                onSelect={(p, qty) => {
                  if (p.stock_quantity === 0) {
                    toast({
                      variant: "destructive",
                      title: "Rupture de stock",
                      description: `${p.name} n'est pas disponible`,
                    });
                    return;
                  }
                  addToCart(p, qty);
                }}
                placeholder="Rechercher un produit (nom ou code-barres)..."
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsScannerOpen(true)}
                title="Scanner un code-barres"
                aria-label="Scanner un code-barres"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {displayedProducts?.length || 0} produit(s) affiché(s)
                {products && ` sur ${products.length}`}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="show-out-of-stock"
                  checked={showOutOfStock}
                  onCheckedChange={setShowOutOfStock}
                />
                <Label htmlFor="show-out-of-stock" className="text-xs cursor-pointer">
                  Afficher les ruptures
                </Label>
              </div>
            </div>
            
            {/* Category Filters */}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                Tous
              </Button>
              {categories?.map((category) => (
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
                  <CategoryIcon iconName={category.icon} className="h-3.5 w-3.5" /> {category.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : displayedProducts && displayedProducts.length > 0 ? (
              <POSProductGrid products={displayedProducts} onAddToCart={addToCart} />
            ) : (
              <div className="text-center py-12">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Aucun produit trouvé</p>
              </div>
            )}
          </div>
        </div>

        {/* Cart Section — hidden on mobile, visible on lg+ */}
        <div className="hidden lg:block w-96 flex-shrink-0">
          <POSCart
            items={cart}
            total={cartTotal}
            onUpdateQuantity={updateCartQuantity}
            onRemove={removeFromCart}
            onClear={clearCart}
            onCheckout={() => setIsPaymentOpen(true)}
          />
        </div>

        {/* Mobile floating cart button */}
        {itemCount > 0 && (
          <div className="lg:hidden fixed bottom-20 right-4 z-40">
            <Button
              size="lg"
              className="rounded-full shadow-lg h-14 w-14 relative"
              onClick={() => setIsPaymentOpen(true)}
              aria-label="Voir le panier"
            >
              <ShoppingCart className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {itemCount}
              </span>
            </Button>
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 whitespace-nowrap bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-md shadow">
              {formatPrice(cartTotal)}
            </div>
          </div>
        )}

        {/* Payment Dialog */}
        <POSPaymentDialog
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          total={cartTotal}
          onConfirm={(paymentMethod, amountPaid, customerName, customerPhone) =>
            createSaleMutation.mutate({
              paymentMethod,
              amountPaid,
              customerName,
              customerPhone,
            })
          }
          isLoading={createSaleMutation.isPending}
        />

        {/* Receipt Actions Dialog */}
        <ReceiptActionsDialog
          isOpen={isReceiptOpen}
          onClose={() => setIsReceiptOpen(false)}
          receiptData={lastReceiptData}
        />

        {/* Barcode Scanner Dialog */}
        <BarcodeScannerDialog
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={handleBarcodeScan}
        />
      </div>
    </DashboardLayout>
  );
};

export default POS;
