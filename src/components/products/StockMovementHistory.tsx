import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, TrendingUp, TrendingDown, RotateCcw, ShoppingBag } from "lucide-react";
import { Database } from "@/integrations/supabase/types";

type StockMovement = Database["public"]["Tables"]["stock_movements"]["Row"];

interface StockMovementHistoryProps {
  productId: string | null;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  sale: { label: "Vente", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: <ShoppingBag className="h-3 w-3" /> },
  restock: { label: "Réapprovisionnement", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: <TrendingUp className="h-3 w-3" /> },
  loss: { label: "Perte", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: <TrendingDown className="h-3 w-3" /> },
  adjustment: { label: "Ajustement", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", icon: <RotateCcw className="h-3 w-3" /> },
};

export const StockMovementHistory = ({
  productId,
  productName,
  isOpen,
  onClose,
}: StockMovementHistoryProps) => {
  const { user } = useAuth();

  const { data: movements, isLoading } = useQuery({
    queryKey: ["stock-movements", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!productId,
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" aria-describedby="stock-history-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Historique du stock
          </DialogTitle>
          <DialogDescription id="stock-history-description">
            Mouvements de stock pour {productName}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : movements && movements.length > 0 ? (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {movements.map((movement: StockMovement) => {
                const config = TYPE_CONFIG[movement.type] || TYPE_CONFIG.adjustment;
                const isPositive = movement.quantity > 0;
                const isAbsolute = movement.type === "adjustment";

                return (
                  <div
                    key={movement.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className={`mt-0.5 p-1.5 rounded-full ${config.color}`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary" className={`text-xs ${config.color}`}>
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(movement.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-muted-foreground">
                          {movement.previous_quantity} → {movement.new_quantity}
                        </span>
                        <span
                          className={`text-sm font-bold ${
                            isAbsolute
                              ? "text-yellow-600"
                              : isPositive
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {isPositive ? "+" : ""}
                          {movement.quantity}
                        </span>
                      </div>
                      {movement.reason && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {movement.reason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8">
            <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Aucun mouvement enregistré</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
