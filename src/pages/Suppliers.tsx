import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { useSupplierStats } from "@/hooks/useSupplierStats";
import { useCategories } from "@/hooks/useCategories";
import { usePaginatedQuery } from "@/hooks/usePaginatedQuery";
import { SupplierProductRpcRow } from "@/types";
import {
  Truck,
  Plus,
  Pencil,
  Trash2,
  Search,
  Package,
  Phone,
  Mail,
  MapPin,
  FileText,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];

const PAGE_SIZE = 20;

// ─── Supplier Form State ──────────────────────────────────────────────────────

interface SupplierFormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  is_active: boolean;
}

const emptyForm: SupplierFormData = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  is_active: true,
};

// ─── Main Component ──────────────────────────────────────────────────────────

const Suppliers = () => {
  const { user, profile, userRole } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();

  // Stats
  const { data: supplierStats } = useSupplierStats();

  // Paginated supplier list
  const {
    data: suppliersData,
    isLoading,
    currentPage,
    totalPages,
    setCurrentPage,
  } = usePaginatedQuery<Supplier>({
    table: "suppliers",
    select: "*",
    searchColumn: "name",
    searchValue: "",
    orderBy: { column: "name", ascending: true },
    page: 1,
    pageSize: PAGE_SIZE,
    queryKey: ["suppliers", user?.id ?? ""],
    enabled: !!user,
  });

  // Local state
  const [searchInput, setSearchInput] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>(emptyForm);

  // Products state for detail view
  const [supplierProducts, setSupplierProducts] = useState<SupplierProductRpcRow[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);

  const canModify = userRole === "admin" || userRole === "manager" || userRole === "super_admin";

  // ─── Search-filtered list ─────────────────────────────────────────────────

  const filteredSuppliers = suppliersData?.filter((s) =>
    s.name.toLowerCase().includes(searchInput.toLowerCase()) ||
    (s.phone && s.phone.includes(searchInput)) ||
    (s.email && s.email.toLowerCase().includes(searchInput.toLowerCase()))
  ) ?? [];

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: SupplierFormData) => {
      const insertData: Record<string, unknown> = {
        ...data,
        user_id: user!.id,
        organization_id: profile?.organization_id,
      };
      const { error } = await supabase.from("suppliers").insert(insertData as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-stats"] });
      toast({ title: "Fournisseur ajouté", description: `${formData.name} a été créé` });
      setIsFormOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SupplierFormData & { id: string }) => {
      const { id, ...updateData } = data;
      const { error } = await supabase
        .from("suppliers")
        .update(updateData as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-stats"] });
      toast({ title: "Fournisseur mis à jour" });
      setIsFormOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-stats"] });
      toast({ title: "Fournisseur supprimé" });
      setDeleteTarget(null);
    },
  });

  // ─── Supplier product mutations ──────────────────────────────────────────

  const addProductMutation = useMutation({
    mutationFn: async (params: {
      product_id: string;
      supply_price: number | null;
      min_quantity: number;
      notes: string | null;
    }) => {
      if (!selectedSupplier) throw new Error("No supplier selected");
      const insertData = {
        supplier_id: selectedSupplier.id,
        product_id: params.product_id,
        supply_price: params.supply_price,
        min_quantity: params.min_quantity,
        notes: params.notes,
        organization_id: profile?.organization_id,
        user_id: user!.id,
      };
      const { error } = await supabase.from("supplier_products").insert(insertData as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers-stats"] });
      toast({ title: "Produit ajouté au fournisseur" });
      setIsAddProductOpen(false);
      // Reload products
      if (selectedSupplier) loadSupplierProducts(selectedSupplier.id);
    },
  });

  const removeProductMutation = useMutation({
    mutationFn: async (supplierProductId: string) => {
      const { error } = await supabase.from("supplier_products").delete().eq("id", supplierProductId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers-stats"] });
      toast({ title: "Produit retiré du fournisseur" });
      if (selectedSupplier) loadSupplierProducts(selectedSupplier.id);
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async (params: {
      id: string;
      supply_price: number | null;
      min_quantity: number;
      notes: string | null;
    }) => {
      const { error } = await supabase
        .from("supplier_products")
        .update({
          supply_price: params.supply_price,
          min_quantity: params.min_quantity,
          notes: params.notes,
        } as never)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Produit mis à jour" });
      if (selectedSupplier) loadSupplierProducts(selectedSupplier.id);
    },
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormData(emptyForm);
    setSelectedSupplier(null);
  };

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name,
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
      is_active: supplier.is_active,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ variant: "destructive", title: "Nom requis", description: "Le nom du fournisseur est obligatoire" });
      return;
    }
    if (selectedSupplier) {
      updateMutation.mutate({ ...formData, id: selectedSupplier.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const loadSupplierProducts = useCallback(async (supplierId: string) => {
    setIsLoadingProducts(true);
    try {
      const { data, error } = await supabase.rpc("get_supplier_with_products", {
        p_supplier_id: supplierId,
        p_organization_id: profile?.organization_id,
      });
      if (error) throw error;
      const typed = data as unknown as Supplier & { products: SupplierProductRpcRow[] };
      setSupplierProducts(typed?.products ?? []);
    } catch {
      setSupplierProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [profile?.organization_id, supabase]);

  const handleViewDetail = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setIsDetailOpen(true);
    setSupplierProducts([]);
    loadSupplierProducts(supplier.id);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
              Fournisseurs
            </h1>
            <p className="text-muted-foreground mt-1">
              Gérez vos fournisseurs et leurs catalogues produits
            </p>
          </div>
          {canModify && (
            <Button
              onClick={() => {
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

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total fournisseurs
              </CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <Truck className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">
                {supplierStats?.totalSuppliers ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Actifs
              </CardTitle>
              <div className="p-2 rounded-lg bg-success/10">
                <Package className="h-4 w-4 text-success" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-success">
                {supplierStats?.activeSuppliers ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Produits référencés
              </CardTitle>
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Package className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">
                {supplierStats?.totalProducts ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valeur catalogue
              </CardTitle>
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Truck className="h-4 w-4 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">
                {formatPrice(supplierStats?.totalSupplyValue ?? 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, téléphone ou email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Suppliers Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="text-center py-12">
            <Truck className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">
              {searchInput ? "Aucun résultat" : "Aucun fournisseur"}
            </h3>
            <p className="text-muted-foreground">
              {searchInput
                ? "Essayez un autre terme de recherche"
                : "Commencez par ajouter votre premier fournisseur"}
            </p>
          </div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead className="hidden sm:table-cell">Téléphone</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="hidden lg:table-cell">Adresse</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((supplier) => (
                    <TableRow
                      key={supplier.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleViewDetail(supplier)}
                    >
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {supplier.phone && (
                          <span className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3" />
                            {supplier.phone}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {supplier.email && (
                          <span className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            {supplier.email}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {supplier.address ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {supplier.address.length > 30
                              ? supplier.address.substring(0, 30) + "..."
                              : supplier.address}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            supplier.is_active
                              ? "border-success/50 text-success"
                              : "border-muted-foreground/50 text-muted-foreground"
                          }
                        >
                          {supplier.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetail(supplier);
                            }}
                            title="Voir les détails"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          {canModify && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(supplier);
                                }}
                                title="Modifier"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(supplier);
                                }}
                                title="Supprimer"
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                >
                  Précédent
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Suivant
                </Button>
              </div>
            )}
          </>
        )}

        {/* ─── Create / Edit Dialog ────────────────────────────────────────── */}
        <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsFormOpen(open); }}>
          <DialogContent className="max-w-lg" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                {selectedSupplier ? "Modifier le fournisseur" : "Nouveau fournisseur"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supplier-name">Nom *</Label>
                <Input
                  id="supplier-name"
                  placeholder="Nom du fournisseur"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplier-phone">Téléphone</Label>
                  <Input
                    id="supplier-phone"
                    placeholder="77 123 45 67"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplier-email">Email</Label>
                  <Input
                    id="supplier-email"
                    type="email"
                    placeholder="fournisseur@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-address">Adresse</Label>
                <Input
                  id="supplier-address"
                  placeholder="Adresse du fournisseur"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-notes">Notes</Label>
                <Textarea
                  id="supplier-notes"
                  placeholder="Informations complémentaires..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              {selectedSupplier && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="supplier-active" className="text-sm cursor-pointer">
                    Fournisseur actif
                  </Label>
                  <Switch
                    id="supplier-active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setIsFormOpen(false); resetForm(); }}>
                  Annuler
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {selectedSupplier ? "Mettre à jour" : "Créer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Detail Dialog with Product List ──────────────────────────────── */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                {selectedSupplier?.name}
              </DialogTitle>
            </DialogHeader>

            {selectedSupplier && (
              <div className="space-y-6">
                {/* Supplier Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedSupplier.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedSupplier.phone}</span>
                    </div>
                  )}
                  {selectedSupplier.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedSupplier.email}</span>
                    </div>
                  )}
                  {selectedSupplier.address && (
                    <div className="flex items-center gap-2 col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{selectedSupplier.address}</span>
                    </div>
                  )}
                  {selectedSupplier.notes && (
                    <div className="flex items-start gap-2 col-span-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span>{selectedSupplier.notes}</span>
                    </div>
                  )}
                </div>

                {/* Product List Header */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">
                    Catalogue produits ({supplierProducts.length})
                  </h3>
                  {canModify && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsAddProductOpen(true)}
                      className="gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Ajouter un produit
                    </Button>
                  )}
                </div>

                {/* Product List */}
                {isLoadingProducts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : supplierProducts.length === 0 ? (
                  <div className="text-center py-8 border rounded-lg bg-muted/30">
                    <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      Aucun produit dans le catalogue de ce fournisseur
                    </p>
                    {canModify && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsAddProductOpen(true)}
                        className="mt-3 gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Ajouter un produit
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produit</TableHead>
                          <TableHead className="text-right">Prix d'achat</TableHead>
                          <TableHead className="text-center">Qté min</TableHead>
                          <TableHead className="text-center hidden sm:table-cell">Stock actuel</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierProducts.map((sp) => (
                          <SupplierProductRow
                            key={sp.id}
                            product={sp}
                            canModify={canModify}
                            formatPrice={formatPrice}
                            onRemove={() => removeProductMutation.mutate(sp.id)}
                            onUpdate={(params) =>
                              updateProductMutation.mutate({
                                id: sp.id,
                                ...params,
                              })
                            }
                            isRemoving={removeProductMutation.isPending}
                            isUpdating={updateProductMutation.isPending}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ─── Add Product to Supplier Dialog ───────────────────────────────── */}
        {selectedSupplier && (
          <AddProductDialog
            isOpen={isAddProductOpen}
            onClose={() => setIsAddProductOpen(false)}
            supplierId={selectedSupplier.id}
            existingProductIds={supplierProducts.map((sp) => sp.product_id)}
            onAdd={(params) => addProductMutation.mutate(params)}
            isPending={addProductMutation.isPending}
          />
        )}

        {/* ─── Delete Confirmation ──────────────────────────────────────────── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce fournisseur ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action supprimera le fournisseur <strong>{deleteTarget?.name}</strong> et
                tous ses produits référencés. Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

// ─── SupplierProductRow (inline edit) ───────────────────────────────────────

function SupplierProductRow({
  product,
  canModify,
  formatPrice,
  onRemove,
  onUpdate,
  isRemoving,
  isUpdating,
}: {
  product: SupplierProductRpcRow;
  canModify: boolean;
  formatPrice: (n: number) => string;
  onRemove: () => void;
  onUpdate: (params: { supply_price: number | null; min_quantity: number; notes: string | null }) => void;
  isRemoving: boolean;
  isUpdating: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editPrice, setEditPrice] = useState(product.supply_price?.toString() ?? "");
  const [editQty, setEditQty] = useState(product.min_quantity.toString());
  const [editNotes, setEditNotes] = useState(product.notes ?? "");

  const handleSave = () => {
    onUpdate({
      supply_price: editPrice ? parseFloat(editPrice) : null,
      min_quantity: parseInt(editQty) || 1,
      notes: editNotes || null,
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>
          <div>
            <p className="font-medium">{product.product_name}</p>
            {product.product_barcode && (
              <p className="text-xs text-muted-foreground">{product.product_barcode}</p>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <Input
            type="number"
            step="0.01"
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            className="w-24 ml-auto text-right h-8"
            placeholder="Prix"
          />
        </TableCell>
        <TableCell className="text-center">
          <Input
            type="number"
            value={editQty}
            onChange={(e) => setEditQty(e.target.value)}
            className="w-16 mx-auto text-center h-8"
            min="1"
          />
        </TableCell>
        <TableCell className="text-center hidden sm:table-cell">
          <Badge variant="outline" className={product.current_stock <= 5 ? "border-destructive/50 text-destructive" : ""}>
            {product.current_stock}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave} disabled={isUpdating}>
              <Package className="h-3.5 w-3.5 text-success" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditing(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="font-medium">{product.product_name}</p>
          {product.product_barcode && (
            <p className="text-xs text-muted-foreground">{product.product_barcode}</p>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono">
        {product.supply_price != null ? formatPrice(product.supply_price) : "—"}
      </TableCell>
      <TableCell className="text-center">{product.min_quantity}</TableCell>
      <TableCell className="text-center hidden sm:table-cell">
        <Badge variant="outline" className={product.current_stock <= 5 ? "border-destructive/50 text-destructive" : ""}>
          {product.current_stock}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {canModify && (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setIsEditing(true)}
              title="Modifier"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onRemove}
              disabled={isRemoving}
              title="Retirer"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── Add Product Dialog ─────────────────────────────────────────────────────

function AddProductDialog({
  isOpen,
  onClose,
  supplierId,
  existingProductIds,
  onAdd,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string;
  existingProductIds: string[];
  onAdd: (params: {
    product_id: string;
    supply_price: number | null;
    min_quantity: number;
    notes: string | null;
  }) => void;
  isPending: boolean;
}) {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [supplyPrice, setSupplyPrice] = useState("");
  const [minQuantity, setMinQuantity] = useState("1");
  const [productNotes, setProductNotes] = useState("");

  // Search products
  const { data: searchResults } = useQuery({
    queryKey: ["supplier-product-search", searchQuery, profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id || !searchQuery.trim()) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, barcode, price, stock_quantity, unit")
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true)
        .or(`name.ilike.%${searchQuery}%,barcode.ilike.%${searchQuery}%`)
        .limit(20);
      if (error) throw error;
      return (data as Product[])?.filter((p) => !existingProductIds.includes(p.id)) ?? [];
    },
    enabled: searchQuery.trim().length > 0,
  });

  const handleAdd = () => {
    if (!selectedProductId) return;
    onAdd({
      product_id: selectedProductId,
      supply_price: supplyPrice ? parseFloat(supplyPrice) : null,
      min_quantity: parseInt(minQuantity) || 1,
      notes: productNotes || null,
    });
    // Reset
    setSelectedProductId(null);
    setSupplyPrice("");
    setMinQuantity("1");
    setProductNotes("");
    setSearchQuery("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Ajouter un produit au catalogue
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product Search */}
          <div className="space-y-2">
            <Label>Rechercher un produit</Label>
            <Input
              placeholder="Nom ou code-barres..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedProductId(null);
              }}
            />
          </div>

          {/* Search Results */}
          {searchResults && searchResults.length > 0 && !selectedProductId && (
            <div className="border rounded-lg max-h-40 overflow-y-auto">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between border-b last:border-b-0"
                  onClick={() => {
                    setSelectedProductId(product.id);
                    if (!supplyPrice && product.price) {
                      setSupplyPrice(product.cost_price?.toString() ?? "");
                    }
                    setSearchQuery(product.name);
                  }}
                >
                  <div>
                    <p className="font-medium text-sm">{product.name}</p>
                    {product.barcode && (
                      <p className="text-xs text-muted-foreground">{product.barcode}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Stock: {product.stock_quantity}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {selectedProductId && (
            <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
              <span className="font-medium text-sm">{searchQuery}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => {
                  setSelectedProductId(null);
                  setSearchQuery("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Price & Quantity */}
          {selectedProductId && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supply-price">Prix d'achat</Label>
                  <Input
                    id="supply-price"
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={supplyPrice}
                    onChange={(e) => setSupplyPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-qty">Quantité minimale</Label>
                  <Input
                    id="min-qty"
                    type="number"
                    min="1"
                    value={minQuantity}
                    onChange={(e) => setMinQuantity(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-notes">Notes</Label>
                <Input
                  id="product-notes"
                  placeholder="Conditionnement, délai de livraison..."
                  value={productNotes}
                  onChange={(e) => setProductNotes(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Annuler
            </Button>
            <Button
              className="flex-1"
              onClick={handleAdd}
              disabled={!selectedProductId || isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default Suppliers;
