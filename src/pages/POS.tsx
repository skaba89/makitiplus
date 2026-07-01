import { useState, useCallback, useRef, useEffect, useDeferredValue, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePOSCartStore, useCartTotal } from "@/contexts/POSCartContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { POSProductGrid } from "@/components/pos/POSProductGrid";
import { POSProductList } from "@/components/pos/POSProductList";
import { POSCart } from "@/components/pos/POSCart";
import { MobileCartDrawer } from "@/components/pos/MobileCartDrawer";
import { POSPaymentDialog } from "@/components/pos/POSPaymentDialog";
// Lazy-load: receipt generator functions + qrcode only needed after sale
const ReceiptActionsDialog = lazy(() =>
  import("@/components/pos/ReceiptActionsDialog").then((m) => ({ default: m.ReceiptActionsDialog }))
);
// Lazy-load: html5-qrcode (~100 kB) only needed when scanner opens
const BarcodeScannerDialog = lazy(() =>
  import("@/components/pos/BarcodeScannerDialog").then((m) => ({ default: m.BarcodeScannerDialog }))
);
import { ProductAutocomplete } from "@/components/pos/ProductAutocomplete";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { useOrgTaxRate } from "@/hooks/useOrgTaxRate";
import { computeTax } from "@/lib/taxUtils";
import { ShoppingCart, Camera, LayoutGrid, List, Keyboard } from "lucide-react";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Database } from "@/integrations/supabase/types";
import { ReceiptData } from "@/utils/receiptGenerator";
import { useBranding } from "@/contexts/BrandingContext";
import { useThemeSettings } from "@/contexts/ThemeContext";
import { usePOSKeyboardShortcuts } from "@/hooks/usePOSKeyboardShortcuts";
import { usePOSProducts, ProductWithCategory as POSProduct } from "@/hooks/usePOSProducts";
import { lookupBarcode } from "@/hooks/useProductSearch";
import { useCategories } from "@/hooks/useCategories";
import { POSProductGridSkeleton, POSProductListSkeleton, POSCartSkeleton } from "@/components/pos/POSSkeletons";

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
  const cart = usePOSCartStore((s) => s.items);
  const { addToCart: addToCartStore, updateQuantity, removeItem, clearCart } = usePOSCartStore();
  const cartTotal = useCartTotal();
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastReceiptData, setLastReceiptData] = useState<ReceiptData | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const lastSubmitRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const confirmPaymentRef = useRef<(() => void) | null>(null);

  // Produits du POS — pagination serveur avec filtres (catégorie, stock, recherche)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [gridSearchInput, setGridSearchInput] = useState("");
  const gridSearchQuery = useDeferredValue(gridSearchInput);

  const {
    data: infiniteData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePOSProducts({
    categoryId: selectedCategory,
    showOutOfStock,
    searchQuery: gridSearchQuery || undefined,
    pageSize: viewMode === "grid" ? 24 : 30,
  });

  // Accumuler toutes les pages chargées
  const products = infiniteData?.pages.flatMap((page) => page.data) ?? [];
  const totalProductCount = infiniteData?.pages[0]?.totalCount ?? 0;

  const { data: categories } = useCategories();

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
      if (Date.now() - lastSubmitRef.current < 2000) {
        throw new Error("Vente déjà en cours de traitement");
      }
      lastSubmitRef.current = Date.now();
      // Obtenir le numéro de vente (fallback vers timestamp+uuid si RPC non disponible)
      let finalSaleNumber = '';
      try {
        const { data: saleNumber, error: rpcError } = await supabase.rpc("generate_sale_number");
        if (rpcError) {
          // generate_sale_number RPC indisponible, utilisation du fallback
        }
        finalSaleNumber = saleNumber || '';
      } catch {
        // generate_sale_number RPC indisponible, utilisation du fallback
      }
      // Fallback : utiliser un fragment crypto.randomUUID — pas de risque de collision entre terminaux
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
      // Les prix sont TTC (taxe incluse) : le sous-total inclut déjà la taxe
      // totalMontant = sous-total (ce que le client paie)
      // Pour la DB : stocker le sous-total comme total TTC, montantTaxe comme la part de taxe
      const totalAmount = subtotal;
      const htAmount = subtotal - taxAmount;
      const changeAmount = amountPaid - totalAmount;

      // Essayer d'abord la création atomique de vente via RPC (C4 : transaction unique)
      const saleItems = cart.map((item) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        total_price: item.product.price * item.quantity,
      }));

      const orgId = profile?.organization_id || null;
      let creditUpdateFailed = false;

      // ⚠️ create_full_sale RPC est OBLIGATOIRE — plus de fallback non-atomique.
      // L'ancien chemin (INSERT sale + INSERT items + batch_update_stock) était
      // non-atomique : une panne entre les étapes laissait des données incohérentes.
      const { data: rpcSaleId, error: rpcError } = await supabase.rpc("create_full_sale", {
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

      if (rpcError || !rpcSaleId) {
        throw new Error(
          `Impossible de créer la vente (RPC create_full_sale) : ${rpcError?.message || 'Réponse vide'}. Veuillez réessayer.`
        );
      }

      // Récupérer l'enregistrement de vente pour le ticket
      const { data: sale } = await supabase
        .from("sales")
        .select("id, sale_number, payment_method, amount_paid, customer_name, customer_phone")
        .eq("id", rpcSaleId)
        .single();

      if (!sale) {
        throw new Error('Vente créée mais introuvable. Veuillez réessayer.');
      }

      // Si vente à crédit, créer une entrée customer_credits pour le suivi de la dette
      if (paymentMethod === "credit" && totalAmount > 0) {
        let customerId: string | null = null;

        // Upsert atomique du client — évite la race condition SELECT→INSERT
        // où deux vendeurs concurrents créeraient des doublons pour le même téléphone.
        // La contrainte unique sur customers(phone, organization_id) garantit l'atomicité.
        if (customerPhone) {
          const upsertData: Record<string, unknown> = {
            name: customerName || customerPhone,
            phone: customerPhone,
          };
          if (profile?.organization_id) {
            upsertData.organization_id = profile.organization_id;
          }
          const { data: upsertedCustomer, error: custErr } = await supabase
            .from("customers")
            .upsert(upsertData as never, {
              onConflict: 'phone,organization_id',
              ignoreDuplicates: false,
            })
            .select("id")
            .maybeSingle();

          if (!custErr && upsertedCustomer) {
            customerId = upsertedCustomer.id;
          }
        } else if (customerName) {
          // Pas de téléphone mais nom fourni — essayer de trouver par nom dans l'organisation
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id")
            .eq("name", customerName)
            .eq("organization_id", orgId)
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
          await supabase.from("customer_credits").insert(creditInsert as never);

          // Mettre à jour total_credit du client atomiquement via RPC
          const { error: creditUpdateError } = await supabase.rpc("increment_customer_credit", {
            p_customer_id: customerId,
            p_amount: totalAmount,
          });

          if (creditUpdateError) {
            // La vente est déjà enregistrée mais la mise à jour du crédit a échoué.
            // On ne fait PAS de fallback non-atomique pour éviter les incohérences.
            // L'utilisateur est notifié pour pouvoir relancer la synchronisation.
            reportError(new Error(`increment_customer_credit RPC failed: ${creditUpdateError.message}`));
            // Stocker l'erreur pour notification dans onError
            creditUpdateFailed = true;
          }
        }
      }

      return { sale, changeAmount, creditUpdateFailed };
    },
    onSuccess: ({ sale, changeAmount, creditUpdateFailed }) => {
      // Calculer la taxe pour l'affichage du ticket AVANT clearCart()
      const receiptTaxAmount = cart.reduce((sum, item) => {
        const t = computeTax(item.product.price, item.product.tax_rate, orgTaxRate);
        return sum + t.taxAmount * item.quantity;
      }, 0);
      const receiptSubtotal = cartTotal - receiptTaxAmount;

      // Préparer les données du ticket pour le dialogue (avant clearCart)
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
        organizationId: profile?.organization_id ?? undefined,
        taxRate: orgTaxRate,
      };

      // Clear cart AFTER receipt data is computed
      clearCart();
      setLastReceiptData(receiptData);
      setIsReceiptOpen(true);

      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      setIsPaymentOpen(false);

      // Avertir l'utilisateur si la mise à jour du crédit a échoué
      if (creditUpdateFailed) {
        toast({
          variant: "destructive",
          title: "Vente enregistrée, crédit en attente",
          description: "La vente est validée mais la mise à jour du crédit client a échoué. Vérifiez les crédits du client.",
          duration: 8000,
        });
      }
    },
    onError: (error: unknown) => {
      // Les erreurs Supabase sont des objets simples, pas des instances Error
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

  const handleBarcodeScan = async (barcode: string) => {
    // Recherche serveur du produit par code-barres
    try {
      const found = await lookupBarcode(barcode, profile?.organization_id);
      if (found) {
        addToCart(found as Product);
      } else {
        setGridSearchInput(barcode);
        toast({
          variant: "destructive",
          title: "Produit non trouvé",
          description: `Aucun produit avec le code-barres: ${barcode}`,
        });
      }
    } catch {
      setGridSearchInput(barcode);
      toast({
        variant: "destructive",
        title: "Produit non trouvé",
        description: `Aucun produit avec le code-barres: ${barcode}`,
      });
    }
  };

  // Les filtres (catégorie, stock, recherche) sont gérés côté serveur par usePOSProducts

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Raccourcis clavier
  usePOSKeyboardShortcuts({
    onFocusSearch: useCallback(() => {
      searchInputRef.current?.focus();
    }, []),
    onOpenPayment: useCallback(() => setIsPaymentOpen(true), []),
    onClearCart: useCallback(() => clearCart(), [clearCart]),
    onToggleView: useCallback(() => setViewMode((v) => v === "grid" ? "list" : "grid"), []),
    onToggleOutOfStock: useCallback(() => setShowOutOfStock((v) => !v), []),
    onOpenScanner: useCallback(() => setIsScannerOpen(true), []),
    onShowHelp: useCallback(() => setShowShortcuts(true), []),
    onConfirmPayment: useCallback(() => {
      confirmPaymentRef.current?.();
    }, []),
    onIncrementLastItem: useCallback(() => {
      if (cart.length === 0) return;
      const lastItem = cart[cart.length - 1];
      const newQty = lastItem.quantity + 1;
      if (newQty <= lastItem.product.stock_quantity) {
        updateQuantity(lastItem.product.id, newQty);
      }
    }, [cart, updateQuantity]),
    onDecrementLastItem: useCallback(() => {
      if (cart.length === 0) return;
      const lastItem = cart[cart.length - 1];
      const newQty = lastItem.quantity - 1;
      if (newQty <= 0) {
        removeItem(lastItem.product.id);
      } else {
        updateQuantity(lastItem.product.id, newQty);
      }
    }, [cart, updateQuantity, removeItem]),
    hasCartItems: cart.length > 0,
    isPaymentOpen,
  });

  return (
    <DashboardLayout>
      <div className="h-[calc(100dvh-10rem)] sm:h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-2.5rem)] flex flex-col lg:flex-row gap-3 lg:gap-4">
        {/* Products Section */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search and Categories */}
          <div className="space-y-3 mb-3 lg:mb-4">
            <div className="flex gap-2">
              <ProductAutocomplete
                inputRef={searchInputRef}
                organizationId={profile?.organization_id}
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
                title="F7 : Scanner un code-barres"
                aria-label="Scanner un code-barres"
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowShortcuts(true)}
                title="Raccourcis clavier"
                aria-label="Raccourcis clavier"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {products.length} produit(s) affiché(s)
                {totalProductCount > 0 && ` / ${totalProductCount} au total`}
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <CurrencySelector variant="compact" />
                {/* View mode toggle */}
                <div className="flex items-center border rounded-md">
                  <Button
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    size="icon"
                    className="h-7 w-7 rounded-r-none"
                    onClick={() => setViewMode("grid")}
                    aria-label="Vue grille"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="icon"
                    className="h-7 w-7 rounded-l-none"
                    onClick={() => setViewMode("list")}
                    aria-label="Vue liste"
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Switch
                    id="show-out-of-stock"
                    checked={showOutOfStock}
                    onCheckedChange={setShowOutOfStock}
                  />
                  <Label htmlFor="show-out-of-stock" className="text-xs cursor-pointer hidden sm:inline">
                    Ruptures
                  </Label>
                </div>
              </div>
            </div>
            
            {/* Category Filters */}
            <div className="flex gap-1.5 sm:gap-2 flex-wrap overflow-x-auto no-scrollbar pb-1">
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
                  <CategoryIcon iconName={category.icon} className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{category.name}</span><span className="sm:hidden">{category.name.length > 8 ? category.name.slice(0, 8) + '…' : category.name}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              viewMode === "grid" ? (
                <POSProductGridSkeleton />
              ) : (
                <POSProductListSkeleton />
              )
            ) : products.length > 0 ? (
              viewMode === "grid" ? (
                <POSProductGrid
                  products={products}
                  onAddToCart={addToCart}
                  hasMore={hasNextPage ?? false}
                  isLoadingMore={isFetchingNextPage}
                  onLoadMore={fetchNextPage}
                  totalCount={totalProductCount}
                />
              ) : (
                <POSProductList
                  products={products}
                  onAddToCart={addToCart}
                  hasMore={hasNextPage ?? false}
                  isLoadingMore={isFetchingNextPage}
                  onLoadMore={fetchNextPage}
                  totalCount={totalProductCount}
                />
              )
            ) : (
              <div className="text-center py-12">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Aucun produit trouvé</p>
              </div>
            )}
          </div>
        </div>

        {/* Cart Section — hidden on mobile, visible on lg+ */}
        <div className="hidden lg:flex lg:w-80 xl:w-96 flex-shrink-0">
          {isLoading ? (
            <POSCartSkeleton />
          ) : (
            <POSCart
              items={cart}
              total={cartTotal}
              onUpdateQuantity={updateCartQuantity}
              onRemove={removeFromCart}
              onClear={clearCart}
              onCheckout={() => setIsPaymentOpen(true)}
            />
          )}
        </div>

        {/* Mobile floating cart button */}
        {itemCount > 0 && (
          <div className="lg:hidden fixed bottom-[5.5rem] right-4 z-40">
            <Button
              size="lg"
              className="rounded-full shadow-lg h-14 w-14 relative"
              onClick={() => setIsMobileCartOpen(true)}
              aria-label="Voir le panier"
            >
              <ShoppingCart className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {itemCount}
              </span>
            </Button>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1 rounded-md shadow">
              {formatPrice(cartTotal)}
            </div>
          </div>
        )}

        {/* Mobile Cart Drawer */}
        <MobileCartDrawer
          isOpen={isMobileCartOpen}
          onClose={() => setIsMobileCartOpen(false)}
          items={cart}
          total={cartTotal}
          onUpdateQuantity={updateCartQuantity}
          onRemove={removeFromCart}
          onClear={clearCart}
          onCheckout={() => setIsPaymentOpen(true)}
        />

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
          confirmRef={confirmPaymentRef}
        />

        {/* Receipt Actions Dialog — lazy-loaded (receipt logic) */}
        <Suspense fallback={null}>
          <ReceiptActionsDialog
            isOpen={isReceiptOpen}
            onClose={() => setIsReceiptOpen(false)}
            receiptData={lastReceiptData}
          />
        </Suspense>

        {/* Barcode Scanner Dialog — lazy-loaded (html5-qrcode ~100 kB) */}
        <Suspense fallback={null}>
          <BarcodeScannerDialog
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScan={handleBarcodeScan}
          />
        </Suspense>

        {/* Keyboard Shortcuts Dialog */}
        <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
          <DialogContent className="max-w-sm" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                Raccourcis clavier
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {[
                { keys: "F1", action: "Aide raccourcis clavier" },
                { keys: "/ ou Ctrl+K", action: "Rechercher un produit" },
                { keys: "F2", action: "Ouvrir le paiement" },
                { keys: "Ctrl+Entrée", action: "Confirmer le paiement" },
                { keys: "F4", action: "Vider le panier" },
                { keys: "+ / -", action: "Modifier qté dernier article" },
                { keys: "F5", action: "Basculer grille / liste" },
                { keys: "F6", action: "Afficher / masquer ruptures" },
                { keys: "F7", action: "Scanner un code-barres" },
                { keys: "Escape", action: "Fermer / annuler" },
              ].map((shortcut) => (
                <div key={shortcut.keys} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-muted-foreground">{shortcut.action}</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">
                    {shortcut.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default POS;
