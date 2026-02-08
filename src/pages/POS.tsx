import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { POSProductGrid } from "@/components/pos/POSProductGrid";
import { POSCart } from "@/components/pos/POSCart";
import { POSPaymentDialog } from "@/components/pos/POSPaymentDialog";
import { ReceiptActionsDialog } from "@/components/pos/ReceiptActionsDialog";
import { BarcodeScannerDialog } from "@/components/pos/BarcodeScannerDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { Search, ShoppingCart, Camera } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { ReceiptData } from "@/utils/receiptGenerator";

type Product = Database["public"]["Tables"]["products"]["Row"] & {
  categories?: { name: string; color: string | null; icon: string | null } | null;
};

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

interface CartItem {
  product: Product;
  quantity: number;
}

const POS = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { currency, formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastReceiptData, setLastReceiptData] = useState<ReceiptData | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name, color, icon)")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .gt("stock_quantity", 0)
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
        .select("*")
        .eq("user_id", user!.id);

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
      // Get sale number
      const { data: saleNumber } = await supabase.rpc("generate_sale_number");

      const subtotal = cart.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
      );
      const totalAmount = subtotal;
      const changeAmount = amountPaid - totalAmount;

      // Create sale
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          user_id: user!.id,
          sale_number: saleNumber,
          subtotal,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          amount_paid: amountPaid,
          change_amount: changeAmount > 0 ? changeAmount : 0,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          seller_name: profile?.owner_name || null,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItems = cart.map((item) => ({
        sale_id: sale.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        total_price: item.product.price * item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Update product stock
      for (const item of cart) {
        const newQuantity = item.product.stock_quantity - item.quantity;
        await supabase
          .from("products")
          .update({ stock_quantity: newQuantity })
          .eq("id", item.product.id);

        // Record stock movement
        await supabase.from("stock_movements").insert({
          user_id: user!.id,
          product_id: item.product.id,
          type: "sale",
          quantity: -item.quantity,
          previous_quantity: item.product.stock_quantity,
          new_quantity: newQuantity,
          reference_id: sale.id,
        });
      }

      return { sale, changeAmount };
    },
    onSuccess: ({ sale, changeAmount }) => {
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
        subtotal: cartTotal,
        total: cartTotal,
        paymentMethod: sale.payment_method,
        amountPaid: sale.amount_paid,
        change: changeAmount > 0 ? changeAmount : 0,
        customerName: sale.customer_name || undefined,
        businessName: profile?.business_name || "Ma Boutique",
        businessAddress: profile?.address || undefined,
        businessPhone: profile?.phone || undefined,
        sellerName: profile?.owner_name || undefined,
        currencySymbol: currency.symbol,
        currencyPosition: currency.position,
      };

      setLastReceiptData(receiptData);
      setIsReceiptOpen(true);

      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      setCart([]);
      setIsPaymentOpen(false);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible d'enregistrer la vente",
      });
      console.error("Error creating sale:", error);
    },
  });

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) {
          toast({
            variant: "destructive",
            title: "Stock insuffisant",
            description: `Seulement ${product.stock_quantity} ${product.unit || "unité(s)"} disponible(s)`,
          });
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
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
    
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

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

  const filteredProducts = products?.filter((product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.barcode && product.barcode.includes(searchQuery))
  );

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const displayedProducts = selectedCategory
    ? filteredProducts?.filter((p) => p.category_id === selectedCategory)
    : filteredProducts;

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-6rem)] lg:h-[calc(100vh-2rem)] flex flex-col lg:flex-row gap-4">
        {/* Products Section */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search and Categories */}
          <div className="space-y-4 mb-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher ou scanner un code-barres..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsScannerOpen(true)}
                title="Scanner un code-barres"
              >
                <Camera className="h-4 w-4" />
              </Button>
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
                  {category.icon} {category.name}
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

        {/* Cart Section */}
        <div className="w-full lg:w-96 flex-shrink-0">
          <POSCart
            items={cart}
            total={cartTotal}
            onUpdateQuantity={updateCartQuantity}
            onRemove={removeFromCart}
            onClear={clearCart}
            onCheckout={() => setIsPaymentOpen(true)}
          />
        </div>

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
