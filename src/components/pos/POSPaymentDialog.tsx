import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Loader2, Banknote, Smartphone, CreditCard, Clock, AlertTriangle} from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { useCurrency } from "@/hooks/useCurrency";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

interface POSPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  onConfirm: (
    paymentMethod: PaymentMethod,
    amountPaid: number,
    customerName?: string,
    customerPhone?: string
  ) => void;
  isLoading: boolean;
}

export const POSPaymentDialog = ({
  isOpen,
  onClose,
  total,
  onConfirm,
  isLoading,
}: POSPaymentDialogProps) => {
  const { formatPrice, availablePaymentMethods, phoneCode } = useCurrency();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState<number>(total);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Update amountPaid when total changes
  useEffect(() => {
    setAmountPaid(total);
  }, [total]);

  const change = amountPaid - total;
  const canConfirm = paymentMethod === "credit" || amountPaid >= total;

  const handleConfirm = () => {
    onConfirm(
      paymentMethod,
      paymentMethod === "credit" ? 0 : amountPaid,
      customerName || undefined,
      customerPhone || undefined
    );
  };

  const quickAmounts = [
    total,
    Math.ceil(total / 500) * 500,
    Math.ceil(total / 1000) * 1000,
    Math.ceil(total / 5000) * 5000,
  ].filter((v, i, a) => a.indexOf(v) === i && v >= total);

  // Filter payment methods based on country
  const allPaymentMethods: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { value: "cash", label: "Espèces", icon: <Banknote className="h-4 w-4" /> },
    { value: "wave", label: "Wave", icon: <Smartphone className="h-4 w-4" /> },
    { value: "orange_money", label: "Orange Money", icon: <Smartphone className="h-4 w-4" /> },
    { value: "mtn_money", label: "MTN Money", icon: <Smartphone className="h-4 w-4" /> },
    { value: "moov_money", label: "Moov Money", icon: <Smartphone className="h-4 w-4" /> },
    { value: "mpesa", label: "M-Pesa", icon: <Smartphone className="h-4 w-4" /> },
    { value: "card", label: "Carte", icon: <CreditCard className="h-4 w-4" /> },
    { value: "credit", label: "À crédit", icon: <Clock className="h-4 w-4" /> },
  ];

  // Always show cash, card, credit + country-specific mobile payments
  const paymentMethods = allPaymentMethods.filter(
    (method) =>
      method.value === "cash" ||
      method.value === "card" ||
      method.value === "credit" ||
      availablePaymentMethods.includes(method.value)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Finaliser la vente</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Total */}
          <div className="text-center py-4 bg-primary/10 rounded-xl">
            <p className="text-sm text-muted-foreground">Total à payer</p>
            <p className="text-3xl font-bold text-primary">{formatPrice(total)}</p>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Mode de paiement</Label>
            <Tabs
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
            >
              <TabsList className="flex flex-wrap h-auto gap-1">
                {paymentMethods.map((method) => (
                  <TabsTrigger
                    key={method.value}
                    value={method.value}
                    className="flex flex-col gap-1 py-2 px-1"
                  >
                    {method.icon}
                    <span className="text-[10px]">{method.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="cash" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Montant reçu</Label>
                  <Input
                    type="number"
                    max="100000000"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                    className="text-lg"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {quickAmounts.map((amount) => (
                    <Button
                      key={amount}
                      variant="outline"
                      size="sm"
                      onClick={() => setAmountPaid(amount)}
                    >
                      {formatPrice(amount)}
                    </Button>
                  ))}
                </div>
                {change > 0 && (
                  <div className="p-3 bg-success/10 rounded-lg">
                    <p className="text-sm text-muted-foreground">Monnaie à rendre</p>
                    <p className="text-xl font-bold text-success">{formatPrice(change)}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="wave" className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Le client paie {formatPrice(total)} via Wave
                </p>
              </TabsContent>

              <TabsContent value="orange_money" className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Le client paie {formatPrice(total)} via Orange Money
                </p>
              </TabsContent>

              <TabsContent value="card" className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Le client paie {formatPrice(total)} par carte bancaire
                </p>
              </TabsContent>

              <TabsContent value="credit" className="space-y-4 mt-4">
                <p className="text-sm text-warning bg-warning/10 p-3 rounded-lg">
                  <span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Vente à crédit - Le client paiera plus tard</span>
                </p>
                <div className="space-y-2">
                  <Label>Nom du client *</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nom du client"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Téléphone du client</Label>
                  <div className="flex gap-2">
                    <div className="w-20 flex items-center justify-center px-2 bg-muted rounded-lg text-sm font-medium">
                      {phoneCode}
                    </div>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="77 000 00 00"
                      className="flex-1"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Customer Info (optional for non-credit) */}
          {paymentMethod !== "credit" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom client (optionnel)</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nom"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Téléphone (optionnel)</Label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Téléphone"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Confirm Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleConfirm}
            disabled={
              isLoading ||
              !canConfirm ||
              (paymentMethod === "credit" && !customerName.trim())
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              "Confirmer la vente"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
