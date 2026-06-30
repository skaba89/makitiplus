import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Customer } from "@/types";

interface Props {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onViewHistory?: () => void;
}

export const CreditPaymentDialog = ({ customer, isOpen, onClose, onViewHistory }: Props) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const numAmount = parseFloat(amount);
      if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
        throw new Error("Montant invalide");
      }
      if (numAmount > Number(customer.total_credit)) {
        throw new Error("Le montant depasse le credit restant");
      }

      // Try atomic RPC first (C6: single transaction)
      try {
        const { error: rpcError } = await supabase.rpc("process_credit_payment", {
          p_user_id: user!.id,
          p_organization_id: profile?.organization_id || null,
          p_customer_id: customer.id,
          p_amount: numAmount,
          p_description: description || "Paiement de credit",
        });
        if (!rpcError) return; // atomic success
        console.warn("[CreditPayment] RPC failed, falling back:", rpcError.message);
      } catch {
        console.warn("[CreditPayment] RPC exception, falling back");
      }

      // Fallback: non-atomic (two-step)
      const creditInsert: Record<string, unknown> = {
        user_id: user!.id,
        customer_id: customer.id,
        amount: numAmount,
        type: "payment",
        description: description || "Paiement de credit",
      };
      if (profile?.organization_id) {
        creditInsert.organization_id = profile.organization_id;
      }
      const { error: creditError } = await supabase.from("customer_credits").insert(creditInsert);
      if (creditError) throw creditError;

      const newCredit = Math.max(0, Number(customer.total_credit) - numAmount);
      const { error: updateError } = await supabase
        .from("customers")
        .update({ total_credit: newCredit })
        .eq("id", customer.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-credits"] });
      toast({ title: "Paiement enregistré" });
      setAmount("");
      setDescription("");
      onClose();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Impossible d'enregistrer le paiement";
      toast({ variant: "destructive", title: "Erreur", description: msg });
    },
  });

  if (!customer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Paiement de crédit - {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 bg-destructive/10 rounded-lg text-center">
            <p className="text-sm text-muted-foreground">Crédit en cours</p>
            <p className="text-2xl font-bold text-destructive">{formatPrice(Number(customer.total_credit))}</p>
          </div>
          {onViewHistory && (
            <Button variant="link" size="sm" className="px-0" onClick={onViewHistory}>
              Voir l'historique
            </Button>
          )}
          <div className="space-y-2">
            <Label>Montant du paiement</Label>
            <Input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          {amount && parseFloat(amount) > 0 && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <span className="text-muted-foreground">Reste à payer après ce paiement : </span>
              <span className="font-bold">
                {formatPrice(Math.max(0, Number(customer.total_credit) - parseFloat(amount)))}
              </span>
            </div>
          )}
          <div className="space-y-2">
            <Label>Description (optionnel)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Paiement partiel"
            />
          </div>
          <Button
            onClick={() => paymentMutation.mutate()}
            className="w-full"
            disabled={paymentMutation.isPending || !amount}
          >
            Enregistrer le paiement
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
