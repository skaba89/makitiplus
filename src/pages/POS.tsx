import { useState, useCallback, useRef, useEffect, useDeferredValue, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { usePOSCartStore, useCartTotal, useCartSubtotal, useCartDiscount } from "@/contexts/POSCartContext";
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
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { useOrgTaxRate } from "@/hooks/useOrgTaxRate";
import { ShoppingCart, Camera, LayoutGrid, List, Keyboard } from "lucide-react";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Database } from "@/integrations/supabase/types";
import { ReceiptData } from "@/utils/receiptGenerator";
import { useBranding } from "@/contexts/BrandingContext";
import { useThemeSettings } from "@/contexts/ThemeContext";
import { usePOSKeyboardShortcuts } from "@/hooks/usePOSKeyboardShortcuts";
import { usePOSProducts } from "@/hooks/usePOSProducts";
import { useOfflineSale } from "@/hooks/useOfflineSale";
import { useOnlineStatus } from "@/contexts/OfflineContext";
import { OfflineBanner } from "@/components/ui/offline-indicator";
import { lookupBarcode, lookupBarcodeOffline } from "@/hooks/useProductSearch";
import { useCategories } from "@/hooks/useCategories";
import { POSProductGridSkeleton, POSProductListSkeleton, POSCartSkeleton } from "@/components/pos/POSSkeletons";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

