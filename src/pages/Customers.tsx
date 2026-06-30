import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Plus,
  Search,
  Users,
  Wallet,
  Eye,
  Edit,
  Trash2,
  CreditCard,
  History,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CustomerDetailDialog } from "@/components/customers/CustomerDetailDialog";
import { CreditPaymentDialog } from "@/components/customers/CreditPaymentDialog";
import { Customer, CustomerUpdateParams } from "@/types";

const Customers = () => {
  const { user, profile, userRole } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreditOpen, setIsCreditOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

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
      const { error } = await supabase.from("customers").insert(insertData);
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

  const totalCredit = customers?.reduce((sum, c) => sum + Number(c.total_credit || 0), 0) || 0;
  const filtered = customers?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.phone && c.phone.includes(searchQuery))
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Clients</h1>
            <p className="text-muted-foreground mt-1">Gérez vos clients et suivez les crédits</p>
          </div>
          {canModify && (
            <Button onClick={() => { setSelectedCustomer(null); resetForm(); setIsFormOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Ajouter un client
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="card-elevated">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Total clients</p>
                  <p className="text-2xl font-bold">{customers?.length || 0}</p>
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
                  <p className="text-2xl font-bold text-destructive">{formatPrice(totalCredit)}</p>
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
                  <p className="text-2xl font-bold">{customers?.filter((c) => Number(c.total_credit) > 0).length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher par nom ou téléphone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        {/* Table */}
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
                    <TableHead>Nom</TableHead>
                    <TableHead className="hidden sm:table-cell">Téléphone</TableHead>
                    <TableHead className="hidden md:table-cell">Achats totaux</TableHead>
                    <TableHead>Crédit</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((customer) => (
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
                              <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(customer.id)} aria-label="Supprimer le client">
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
                <Label>Nom *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
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
        />
      </div>
    </DashboardLayout>
  );
};

export default Customers;
