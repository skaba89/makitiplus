import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Plus, Minus, RotateCcw } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { useCurrency } from "@/hooks/useCurrency";

type Product = Database["public"]["Tables"]["products"]["Row"];

type AdjustmentType = "restock" | "adjustment" | "loss";

interface StockAdjustDialogProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    productId: string;
    type: AdjustmentType;
    quantity: number;
    reason: string;
    previousQuantity: number;
  }) => void;
  isLoading: boolean;
}

const ADJUSTMENT_TYPES: Record<AdjustmentType, { label: string; icon: React.ReactNode; sign: "+" | "-" }> = {
  restock: { label: "Réapprovisionnement", icon: <Plus className="h-4 w-4" />, sign: "+" },
  loss: { label: "Perte / Casse", icon: <Minus className="h-4 w-4" />, sign: "-" },
  adjustment: { label: "Ajustement (définir le stock)", icon: <RotateCcw className="h-4 w-4" />, sign: "=" },
};

export const StockAdjustDialog = ({
  product,
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: StockAdjustDialogProps) => {
  const { formatPrice } = useCurrency();
  const [adjustType, setAdjustType] = useState<AdjustmentType>("restock");
  const [quantity, setQuantity] = useState<number>(0);
  const [reason, setReason] = useState("");

  if (!product) return null;

  const config = ADJUSTMENT_TYPES[adjustType];

  const getNewQuantity = (): number => {
    if (adjustType === "restock") return product.stock_quantity + quantity;
    if (adjustType === "loss") return Math.max(0, product.stock_quantity - quantity);
    return quantity; // adjustment = set absolute value
  };

  const newQuantity = getNewQuantity();
  const isValid =
    quantity > 0 &&
    (adjustType !== "loss" || quantity <= product.stock_quantity);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onConfirm({
      productId: product.id,
      type: adjustType,
      quantity,
      reason,
      previousQuantity: product.stock_quantity,
    });
  };

  const resetAndClose = () => {
    setAdjustType("restock");
    setQuantity(0);
    setReason("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-md" aria-describedby="stock-adjust-description">
        <DialogHeader>
          <DialogTitle>Gestion du stock</DialogTitle>
          <DialogDescription id="stock-adjust-description">
            Ajuster le stock de {product.name}
          </DialogDescription>
        </DialogHeader>

        {/* Current stock info */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Produit</span>
            <span className="font-medium">{product.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Prix de vente</span>
            <span className="font-medium">{formatPrice(product.price)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Stock actuel</span>
            <span className="font-bold text-lg">
              {product.stock_quantity} {product.unit || "unité(s)"}
            </span>
          </div>
          {product.min_stock_alert && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Seuil d'alerte</span>
              <span className={product.stock_quantity <= product.min_stock_alert ? "text-warning font-medium" : ""}>
                {product.min_stock_alert} {product.unit || "unité(s)"}
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Adjustment type */}
          <div className="space-y-2">
            <Label>Type d'ajustement</Label>
            <Select
              value={adjustType}
              onValueChange={(value: AdjustmentType) => {
                setAdjustType(value);
                setQuantity(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ADJUSTMENT_TYPES).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      {cfg.icon} {cfg.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="qty">
              {adjustType === "adjustment" ? "Nouvelle quantité" : "Quantité"}
            </Label>
            <div className="flex items-center gap-2">
              {adjustType !== "adjustment" && (
                <span className="text-xl font-bold text-muted-foreground">
                  {config.sign}
                </span>
              )}
              <Input
                id="qty"
                type="number"
                min={1}
                max={adjustType === "loss" ? product.stock_quantity : undefined}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                placeholder="0"
                required
              />
            </div>
            {adjustType === "loss" && (
              <p className="text-xs text-muted-foreground">
                Max : {product.stock_quantity} {product.unit || "unité(s)"}
              </p>
            )}
          </div>

          {/* Preview new quantity */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Nouveau stock</span>
              <span className="text-xl font-bold text-primary">
                {newQuantity} {product.unit || "unité(s)"}
              </span>
            </div>
            {product.min_stock_alert && newQuantity <= product.min_stock_alert && (
              <p className="text-xs text-warning mt-1">
                ⚠️ En dessous du seuil d'alerte ({product.min_stock_alert})
              </p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Raison (optionnel)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                adjustType === "restock"
                  ? "Ex: Livraison fournisseur"
                  : adjustType === "loss"
                  ? "Ex: Produit périmé, casse"
                  : "Ex: Inventaire, correction"
              }
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={resetAndClose}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={!isValid || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  {config.icon}
                  <span className="ml-2">Confirmer</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