const POS = () => {
  const { t } = useTranslation("pos");
  useAuth();
  const { effectiveOrgId } = useOrgSelector();
  const { toast } = useToast();
  const { blockMutation } = useDemo();
  const { formatPrice } = useCurrency();
  useOrgTaxRate();
  const { isOnline } = useOnlineStatus();
  useBranding();
  useThemeSettings();
  useQueryClient();
  const cart = usePOSCartStore((s) => s.items);
  const { addToCart: addToCartStore, updateQuantity, removeItem, clearCart, hydrateFromDB, isHydrated, setDiscount, clearDiscount, discountType, discountValue } = usePOSCartStore();
  const cartTotal = useCartTotal();
  const cartSubtotal = useCartSubtotal();
  const cartDiscount = useCartDiscount();

  // Hydrate cart from IndexedDB on mount (org-scoped)
  useEffect(() => {
    if (effectiveOrgId && !isHydrated) {
      hydrateFromDB(effectiveOrgId);
    }
  }, [effectiveOrgId, isHydrated, hydrateFromDB]);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastReceiptData, setLastReceiptData] = useState<ReceiptData | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
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

  const createSaleMutation = useOfflineSale({
    onSaleComplete: ({ receiptData }) => {
      setLastReceiptData(receiptData);
      setIsReceiptOpen(true);
      setIsPaymentOpen(false);
    },
  });

  const addToCart = useCallback((product: Product, addQty: number = 1) => {
    const existing = cart.find((item) => item.product.id === product.id);
    const currentQty = existing?.quantity || 0;
    const targetQty = currentQty + addQty;

    if (targetQty > product.stock_quantity) {
      toast({
        variant: "destructive",
        title: t("toasts.insufficientStockTitle"),
        description: t("toasts.insufficientStockOnly", {
          quantity: product.stock_quantity,
          unit: product.unit || t("toasts.defaultUnit"),
        }),
      });
      return;
    }
    addToCartStore(product, addQty);
  }, [cart, toast, addToCartStore, t]);

  const updateCartQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    const item = cart.find((i) => i.product.id === productId);
    if (item && quantity > item.product.stock_quantity) {
      toast({
        variant: "destructive",
        title: t("toasts.insufficientStockTitle"),
        description: t("toasts.insufficientStockOnlyShort", { quantity: item.product.stock_quantity }),
      });
      return;
    }
    updateQuantity(productId, quantity);
  }, [cart, toast, updateQuantity, removeItem, t]);

  const removeFromCart = useCallback((productId: string) => {
    removeItem(productId);
  }, [removeItem]);

  const handleBarcodeScan = async (barcode: string) => {
    // C3 fix: Use offline barcode lookup when offline
    try {
      const found = isOnline
        ? await lookupBarcode(barcode, effectiveOrgId)
        : await lookupBarcodeOffline(barcode);
      if (found) {
        addToCart(found as Product);
      } else {
        setGridSearchInput(barcode);
        toast({
          variant: "destructive",
          title: t("toasts.productNotFoundTitle"),
          description: t("toasts.productNotFoundDesc", { barcode }),
        });
      }
    } catch {
      setGridSearchInput(barcode);
      toast({
        variant: "destructive",
        title: t("toasts.productNotFoundTitle"),
        description: t("toasts.productNotFoundDesc", { barcode }),
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
      {!isOnline && <OfflineBanner />}
      <div className="h-[calc(100dvh-10rem)] sm:h-[calc(100dvh-9rem)] md:h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-2.5rem)] flex flex-col lg:flex-row gap-3 lg:gap-4">
        {/* Products Section */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search and Categories */}
          <div className="space-y-3 mb-3 lg:mb-4">
            <div className="flex gap-2">
              <ProductAutocomplete
                inputRef={searchInputRef}
                organizationId={effectiveOrgId}
                onSelect={(p, qty) => {
                  if (p.stock_quantity === 0) {
                    toast({
                      variant: "destructive",
                      title: t("toasts.outOfStockTitle"),
                      description: t("toasts.outOfStockDesc", { name: p.name }),
                    });
                    return;
                  }
                  addToCart(p, qty);
                }}
                placeholder={t("search.placeholder")}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsScannerOpen(true)}
                title={t("search.scannerTitle")}
                aria-label={t("search.scannerAriaLabel")}
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowShortcuts(true)}
                title={t("search.shortcutsAriaLabel")}
                aria-label={t("search.shortcutsAriaLabel")}
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {t("productsCount", { count: products.length })}
                {totalProductCount > 0 && t("productsCountTotal", { total: totalProductCount })}
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
                    aria-label={t("viewMode.gridAriaLabel")}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="icon"
                    className="h-7 w-7 rounded-l-none"
                    onClick={() => setViewMode("list")}
                    aria-label={t("viewMode.listAriaLabel")}
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
                    {t("outOfStock.label")}
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
                {t("categories.all")}
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
                <p className="text-muted-foreground">{t("noProductsFound")}</p>
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
              subtotal={cartSubtotal}
              discount={cartDiscount}
              discountType={discountType}
              discountValue={discountValue}
              onUpdateQuantity={updateCartQuantity}
              onRemove={removeFromCart}
              onClear={clearCart}
              onCheckout={() => setIsPaymentOpen(true)}
              onSetDiscount={setDiscount}
              onClearDiscount={clearDiscount}
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
              aria-label={t("mobileCart.viewCartAriaLabel")}
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
          onConfirm={(paymentMethod, amountPaid, customerName, customerPhone, paymentReference) => {
            if (blockMutation('Enregistrer une vente')) return;
            createSaleMutation.mutate({
              paymentMethod,
              amountPaid,
              customerName,
              customerPhone,
              paymentReference,
            });
          }}
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
                {t("shortcuts.title")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {[
                { keys: "F1", action: t("shortcuts.helpAction") },
                { keys: "/ ou Ctrl+K", action: t("shortcuts.searchAction") },
                { keys: "F2", action: t("shortcuts.openPaymentAction") },
                { keys: "Ctrl+Entrée", action: t("shortcuts.confirmPaymentAction") },
                { keys: "F4", action: t("shortcuts.clearCartAction") },
                { keys: "+ / -", action: t("shortcuts.adjustQuantityAction") },
                { keys: "F5", action: t("shortcuts.toggleViewAction") },
                { keys: "F6", action: t("shortcuts.toggleOutOfStockAction") },
                { keys: "F7", action: t("shortcuts.scanAction") },
                { keys: "Escape", action: t("shortcuts.closeAction") },
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
