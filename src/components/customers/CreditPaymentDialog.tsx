import { useState, useMemo } from "react";
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

  const totalCredit = Number(customer?.total_credit ?? 0);

  const quickAmounts = useMemo(() => {
    if (totalCredit <= 0) return [];
    const amounts = [totalCredit];
    if (totalCredit > 5000) amounts.push(Math.ceil(totalCredit / 5000) * 5000);
    if (totalCredit > 10000) amounts.push(Math.ceil(totalCredit / 10000) * 10000);
    if (totalCredit > 500) amounts.push(500);
    if (totalCredit > 1000) amounts.push(1000);
    if (totalCredit > 2000) amounts.push(2000);
    if (totalCredit > 5000) amounts.push(5000);
    if (totalCredit > 10000) amounts.push(10000);
    // Unique, sorted, and not exceeding total
    return [...new Set(amounts)]
      .filter((a) => a > 0 && a <= totalCredit)
      .sort((a, b) => a - b)
      .slice(0, 5);
  }, [totalCredit]);

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!customer) throw new Error("Aucun client sélectionné");
      const numAmount = parseFloat(amount);
      if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
        throw new Error("Montant invalide");
      }
      if (numAmount > Number(customer.total_credit)) {
        throw new Error("Le montant depasse le credit restant");
      }

      // Utiliser la RPC atomique process_credit_payment
      // Pas de fallback non-atomique : SELECT→UPDATE cause des incohérences
      // si deux paiements sont traités simultanément.
      const { error: rpcError } = await supabase.rpc("process_credit_payment", {
        p_customer_id: customer.id,
        p_amount: numAmount,
        p_description: description || "Paiement de credit",
      });
      if (rpcError) {
        throw new Error(`Erreur lors du paiement de crédit : ${rpcError.message}`);
      }
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
              className="text-lg"
            />
            {quickAmounts.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {quickAmounts.map((qa) => (
                  <Button
                    key={qa}
                    variant={parseFloat(amount) === qa ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAmount(String(qa))}
                    className="text-xs"
                  >
                    {formatPrice(qa)}
                  </Button>
                ))}
              </div>
            )}
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
