import { memo, useState } from "react";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus, Trash2, ShoppingCart, X, Tag } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCurrency } from "@/hooks/useCurrency";

type Product = Database["public"]["Tables"]["products"]["Row"];

interface CartItem {
  product: Product;
  quantity: number;
}

interface POSCartProps {
  items: CartItem[];
  total: number;
  subtotal: number;
  discount: number;
  discountType: "amount" | "percent";
  discountValue: number;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  onSetDiscount: (type: "amount" | "percent", value: number) => void;
  onClearDiscount: () => void;
}

export const POSCart = memo(({
  items,
  total,
  subtotal,
  discount,
  discountType,
  discountValue,
  onUpdateQuantity,
  onRemove,
  onClear,
  onCheckout,
  onSetDiscount,
  onClearDiscount,
}: POSCartProps) => {
  const { formatPrice } = useCurrency();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleApplyDiscount = () => {
    const raw = parseFloat(discountInput) || 0;
    // Plafonner une remise en pourcentage à 100 : sans ce garde-fou, une
    // erreur de frappe (ex. "150" au lieu de "15") vendait l'article
    // gratuitement (le total final restait correctement bloqué à 0 côté
    // useCartTotal, mais sans aucun avertissement -- le vendeur ne s'en
    // rendait compte qu'après coup). Une remise en montant reste bornée
    // par le sous-total via useCartTotal (Math.min), pas ici.
    const val = discountType === "percent" ? Math.min(raw, 100) : raw;
    if (val > 0) {
      onSetDiscount(discountType, val);
    }
    setShowDiscount(false);
    setDiscountInput("");
  };

  return (
    <Card className="h-full flex flex-col card-elevated w-full" data-testid="pos-cart">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Panier
            {itemCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                {itemCount}
              </span>
            )}
          </CardTitle>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowClearConfirm(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4 mr-1" />
              Vider
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 px-4 pb-0 min-h-0">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground" data-testid="cart-empty">Panier vide</p>
            <p className="text-sm text-muted-foreground">
              Cliquez sur un produit pour l'ajouter
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full max-h-[35vh] lg:max-h-[45vh] xl:max-h-[55vh]">
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm line-clamp-1">
                      {item.product.name}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {formatPrice(item.product.price)} x {item.quantity}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        onUpdateQuantity(item.product.id, item.quantity - 1)
                      }
                      aria-label="Diminuer la quantité"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">
                      {item.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        onUpdateQuantity(item.product.id, item.quantity + 1)
                      }
                      aria-label="Augmenter la quantité"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onRemove(item.product.id)}
                      aria-label="Supprimer du panier"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-3 pt-4">
        <Separator />
        
        {/* Ligne remise */}
        {discount > 0 && (
          <div className="w-full flex items-center justify-between text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              Remise {discountType === "percent" ? `(${discountValue}%)` : ""}
            </span>
            <span className="text-destructive">- {formatPrice(discount)}</span>
          </div>
        )}
        
        {/* Bouton remise */}
        {items.length > 0 && !showDiscount && (
          <button
            onClick={() => setShowDiscount(true)}
            className="text-xs text-primary hover:underline self-start"
          >
            {discount > 0 ? "Modifier la remise" : "+ Ajouter une remise"}
          </button>
        )}
        
        {/* Input remise */}
        {showDiscount && (
          <div className="w-full space-y-2 p-2 border rounded-md bg-muted/30">
            <Label className="text-xs">Type de remise</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={discountType === "amount" ? "default" : "outline"}
                onClick={() => onSetDiscount("amount", discountValue)}
                className="flex-1"
              >
                Montant
              </Button>
              <Button
                type="button"
                size="sm"
                variant={discountType === "percent" ? "default" : "outline"}
                onClick={() => onSetDiscount("percent", discountValue)}
                className="flex-1"
              >
                Pourcentage (%)
              </Button>
            </div>
            <Input
              type="number"
              min="0"
              max={discountType === "percent" ? "100" : undefined}
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              placeholder={discountType === "percent" ? "Ex: 10" : "Ex: 5000"}
              className="text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleApplyDiscount} className="flex-1">
                Appliquer
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowDiscount(false);
                  setDiscountInput("");
                }}
              >
                Annuler
              </Button>
              {discount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onClearDiscount();
                    setShowDiscount(false);
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Sous-total si remise active */}
        {discount > 0 && (
          <div className="w-full flex items-center justify-between text-sm text-muted-foreground">
            <span>Sous-total</span>
            <span className="line-through">{formatPrice(subtotal)}</span>
          </div>
        )}
        
        <div className="w-full flex items-center justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-primary" data-testid="cart-total">{formatPrice(total)}</span>
        </div>
        <Button
          className="w-full"
          size="lg"
          onClick={onCheckout}
          disabled={items.length === 0}
          data-testid="checkout-btn"
        >
          Payer {formatPrice(total)}
        </Button>
      </CardFooter>
      {/* Clear Cart Confirmation */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vider le panier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera tous les articles du panier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onClear();
                setShowClearConfirm(false);
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
});