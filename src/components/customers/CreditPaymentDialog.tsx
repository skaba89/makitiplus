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

interface Props {
  customer: any;
  isOpen: boolean;
  onClose: () => void;
}

export const CreditPaymentDialog = ({ customer, isOpen, onClose }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const numAmount = parseFloat(amount);
      if (!numAmount || numAmount <= 0) throw new Error("Montant invalide");

      // Record payment
      const { error: creditError } = await supabase.from("customer_credits").insert({
        user_id: user!.id,
        customer_id: customer.id,
        amount: numAmount,
        type: "payment",
        description: description || "Paiement de crédit",
      });
      if (creditError) throw creditError;

      // Update customer credit
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
    onError: () => {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible d'enregistrer le paiement" });
    },
  });

  if (!customer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paiement de crédit - {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 bg-destructive/10 rounded-lg text-center">
            <p className="text-sm text-muted-foreground">Crédit en cours</p>
            <p className="text-2xl font-bold text-destructive">{formatPrice(Number(customer.total_credit))}</p>
          </div>
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
