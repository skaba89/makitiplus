import { useState, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { usePaginatedQuery } from "@/hooks/usePaginatedQuery";
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
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  Users,
  Wallet,
  Eye,
  Edit,
  Trash2,
  CreditCard,
  Download,
} from "lucide-react";
import { CustomerDetailDialog } from "@/components/customers/CustomerDetailDialog";
import { CreditPaymentDialog } from "@/components/customers/CreditPaymentDialog";
import { exportCustomersToCSV } from "@/utils/exportUtils";
import { fetchAllRows } from "@/lib/batchedFetch";
import { CustomersPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { useCustomerStats } from "@/hooks/useCustomerStats";
import { Customer, CustomerUpdateParams } from "@/types";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";

const PAGE_SIZE = 20;

const Customers = () => {
  const { user, profile, userRole } = useAuth();
  const { toast } = useToast();
  const { formatPrice, currency } = useCurrency();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [isCreditOpen, setIsCreditOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  // Pagination côté serveur avec recherche
  const { data: customers, totalCount, totalPages, isLoading } = usePaginatedQuery<Customer>({
    table: "customers",
    select: "*",
    search: searchInput
      ? { columns: ["name", "phone"], query: searchInput }
      : undefined,
    orderBy: { column: "name", ascending: true },
    page: currentPage,
    pageSize: PAGE_SIZE,
    queryKey: ["customers", user?.id ?? ""],
    enabled: !!user,
  });

  // Stats via RPC hook
  const { data: customerStats } = useCustomerStats();

  const totalCredit = customerStats?.totalCredit ?? 0;
  const customersWithCredit = customerStats?.customersWithCredit ?? 0;

  const canModify = userRole === 'admin' || userRole === 'manager' || userRole === 'super_admin';

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const insertData: Record<string, unknown> = {
        ...data,
        user_id: user!.id,
      };
      if (profile?.organization_id) {
        insertData.organization_id = profile.organization_id;
      }
      const { error } = await supabase.from("customers").insert(insertData as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Client ajouté" });
      setIsFormOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible d'ajouter le client" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: CustomerUpdateParams) => {
      const { id: _id, ...updateFields } = { id, ...data };
      const { error } = await supabase.from("customers").update(updateFields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Client mis à jour" });
      setIsFormOpen(false);
      setSelectedCustomer(null);
      resetForm();
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de modifier le client" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Client supprimé" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de supprimer le client" });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", phone: "", email: "", address: "", notes: "" });
  };

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCustomer) {
      updateMutation.mutate({ id: selectedCustomer.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Reset page quand la recherche change
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setCurrentPage(1);
  };

  return (
    <DashboardLayout>
      {isLoading && !customers ? (
        <CustomersPageSkeleton />
      ) : (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Clients</h1>
            <p className="text-muted-foreground mt-1">Gérez vos clients et suivez les crédits</p>
          </div>
          <div className="flex gap-2">
            <FeatureGate feature="exports">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  // Fetch ALL customers for full export (not just current page)
                  const allCustomers = await fetchAllRows<Customer>("customers", "*", {
                    filters: profile?.organization_id
                      ? [{ column: "organization_id", operator: "eq" as const, value: profile.organization_id }]
                      : [],
                  });
                  if (allCustomers && allCustomers.length > 0) {
                    exportCustomersToCSV(
                      allCustomers.map((c) => ({
                        name: c.name,
                        phone: c.phone,
                        email: c.email,
                        address: c.address,
                        total_credit: Number(c.total_credit || 0),
                        notes: c.notes,
                        created_at: c.created_at,
                      })),
                      currency.displaySymbol || currency.symbol
                    );
                    toast({
                      title: "Export réussi",
                      description: `${allCustomers.length} clients exportés`,
                    });
                  } else {
                    toast({
                      variant: "destructive",
                      title: "Aucun client",
                      description: "Pas de clients à exporter",
                    });
                  }
                } catch (err) {
                  toast({
                    variant: "destructive",
                    title: "Erreur d'export",
                    description: "Impossible d'exporter les clients",
                  });
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Exporter
            </Button>
            </FeatureGate>
            {canModify && (
              <Button onClick={() => { setSelectedCustomer(null); resetForm(); setIsFormOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" />
                Ajouter un client
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <Card className="card-elevated">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Total clients</p>
                  <p className="text-lg sm:text-2xl font-bold">{totalCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10"><Wallet className="h-5 w-5 text-destructive" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Crédits en cours</p>
                  <p className="text-lg sm:text-2xl font-bold text-destructive">{formatPrice(totalCredit)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10"><CreditCard className="h-5 w-5 text-success" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Clients avec crédit</p>
                  <p className="text-lg sm:text-2xl font-bold">{customersWithCredit}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher par nom ou téléphone..." value={searchInput} onChange={(e) => handleSearchChange(e.target.value)} className="pl-10" />
        </div>

        {/* Table */}
        {customers && customers.length > 0 ? (
          <Card className="card-elevated">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead className="hidden sm:table-cell">Téléphone</TableHead>
                    <TableHead className="hidden md:table-cell">Achats totaux</TableHead>
                    <TableHead>Crédit</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">{customer.phone || "-"}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatPrice(Number(customer.total_purchases))}</TableCell>
                      <TableCell>
                        {Number(customer.total_credit) > 0 ? (
                          <Badge variant="destructive">{formatPrice(Number(customer.total_credit))}</Badge>
                        ) : (
                          <Badge variant="secondary">0</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => { setSelectedCustomer(customer); setIsDetailOpen(true); }} aria-label="Voir les détails">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => { setSelectedCustomer(customer); setIsCreditOpen(true); }} aria-label="Crédit client">
                            <Wallet className="h-4 w-4" />
                          </Button>
                          {canModify && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)} aria-label="Modifier le client">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(customer)} aria-label="Supprimer le client">
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
        ) : null}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} sur {totalCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                aria-label="Page précédente"
              >
                Précédent
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "outline"}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => setCurrentPage(page)}
                      aria-label={`Page ${page}`}
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                aria-label="Page suivante"
              >
                Suivant
              </Button>
            </div>
          </div>
        )}

        {!(customers && customers.length > 0) && !isLoading && (
          <div className="text-center py-12 bg-card rounded-xl border">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Aucun client</h3>
            <p className="text-muted-foreground mb-4">Ajoutez vos premiers clients</p>
            {canModify && (
              <Button onClick={() => setIsFormOpen(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un client
              </Button>
            )}
          </div>
        )}

        {/* Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{selectedCustomer ? "Modifier le client" : "Nouveau client"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer-name">Nom *</Label>
                <Input id="customer-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customer-phone">Téléphone</Label>
                  <Input id="customer-phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} pattern="[0-9+\-\s]{8,15}" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-email">Email</Label>
                  <Input id="customer-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-address">Adresse</Label>
                <Input id="customer-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-notes">Notes</Label>
                <Input id="customer-notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                {selectedCustomer ? "Enregistrer" : "Ajouter"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <CustomerDetailDialog
          customer={selectedCustomer}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />

        {/* Credit Payment Dialog */}
        <CreditPaymentDialog
          customer={selectedCustomer}
          isOpen={isCreditOpen}
          onClose={() => setIsCreditOpen(false)}
          onViewHistory={() => {
            setIsCreditOpen(false);
            setIsDetailOpen(true);
          }}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce client?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Les crédits associés seront conservés.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteTarget) {
                    deleteMutation.mutate(deleteTarget.id);
                    setDeleteTarget(null);
                  }
                }}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      )}
    </DashboardLayout>
  );
};

export default Customers;
