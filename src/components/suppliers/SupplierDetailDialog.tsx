import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Phone,
  Mail,
  MapPin,
  Package,
  DollarSign,
  Globe,
  StickyNote,
} from "lucide-react";
import { Supplier } from "@/types";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface SupplierDetailDialogProps {
  supplier: Supplier | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SupplierDetailDialog = ({
  supplier,
  isOpen,
  onClose,
}: SupplierDetailDialogProps) => {
  const { formatPrice } = useCurrency();

  // Récupérer les produits liés à ce fournisseur
  const { data: supplierProducts } = useQuery({
    queryKey: ["supplier-products", supplier?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, cost_price, stock_quantity, is_active")
        .eq("supplier_id", supplier!.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!supplier?.id,
  });

  if (!supplier) return null;

  const activeProducts = supplierProducts?.filter((p) => p.is_active) || [];
  const totalStockValue = activeProducts.reduce(
    (sum, p) => sum + Number(p.cost_price || p.price) * p.stock_quantity,
    0
  );
  const totalStock = activeProducts.reduce(
    (sum, p) => sum + p.stock_quantity,
    0
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <span>{supplier.name}</span>
              {!supplier.is_active && (
                <Badge variant="secondary" className="ml-2">
                  Inactif
                </Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Informations de contact */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Informations de contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {supplier.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{supplier.phone}</span>
                </div>
              )}
              {supplier.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{supplier.email}</span>
                </div>
              )}
              {(supplier.address || supplier.city) && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {[supplier.address, supplier.city].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
              {supplier.country && supplier.country !== "Guinée" && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span>{supplier.country}</span>
                </div>
              )}
              {supplier.notes && (
                <div className="flex items-start gap-3">
                  <StickyNote className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="text-sm text-muted-foreground">
                    {supplier.notes}
                  </span>
                </div>
              )}
              {!supplier.phone && !supplier.email && !supplier.address && !supplier.notes && (
                <p className="text-sm text-muted-foreground italic">
                  Aucune information de contact renseignée
                </p>
              )}
            </CardContent>
          </Card>

          {/* Statistiques produits */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Package className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold">{activeProducts.length}</p>
                <p className="text-xs text-muted-foreground">Produits</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <DollarSign className="h-5 w-5 mx-auto mb-1 text-green-600" />
                <p className="text-lg font-bold">{totalStock}</p>
                <p className="text-xs text-muted-foreground">Stock total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <DollarSign className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                <p className="text-lg font-bold">{formatPrice(totalStockValue)}</p>
                <p className="text-xs text-muted-foreground">Valeur stock</p>
              </CardContent>
            </Card>
          </div>

          {/* Liste des produits */}
          {activeProducts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Produits fournis ({activeProducts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead className="text-right">Prix d'achat</TableHead>
                        <TableHead className="text-right">Prix vente</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">
                            {product.name}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.cost_price
                              ? formatPrice(Number(product.cost_price))
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPrice(Number(product.price))}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.stock_quantity}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Date de création */}
          <p className="text-xs text-muted-foreground text-center">
            Fournisseur ajouté le{" "}
            {format(new Date(supplier.created_at), "dd MMMM yyyy", {
              locale: fr,
            })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
