import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ShoppingCart, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Props {
  customer: any;
  isOpen: boolean;
  onClose: () => void;
}

export const CustomerDetailDialog = ({ customer, isOpen, onClose }: Props) => {
  const { user } = useAuth();
  const { formatPrice } = useCurrency();

  const { data: sales } = useQuery({
    queryKey: ["customer-sales", customer?.id],
    queryFn: async () => {
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

  if (!customer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer.name}</DialogTitle>
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

          {customer.phone && <p className="text-sm"><span className="text-muted-foreground">Tél:</span> {customer.phone}</p>}
          {customer.address && <p className="text-sm"><span className="text-muted-foreground">Adresse:</span> {customer.address}</p>}

          {/* Credit History */}
          {credits && credits.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Historique des crédits</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {credits.map((c: any) => (
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
                        {format(new Date(c.created_at), "dd/MM/yy", { locale: fr })}
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
                {sales.map((sale: any) => (
                  <div key={sale.id} className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">{sale.sale_number}</span>
                      <Badge variant="outline">{formatPrice(sale.total_amount)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(sale.created_at), "dd MMM yyyy à HH:mm", { locale: fr })}
                    </p>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {sale.sale_items?.map((item: any) => item.product_name).join(", ")}
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
