import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { reportError } from "@/lib/sentry";
import { buildReceiptPayload, remainingToReceive } from "@/lib/purchaseOrderReceipt";
import { loadPendingPurchaseReceipt, type PendingPurchaseReceipt } from "@/lib/purchaseOrderReceiptOutbox";
import { retryPendingPurchaseReceipt, submitPurchaseReceipt } from "@/lib/purchaseOrderReceiptTransport";
import { createSupabaseReceiptOnceSender } from "@/lib/purchaseOrderReceiptSupabaseAdapter";
import { isPoReceiptOnceEnabled } from "@/lib/purchaseOrderReceiptFeatureGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

// Rollout must be explicitly authorized by deployment owners AFTER the new
// server RPC and the old-PWA compatibility gate are fully validated.
// Default is legacy flow, and merely merging this code never enables it.
const useIdempotentReceipt = isPoReceiptOnceEnabled(import.meta.env);

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
  quantity_to_receive: number;
}

export const ReceiveOrderForm = ({
  orderId,
  orderNumber,
  onSuccess,
  onError,
}: ReceiveOrderFormProps) => {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<PendingPurchaseReceipt | undefined>();
  const [pendingLoading, setPendingLoading] = useState(useIdempotentReceipt);
  const [pendingError, setPendingError] = useState<string | null>(null);

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
          quantity_to_receive: remainingToReceive(item),
        }))
      );
    }
  }, [orderItems]);

  useEffect(() => {
    if (!useIdempotentReceipt) return;
    let active = true;
    setPendingReceipt(undefined);
    setPendingError(null);
    if (!user?.id || !profile?.organization_id) {
      setPendingLoading(true);
      return () => { active = false; };
    }
    setPendingLoading(true);
    loadPendingPurchaseReceipt(profile.organization_id, user.id, orderId)
      .then(value => { if (active) setPendingReceipt(value); })
      .catch(err => {
        // Fail closed: an unreadable outbox must never yield a fresh UUID.
        if (active) setPendingError(err instanceof Error ? err.message : "Stockage local indisponible");
      })
      .finally(() => { if (active) setPendingLoading(false); });
    return () => { active = false; };
  }, [user?.id, profile?.organization_id, orderId]);

  const updateReceivedQty = (index: number, qty: number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], quantity_to_receive: qty };
    setItems(updated);
  };

  const handleSubmit = async () => {
    if (!user || isSubmitting || (useIdempotentReceipt && (pendingLoading || !!pendingError || !profile?.organization_id))) return;
    setIsSubmitting(true);
    try {
      if (useIdempotentReceipt) {
        const identity = {
          organization_id: profile!.organization_id!,
          actor_id: user.id,
          order_id: orderId,
        };
        const sender = createSupabaseReceiptOnceSender();
        if (pendingReceipt) {
          // Always replay the *stored* payload, never newly edited UI fields.
          const replayed = await retryPendingPurchaseReceipt(identity, sender);
          if (!replayed) throw new Error("Réception en attente introuvable : réconciliation requise");
        } else {
          const rpcItems = buildReceiptPayload(items);
          await submitPurchaseReceipt({ ...identity, items: rpcItems }, sender);
        }
        setPendingReceipt(undefined);
      } else {
        // Legacy path unchanged until controlled database/client cutover.
        const rpcItems = buildReceiptPayload(items);
        const { error } = await supabase.rpc("receive_purchase_order", {
          p_order_id: orderId,
          p_received_items: rpcItems,
        });
        if (error) throw error;
      }
      onSuccess();
    } catch (err: unknown) {
      // If network failed AFTER server COMMIT, the outbox MUST remain and be
      // recovered even when the form closes. Never retry via legacy RPC.
      if (useIdempotentReceipt && profile?.organization_id) {
        try {
          const stored = await loadPendingPurchaseReceipt(profile.organization_id, user.id, orderId);
          setPendingReceipt(stored);
        } catch {
          // Fail closed; storage failure must not trigger a new UUID.
          setPendingError("Stockage local inaccessible : veuillez vérifier la réception avant toute nouvelle tentative");
        }
      }
      reportError(err instanceof Error ? err : new Error(String(err)));
      const message = err instanceof Error ? err.message : "Erreur lors de la réception";
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || (useIdempotentReceipt && pendingLoading)) {
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

      {useIdempotentReceipt && pendingError && (
        <div role="alert" className="rounded-md border border-destructive p-3 text-sm">
          Synchronisation bloquée : {pendingError}. Aucune nouvelle réception ne sera transmise.
        </div>
      )}
      {useIdempotentReceipt && pendingReceipt && (
        <div role="status" className="rounded-md border border-amber-500/50 p-3 text-sm">
          Réception en attente de confirmation ({pendingReceipt.receipt_id}).
          Les quantités sont verrouillées. Réessayez avec la même demande.
        </div>
      )}

      <div className="space-y-3 max-h-64 overflow-y-auto">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{item.product_name}</p>
              <p className="text-xs text-muted-foreground">
                Commandé : {item.quantity_ordered} · Déjà reçu : {item.quantity_received} · Reste : {remainingToReceive(item)}
              </p>
            </div>
            <div className="w-28">
              <Label className="text-xs">À recevoir maintenant</Label>
              <Input
                type="number"
                min={0}
                max={remainingToReceive(item)}
                value={item.quantity_to_receive}
                onChange={(e) =>
                  updateReceivedQty(index, parseInt(e.target.value) || 0)
                }
                disabled={isSubmitting || (useIdempotentReceipt && !!pendingReceipt)}
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
        <Button onClick={handleSubmit} disabled={isSubmitting || (useIdempotentReceipt && (pendingLoading || !!pendingError || !profile?.organization_id))}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {useIdempotentReceipt && pendingReceipt ? "Réessayer la réception en attente" : "Confirmer la réception"}
        </Button>
      </div>
    </div>
  );
};
