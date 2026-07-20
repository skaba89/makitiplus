import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { reportError } from "@/lib/sentry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ReceiveOrderFormProps {
  orderId: string;
  orderNumber: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
}

export const ReceiveOrderForm = ({
  orderId,
  orderNumber,
  onSuccess,
  onError,
}: ReceiveOrderFormProps) => {
  const { user } = useAuth();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch order items
  const { data: orderItems, isLoading } = useQuery({
    queryKey: ["purchase-order-items", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("id, product_id, product_name, quantity_ordered, quantity_received, unit_cost")
        .eq("purchase_order_id", orderId);
      if (error) throw error;
      return data as OrderItem[];
    },
    enabled: !!orderId,
  });

  useEffect(() => {
    if (orderItems) {
      setItems(
        orderItems.map((item) => ({
          ...item,
          quantity_received: item.quantity_received || item.quantity_ordered,
        }))
      );
    }
  }, [orderItems]);

  const updateReceivedQty = (index: number, qty: number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], quantity_received: qty };
    setItems(updated);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setIsSubmitting(true);

    try {
      // Build the items payload for the RPC — product_id/quantity, pas id/quantity_received
      // (la fonction receive_purchase_order lit v_item->>'product_id' et v_item->>'quantity')
      const rpcItems = items
        .filter((item) => item.product_id)
        .map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity_received,
        }));

      const { error } = await supabase.rpc("receive_purchase_order", {
        p_order_id: orderId,
        p_received_items: rpcItems,
      });

      if (error) throw error;
      onSuccess();
    } catch (err: unknown) {
      reportError(err instanceof Error ? err : new Error(String(err)));
      const message = err instanceof Error ? err.message : "Erreur lors de la réception";
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Commande <strong>{orderNumber}</strong>
      </div>

      <div className="space-y-3 max-h-64 overflow-y-auto">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{item.product_name}</p>
              <p className="text-xs text-muted-foreground">
                Commandé : {item.quantity_ordered}
              </p>
            </div>
            <div className="w-28">
              <Label className="text-xs">Qté reçue</Label>
              <Input
                type="number"
                min={0}
                max={item.quantity_ordered}
                value={item.quantity_received}
                onChange={(e) =>
                  updateReceivedQty(index, parseInt(e.target.value) || 0)
                }
                className="h-8 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => onSuccess()}
          disabled={isSubmitting}
        >
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Confirmer la réception
        </Button>
      </div>
    </div>
  );
};
