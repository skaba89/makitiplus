import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStoreId } from "@/contexts/StoreContext";
import { useCurrency } from "@/hooks/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { useSendWhatsApp, useWhatsAppConfig } from "@/hooks/useWhatsApp";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  MessageSquare,
  Send,
  Loader2,
  Phone,
  CreditCard,
} from "lucide-react";
import { Customer } from "@/types";
import { Database } from "@/integrations/supabase/types";

interface Props {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CustomerDetailDialog = ({ customer, isOpen, onClose }: Props) => {
  const { user } = useAuth();
  const storeId = useStoreId();
  const { formatPrice } = useCurrency();
  const { toast } = useToast();
  const sendMessage = useSendWhatsApp();
  const { data: whatsappConfig } = useWhatsAppConfig();
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [messageText, setMessageText] = useState("");

  const { data: sales } = useQuery({
    queryKey: ["customer-sales", customer?.id],
    queryFn: async () => {
      if (!customer) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("*, sale_items(*)")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!customer && !!user && isOpen,
  });

  const { data: credits } = useQuery({
    queryKey: ["customer-credits", customer?.id],
    queryFn: async () => {
      if (!customer) return [];
      const { data, error } = await supabase
        .from("customer_credits")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!customer && isOpen,
  });

  const handleSendWhatsApp = () => {
    if (!customer?.phone || !messageText.trim()) return;
    sendMessage.mutate(
      {
        phone: customer.phone,
        message_type: "custom",
        text: messageText,
        customer_id: customer.id,
        store_id: storeId ?? undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Message envoyé", description: `WhatsApp envoyé au ${customer.phone}` });
          setIsMessageOpen(false);
          setMessageText("");
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Échec de l'envoi",
            description: error instanceof Error ? error.message : "Erreur",
          });
        },
      }
    );
  };

  const handleSendCreditReminder = () => {
    if (!customer?.phone) return;
    const text = `Bonjour ${customer.name}, un rappel amical : votre crédit restant est de ${formatPrice(Number(customer.total_credit))}. Merci de régler votre solde à votre convenance.`;
    sendMessage.mutate(
      {
        phone: customer.phone,
        message_type: "custom",
        text,
        customer_id: customer.id,
        store_id: storeId ?? undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Rappel de crédit envoyé", description: `WhatsApp envoyé au ${customer.phone}` });
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Échec de l'envoi",
            description: error instanceof Error ? error.message : "Erreur",
          });
        },
      }
    );
  };

  if (!customer) return null;

  const isWhatsAppReady = whatsappConfig?.is_active;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{customer.name}</DialogTitle>
          <DialogDescription className="sr-only">Détails du client {customer.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Achats totaux</p>
              <p className="font-bold">{formatPrice(Number(customer.total_purchases))}</p>
            </div>
            <div className="p-3 bg-destructive/10 rounded-lg">
              <p className="text-xs text-muted-foreground">Crédit en cours</p>
              <p className="font-bold text-destructive">{formatPrice(Number(customer.total_credit))}</p>
            </div>
          </div>

          {/* Contact + WhatsApp Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {customer.phone && (
              <div className="flex items-center gap-1 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.phone && isWhatsAppReady && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-green-600 border-green-200 hover:bg-green-50"
                  onClick={() => setIsMessageOpen(true)}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  WhatsApp
                </Button>
                {Number(customer.total_credit) > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50"
                    onClick={handleSendCreditReminder}
                    disabled={sendMessage.isPending}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Rappel crédit
                  </Button>
                )}
              </>
            )}
          </div>
          {customer.address && <p className="text-sm"><span className="text-muted-foreground">Adresse:</span> {customer.address}</p>}

          {/* WhatsApp Message Dialog */}
          {isMessageOpen && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-600" />
                <p className="font-medium text-sm">Envoyer un message WhatsApp</p>
              </div>
              <Textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={`Bonjour ${customer.name}, ...`}
                rows={3}
                className="text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setIsMessageOpen(false); setMessageText(""); }}>
                  Annuler
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700"
                  onClick={handleSendWhatsApp}
                  disabled={sendMessage.isPending || !messageText.trim()}
                >
                  {sendMessage.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Envoyer
                </Button>
              </div>
            </div>
          )}

          {/* Credit History */}
          {credits && credits.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Historique des crédits</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {credits.map((c: Database["public"]["Tables"]["customer_credits"]["Row"]) => (
                  <div key={c.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      {c.type === "credit" ? (
                        <ArrowUpRight className="h-4 w-4 text-destructive" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-success" />
                      )}
                      <span>{c.description || (c.type === "credit" ? "Crédit" : "Paiement")}</span>
                    </div>
                    <div className="text-right">
                      <span className={c.type === "credit" ? "text-destructive" : "text-success"}>
                        {c.type === "credit" ? "+" : "-"}{formatPrice(Number(c.amount))}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(c.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Purchase History */}
          <div>
            <h3 className="font-semibold mb-2">Derniers achats</h3>
            {sales && sales.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {sales.map((sale: Database["public"]["Tables"]["sales"]["Row"] & { sale_items?: Database["public"]["Tables"]["sale_items"]["Row"][] }) => (
                  <div key={sale.id} className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">{sale.sale_number}</span>
                      <Badge variant="outline">{formatPrice(sale.total_amount)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(sale.created_at)}
                    </p>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {sale.sale_items?.map((item: Database["public"]["Tables"]["sale_items"]["Row"]) => item.product_name).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucun achat enregistré</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
