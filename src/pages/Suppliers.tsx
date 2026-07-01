import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  Truck,
  Eye,
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Package,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { SupplierDetailDialog } from "@/components/suppliers/SupplierDetailDialog";
import { Supplier, SupplierUpdateParams } from "@/types";
import { reportError } from "@/lib/sentry";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";
import { Lock } from "lucide-react";

const Suppliers = () => {
  const { user, profile, userRole } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null
  );
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    country: "Guinée",
    notes: "",
  });

  // ─── Récupération des fournisseurs ────────────────────────────────────────
  const { data: suppliers, isLoading } = useQuery({
    queryKey: ["suppliers", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!user,
  });

  // ─── Récupération des produits (pour compter par fournisseur) ─────────────
  const { data: products } = useQuery({
    queryKey: ["products", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, supplier_id, cost_price, stock_quantity")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const canModify =
    userRole === "admin" ||
    userRole === "manager" ||
    userRole === "super_admin";

  // ─── Compteurs par fournisseur ────────────────────────────────────────────
  const productCountBySupplier: Record<string, number> = {};
  const stockValueBySupplier: Record<string, number> = {};
  products?.forEach((p) => {
    if (p.supplier_id) {
      productCountBySupplier[p.supplier_id] =
        (productCountBySupplier[p.supplier_id] || 0) + 1;
      stockValueBySupplier[p.supplier_id] =
        (stockValueBySupplier[p.supplier_id] || 0) +
        Number(p.cost_price || 0) * p.stock_quantity;
    }
  });

  // ─── Création ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const insertData: Record<string, unknown> = {
        ...data,
        user_id: user!.id,
      };
      if (profile?.organization_id) {
        insertData.organization_id = profile.organization_id;
      }
      const { error } = await supabase.from("suppliers").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Fournisseur ajouté" });
      setIsFormOpen(false);
      resetForm();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      reportError(error, { action: 'create_supplier' });
      toast({
        variant: "destructive",
        title: "Erreur",
        description: msg.length > 120 ? msg.slice(0, 120) + '\u2026' : "Impossible d'ajouter le fournisseur",
      });
    },
  });

  // ─── Mise à jour ─────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: SupplierUpdateParams) => {
      const { id: _id, ...updateFields } = { id, ...data };
      const { error } = await supabase
        .from("suppliers")
        .update(updateFields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Fournisseur mis à jour" });
      setIsFormOpen(false);
      setSelectedSupplier(null);
      resetForm();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      reportError(error, { action: 'update_supplier', supplierId: selectedSupplier?.id });
      toast({
        variant: "destructive",
        title: "Erreur",
        description: msg.length > 120 ? msg.slice(0, 120) + '\u2026' : "Impossible de modifier le fournisseur",
      });
    },
  });

  // ─── Suppression ─────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Fournisseur supprimé" });
      setIsDeleteOpen(false);
      setSelectedSupplier(null);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      reportError(error, { action: 'delete_supplier', supplierId: selectedSupplier?.id });
      toast({
        variant: "destructive",
        title: "Erreur",
        description: msg.length > 120 ? msg.slice(0, 120) + '\u2026' : "Impossible de supprimer le fournisseur",
      });
    },
  });

  // ─── Toggle actif/inactif ────────────────────────────────────────────────
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("suppliers")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      country: "Guinée",
      notes: "",
    });
  };

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name,
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      city: supplier.city || "",
      country: supplier.country || "Guinée",
      notes: supplier.notes || "",
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSupplier) {
      updateMutation.mutate({ id: selectedSupplier.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // ─── Filtre et stats ─────────────────────────────────────────────────────
  const filtered = suppliers?.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.phone && s.phone.includes(searchQuery)) ||
      (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.city && s.city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const activeSuppliers = suppliers?.filter((s) => s.is_active) || [];
  const totalProductCount = Object.values(productCountBySupplier).reduce(
    (a, b) => a + b,
    0
  );
  const totalStockValue = Object.values(stockValueBySupplier).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <DashboardLayout>
      <FeatureGate
        feature="supplier_management"
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Gestion des fournisseurs</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              La gestion des fournisseurs est disponible à partir du plan Croissance.
              Upgradéz votre abonnement pour accéder à cette fonctionnalité.
            </p>
            <Button onClick={() => window.location.hash = "/dashboard/billing"}>
              Voir les abonnements
            </Button>
          </div>
        }
      >
      <div className="space-y-6">
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              Fournisseurs
            </h1>
            <p className="text-muted-foreground mt-1">
              Gérez vos fournisseurs et suivez les approvisionnements
            </p>
          </div>
          {canModify && (
            <Button
              onClick={() => {
                setSelectedSupplier(null);
                resetForm();
                setIsFormOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Ajouter un fournisseur
            </Button>
          )}
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="card-elevated">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Fournisseurs actifs
                  </p>
                  <p className="text-2xl font-bold">{activeSuppliers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Package className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Produits approvisionnés
                  </p>
                  <p className="text-2xl font-bold">{totalProductCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <MapPin className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Valeur du stock fournisseur
                  </p>
                  <p className="text-2xl font-bold">
                    {formatPrice(totalStockValue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recherche */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, téléphone, email ou ville..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tableau */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filtered && filtered.length > 0 ? (
          <Card className="card-elevated">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fournisseur</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Contact
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Ville
                      </TableHead>
                      <TableHead className="text-center">Produits</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell>
                          <div className="font-medium">{supplier.name}</div>
                          {supplier.email && (
                            <div className="text-xs text-muted-foreground sm:hidden">
                              {supplier.email}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="space-y-0.5">
                            {supplier.phone && (
                              <div className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3" />
                                {supplier.phone}
                              </div>
                            )}
                            {supplier.email && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {supplier.email}
                              </div>
                            )}
                            {!supplier.phone && !supplier.email && "-"}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {supplier.city || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">
                            {productCountBySupplier[supplier.id] || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {supplier.is_active ? (
                            <Badge className="bg-green-100 text-green-800">
                              Actif
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactif</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hidden sm:inline-flex"
                              onClick={() => {
                                setSelectedSupplier(supplier);
                                setIsDetailOpen(true);
                              }}
                              aria-label="Voir les détails"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canModify && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    toggleActiveMutation.mutate({
                                      id: supplier.id,
                                      is_active: !supplier.is_active,
                                    })
                                  }
                                  aria-label={
                                    supplier.is_active
                                      ? "Désactiver le fournisseur"
                                      : "Activer le fournisseur"
                                  }
                                >
                                  {supplier.is_active ? (
                                    <ToggleRight className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(supplier)}
                                  aria-label="Modifier le fournisseur"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedSupplier(supplier);
                                    setIsDeleteOpen(true);
                                  }}
                                  aria-label="Supprimer le fournisseur"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-12 bg-card rounded-xl border">
            <Truck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Aucun fournisseur</h3>
            <p className="text-muted-foreground mb-4">
              Ajoutez vos premiers fournisseurs pour suivre vos
              approvisionnements
            </p>
            {canModify && (
              <Button onClick={() => setIsFormOpen(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un fournisseur
              </Button>
            )}
          </div>
        )}

        {/* Dialogue Formulaire */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-lg" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>
                {selectedSupplier
                  ? "Modifier le fournisseur"
                  : "Nouveau fournisseur"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Formulaire de création ou modification d'un fournisseur
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nom du fournisseur *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ex: Global Trading SARL"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="+224 XXX XXX XXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="contact@fournisseur.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Adresse</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    placeholder="Quartier, rue..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ville</Label>
                  <Input
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    placeholder="Conakry"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Pays</Label>
                <Input
                  value={formData.country}
                  onChange={(e) =>
                    setFormData({ ...formData, country: e.target.value })
                  }
                  placeholder="Guinée"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="Conditions de paiement, délais de livraison..."
                  rows={3}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={
                  createMutation.isPending || updateMutation.isPending
                }
              >
                {selectedSupplier ? "Enregistrer" : "Ajouter le fournisseur"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialogue Détail */}
        <SupplierDetailDialog
          supplier={selectedSupplier}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />

        {/* Dialogue Confirmation suppression */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le fournisseur ?</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer{" "}
                <strong>{selectedSupplier?.name}</strong> ? Les produits associés
                ne seront pas supprimés, mais ils ne seront plus liés à ce
                fournisseur. Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (selectedSupplier) {
                    deleteMutation.mutate(selectedSupplier.id);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      </FeatureGate>
    </DashboardLayout>
  );
};

export default Suppliers;
