import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { reportError } from "@/lib/sentry";
import { validateCustomerForm, formatErrors, type CustomerFormData } from "@/lib/schemas";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
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
import { Switch } from "@/components/ui/switch";
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
import { Customer, CustomerUpdateParams, MANAGEMENT_ROLES } from "@/types";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";

const PAGE_SIZE = 20;

const Customers = () => {
  const { t } = useTranslation("customers");
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const { blockMutation } = useDemo();
  const { currency } = useCurrency();
  const { effectiveOrgId } = useOrgSelector();
  const {
    formatDisplayPrice,
    isConverted,
  } = useDisplayCurrency();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [isCreditOpen, setIsCreditOpen] = useState(false);
  // Filtre "clients à crédit uniquement" — utile pour les relances
  const [showCreditOnly, setShowCreditOnly] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  // Pagination côté serveur avec recherche + filtre crédit
  const { data: customers, totalCount, totalPages, isLoading } = usePaginatedQuery<Customer>({
    table: "customers",
    select: "*",
    search: searchInput
      ? { columns: ["name", "phone"], query: searchInput }
      : undefined,
    filters: showCreditOnly
      ? [{ column: "total_credit", operator: "gt" as const, value: 0 }]
      : undefined,
    orderBy: { column: "name", ascending: true },
    page: currentPage,
    pageSize: PAGE_SIZE,
    queryKey: ["customers", user?.id ?? "", showCreditOnly ? "credit" : "all"],
    enabled: !!user,
  });

  // Stats via RPC hook
  const { data: customerStats } = useCustomerStats();

  const totalCredit = customerStats?.totalCredit ?? 0;
  const customersWithCredit = customerStats?.customersWithCredit ?? 0;

  const canModify = userRole !== null && MANAGEMENT_ROLES.includes(userRole);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData | CustomerFormData) => {
      const insertData: Record<string, unknown> = {
        ...data,
        user_id: user?.id ?? "",
      };
      if (effectiveOrgId) {
        insertData.organization_id = effectiveOrgId;
      }
      const { error } = await supabase.from("customers").insert(insertData as never);
      if (error) return [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: t("toasts.createSuccess") });
      setIsFormOpen(false);
      resetForm();
    },
    onError: (error) => {
      reportError(error);
      toast({ variant: "destructive", title: t("toasts.genericErrorTitle"), description: t("toasts.createErrorDescription") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: CustomerUpdateParams) => {
      const { error } = await supabase.from("customers").update(data).eq("id", id);
      if (error) return [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: t("toasts.updateSuccess") });
      setIsFormOpen(false);
      setSelectedCustomer(null);
      resetForm();
    },
    onError: (error) => {
      reportError(error);
      toast({ variant: "destructive", title: t("toasts.genericErrorTitle"), description: t("toasts.updateErrorDescription") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) return [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: t("toasts.deleteSuccess") });
    },
    onError: (error) => {
      reportError(error);
      toast({ variant: "destructive", title: t("toasts.genericErrorTitle"), description: t("toasts.deleteErrorDescription") });
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

    // MED-6 fix : valider les données du formulaire avant envoi au backend.
    // Empêche la persistance de valeurs invalides (nom vide, email malformé,
    // téléphone avec lettres, nom de 100KB, etc.).
    const validation = validateCustomerForm(formData);
    if (!validation.success) {
      toast({
        variant: "destructive",
        title: t("toasts.invalidDataTitle"),
        description: formatErrors(validation.errors),
      });
      return;
    }

    if (selectedCustomer) {
      if (blockMutation('Modifier un client')) return;
      updateMutation.mutate({ id: selectedCustomer.id, ...validation.data });
    } else {
      if (blockMutation('Ajouter un client')) return;
      createMutation.mutate(validation.data);
    }
  };

  // Reset page quand la recherche ou le filtre crédit change
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setCurrentPage(1);
  };

  const handleToggleCreditOnly = (checked: boolean) => {
    setShowCreditOnly(checked);
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
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">{t("title")}</h1>
            <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <FeatureGate feature="exports">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  // Fetch ALL customers for full export (not just current page)
                  const allCustomers = await fetchAllRows<Customer>("customers", "*", {
                    filters: effectiveOrgId
                      ? [{ column: "organization_id", operator: "eq" as const, value: effectiveOrgId }]
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
                      title: t("toasts.exportSuccessTitle"),
                      description: t("toasts.exportSuccessDescription", { count: allCustomers.length }),
                    });
                  } else {
                    toast({
                      variant: "destructive",
                      title: t("toasts.exportEmptyTitle"),
                      description: t("toasts.exportEmptyDescription"),
                    });
                  }
                } catch (err) {
                  reportError(err instanceof Error ? err : new Error(String(err)));
                  toast({
                    variant: "destructive",
                    title: t("toasts.exportErrorTitle"),
                    description: t("toasts.exportErrorDescription"),
                  });
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              {t("actions.export")}
            </Button>
            </FeatureGate>
            {canModify && (
              <Button onClick={() => { setSelectedCustomer(null); resetForm(); setIsFormOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" />
                {t("actions.addCustomer")}
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
                  <p className="text-sm text-muted-foreground">{t("stats.totalCustomers")}</p>
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
                  <p className="text-sm text-muted-foreground">{t("stats.creditsInProgress")}</p>
                  <p className="text-lg sm:text-2xl font-bold text-destructive">{formatDisplayPrice(totalCredit, { showOriginal: isConverted })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10"><CreditCard className="h-5 w-5 text-success" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("stats.customersWithCredit")}</p>
                  <p className="text-lg sm:text-2xl font-bold">{customersWithCredit}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("search.placeholder")}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-card">
            <Switch
              id="filter-credit-only"
              checked={showCreditOnly}
              onCheckedChange={handleToggleCreditOnly}
              aria-label={t("filter.creditOnlyAria")}
            />
            <label htmlFor="filter-credit-only" className="text-sm cursor-pointer flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5 text-destructive" />
              {t("filter.creditOnlyLabel")}
            </label>
          </div>
        </div>

        {/* Table */}
        {customers && customers.length > 0 ? (
          <Card className="card-elevated">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.columnName")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("table.columnPhone")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("table.columnTotalPurchases")}</TableHead>
                    <TableHead>{t("table.columnCredit")}</TableHead>
                    <TableHead className="text-right">{t("table.columnActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">{customer.phone || t("table.noPhone")}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatDisplayPrice(Number(customer.total_purchases), { showOriginal: isConverted })}</TableCell>
                      <TableCell>
                        {Number(customer.total_credit) > 0 ? (
                          <Badge variant="destructive">{formatDisplayPrice(Number(customer.total_credit), { showOriginal: isConverted })}</Badge>
                        ) : (
                          <Badge variant="secondary">0</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => { setSelectedCustomer(customer); setIsDetailOpen(true); }} aria-label={t("table.viewDetailsAria")}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => { setSelectedCustomer(customer); setIsCreditOpen(true); }} aria-label={t("table.customerCreditAria")}>
                            <Wallet className="h-4 w-4" />
                          </Button>
                          {canModify && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)} aria-label={t("table.editCustomerAria")}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(customer)} aria-label={t("table.deleteCustomerAria")}>
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
              {t("pagination.showing", { from: ((currentPage - 1) * PAGE_SIZE) + 1, to: Math.min(currentPage * PAGE_SIZE, totalCount), total: totalCount })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                aria-label={t("pagination.previousAria")}
              >
                {t("pagination.previous")}
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
                      aria-label={t("pagination.pageAria", { page })}
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
                aria-label={t("pagination.nextAria")}
              >
                {t("pagination.next")}
              </Button>
            </div>
          </div>
        )}

        {!(customers && customers.length > 0) && !isLoading && (
          <div className="text-center py-12 bg-card rounded-xl border">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">{t("empty.title")}</h3>
            <p className="text-muted-foreground mb-4">{t("empty.description")}</p>
            {canModify && (
              <Button onClick={() => setIsFormOpen(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                {t("empty.addFirst")}
              </Button>
            )}
          </div>
        )}

        {/* Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{selectedCustomer ? t("formDialog.editTitle") : t("formDialog.newTitle")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer-name">{t("formDialog.nameLabel")}</Label>
                <Input id="customer-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customer-phone">{t("formDialog.phoneLabel")}</Label>
                  <Input id="customer-phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} pattern="[0-9+\-\s]{8,15}" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-email">{t("formDialog.emailLabel")}</Label>
                  <Input id="customer-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-address">{t("formDialog.addressLabel")}</Label>
                <Input id="customer-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-notes">{t("formDialog.notesLabel")}</Label>
                <Input id="customer-notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                {selectedCustomer ? t("formDialog.submitSave") : t("formDialog.submitAdd")}
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
              <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteDialog.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteTarget(null)}>{t("deleteDialog.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteTarget) {
                    if (blockMutation('Supprimer un client')) return;
                    deleteMutation.mutate(deleteTarget.id);
                    setDeleteTarget(null);
                  }
                }}
              >
                {t("deleteDialog.confirm")}
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
