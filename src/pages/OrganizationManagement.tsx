/**
 * Organization Management Page — Super Admin Only
 *
 * Lists all organizations with their subscription details and allows
 * the super_admin to change any organization's plan and duration.
 * Also allows deleting organizations with strong confirmation.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlans, type Plan } from "@/hooks/useSubscription";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Loader2, Building2, CreditCard, Search, Edit, RefreshCw, AlertTriangle, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { extractErrorMessage } from "@/lib/extractErrorMessage";

// ─── Types ────────────────────────────────────────────────────

interface OrgSubscription {
  organization_id: string;
  organization_name: string;
  owner_email: string | null;
  country: string | null;
  subscription_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  billing_period: string | null;
  stripe_customer_id: string | null;
  created_at: string | null;
}

// ─── Status badge colors ──────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Actif", variant: "default" },
  trialing: { label: "Essai", variant: "secondary" },
  past_due: { label: "Impayé", variant: "destructive" },
  grace_period: { label: "Période de grâce", variant: "outline" },
  read_only: { label: "Lecture seule", variant: "outline" },
  cancelled: { label: "Annulé", variant: "destructive" },
  expired: { label: "Expiré", variant: "destructive" },
};

// ─── Component ────────────────────────────────────────────────

export default function OrganizationManagement() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: plans } = usePlans();

  const [search, setSearch] = useState("");
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<OrgSubscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<"1month" | "1year">("1month");
  const [paymentReference, setPaymentReference] = useState("");
  const [changeReason, setChangeReason] = useState("");

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<OrgSubscription | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canConfirmDelete =
    Boolean(orgToDelete) &&
    deleteConfirmText.trim() === orgToDelete?.organization_name.trim();

  // ─── Fetch all org subscriptions ──────────────────────────
  const { data: orgs, isLoading, error } = useQuery({
    queryKey: ["admin-all-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_subscriptions");
      if (error) throw error;
      // Supabase RPC RETURNS TABLE returns arrays
      const raw = Array.isArray(data) ? data : [data];
      return (raw as OrgSubscription[]) || [];
    },
    enabled: userRole === "super_admin",
    staleTime: 2 * 60 * 1000,
  });

  // ─── Mutation: change org subscription ────────────────────
  const changeSubMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrg || !selectedPlan) throw new Error("Sélection incomplète");

      // Align p_duration with RPC accepted values: 1_month, 3_months, 6_months, 1_year
      const duration = selectedDuration === "1year" ? "1_year" : "1_month";
      const reason = changeReason.trim() || "Changement manuel depuis l'écran Organisations.";

      const { data, error } = await supabase.rpc("admin_update_organization_subscription", {
        p_organization_id: selectedOrg.organization_id,
        p_plan_id: selectedPlan,
        p_duration: duration,
        p_payment_reference: paymentReference.trim() || null,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Abonnement mis à jour",
        description: `L'abonnement de ${selectedOrg?.organization_name} a été modifié avec succès.`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-all-subscriptions"] });
      setChangeDialogOpen(false);
      setSelectedOrg(null);
      setPaymentReference("");
      setChangeReason("");
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de modifier l'abonnement.",
        variant: "destructive",
      });
    },
  });

  // ─── Delete organization ──────────────────────────────────
  const handleDeleteOrg = (org: OrgSubscription) => {
    setOrgToDelete(org);
    setDeleteConfirmText("");
    setDeleteDialogOpen(true);
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    setDeleteDialogOpen(open);
    if (!open) {
      setOrgToDelete(null);
      setDeleteConfirmText("");
    }
  };

  const confirmDeleteOrg = async () => {
    if (!orgToDelete || !canConfirmDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("delete_organization", {
        p_organization_id: orgToDelete.organization_id,
      });
      if (error) throw error;
      toast({
        title: "Organisation supprimée",
        description: `"${orgToDelete.organization_name}" et toutes ses données ont été supprimés définitivement.`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-all-subscriptions"] });
    } catch (error) {
      const message = extractErrorMessage(error);
      const isPermissionDenied = message.includes("Accès refusé") || message.includes("super administrateur");
      const isNotFound = message.includes("introuvable");
      toast({
        variant: "destructive",
        title: isPermissionDenied ? "Accès refusé" : isNotFound ? "Introuvable" : "Erreur de suppression",
        description: isPermissionDenied
          ? "Seul un super administrateur peut supprimer une organisation."
          : message,
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setOrgToDelete(null);
      setDeleteConfirmText("");
    }
  };

  // ─── Filter orgs by search ────────────────────────────────
  const filteredOrgs = useMemo(() => {
    if (!orgs) return [];
    if (!search.trim()) return orgs;
    const q = search.toLowerCase();
    return orgs.filter(
      (o) =>
        o.organization_name?.toLowerCase().includes(q) ||
        o.owner_email?.toLowerCase().includes(q) ||
        o.plan_id?.toLowerCase().includes(q) ||
        o.status?.toLowerCase().includes(q)
    );
  }, [orgs, search]);

  // ─── Stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!orgs) return { total: 0, active: 0, trialing: 0, expired: 0, grace: 0 };
    return {
      total: orgs.length,
      active: orgs.filter((o) => o.status === "active" && o.plan_id !== "starter").length,
      trialing: orgs.filter((o) => o.status === "trialing").length,
      expired: orgs.filter((o) => o.status === "expired" || o.status === "read_only").length,
      grace: orgs.filter((o) => o.status === "grace_period").length,
    };
  }, [orgs]);

  // ─── Open change dialog ───────────────────────────────────
  const openChangeDialog = (org: OrgSubscription) => {
    setSelectedOrg(org);
    setSelectedPlan(org.plan_id || "starter");
    setSelectedDuration("1month");
    setPaymentReference("");
    setChangeReason("");
    setChangeDialogOpen(true);
  };

  // ─── Guard: only super_admin ──────────────────────────────
  if (userRole !== "super_admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold">Accès refusé</h2>
            <p className="text-muted-foreground mt-2">Cette page est réservée au super administrateur.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Gestion des Organisations
            </h1>
            <p className="text-muted-foreground">Gérez les abonnements de tous les clients</p>
          </div>
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-all-subscriptions"] })}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total organisations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
              <p className="text-xs text-muted-foreground">Abonnés actifs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{stats.trialing}</div>
              <p className="text-xs text-muted-foreground">En période d'essai</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-amber-600">{stats.grace}</div>
              <p className="text-xs text-muted-foreground">Période de grâce</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{stats.expired}</div>
              <p className="text-xs text-muted-foreground">Expirés / Lecture seule</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, email, plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Organizations Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-3" />
                  <p className="text-destructive font-medium">Erreur de chargement</p>
                  <p className="text-sm text-muted-foreground">{extractErrorMessage(error)}</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organisation</TableHead>
                      <TableHead className="hidden sm:table-cell">Propriétaire</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="hidden sm:table-cell">Expire le</TableHead>
                      <TableHead className="hidden md:table-cell">Paiement</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrgs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Aucune organisation trouvée
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrgs.map((org) => {
                        const statusInfo = STATUS_STYLES[org.status || ""] || {
                          label: org.status || "Inconnu",
                          variant: "outline" as const,
                        };
                        return (
                          <TableRow key={org.organization_id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{org.organization_name || "Sans nom"}</p>
                                {org.country && (
                                  <p className="text-xs text-muted-foreground">{org.country}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm hidden sm:table-cell">{org.owner_email || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {org.plan_name || "Aucun"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusInfo.variant}>
                                {statusInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm hidden sm:table-cell">
                              {org.current_period_end
                                ? new Date(org.current_period_end).toLocaleDateString("fr-FR")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-sm hidden md:table-cell">
                              {org.stripe_customer_id ? (
                                <Badge variant="secondary" className="text-xs">Stripe</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">Manuel</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openChangeDialog(org)}
                                >
                                  <Edit className="h-4 w-4 mr-1" />
                                  Modifier
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteOrg(org)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Subscription Dialog */}
        <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier l'abonnement</DialogTitle>
              <DialogDescription>
                Cette action change le plan et renouvelle l'abonnement en statut actif pour <strong>{selectedOrg?.organization_name}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Current info */}
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><span className="text-muted-foreground">Plan actuel :</span> <strong>{selectedOrg?.plan_name || "Aucun"}</strong></p>
                <p><span className="text-muted-foreground">Statut actuel :</span> <strong>{STATUS_STYLES[selectedOrg?.status || ""]?.label || selectedOrg?.status}</strong></p>
                <p><span className="text-muted-foreground">Expire le :</span> <strong>{selectedOrg?.current_period_end ? new Date(selectedOrg.current_period_end).toLocaleDateString("fr-FR") : "—"}</strong></p>
              </div>

              {/* New Plan */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Nouveau plan</label>
                <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans?.map((plan: Plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} — {plan.price_monthly === 0 ? "Gratuit" : `${plan.price_monthly.toFixed(2).replace(".00", "")} EUR/mois`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Durée</label>
                <Select value={selectedDuration} onValueChange={(v) => setSelectedDuration(v as "1month" | "1year")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1month">1 mois</SelectItem>
                    <SelectItem value="1year">1 an (économisez 2 mois)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Référence paiement (optionnel)</label>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="ex: MM-20260706-001"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Raison (optionnel)</label>
                <Input
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="ex: Paiement Mobile Money reçu"
                />
              </div>

              {/* Price preview */}
              {selectedPlan && (
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <p className="font-medium">
                    {selectedPlan === "starter"
                      ? "Essai gratuit"
                      : selectedPlan === "croissance"
                      ? "Croissance"
                      : "Enterprise"}
                    {" — "}
                    {selectedDuration === "1year"
                      ? selectedPlan === "croissance"
                        ? "399,00 EUR/an"
                        : selectedPlan === "enterprise"
                        ? "999,00 EUR/an"
                        : "Gratuit"
                      : selectedPlan === "croissance"
                      ? "39,90 EUR/mois"
                      : selectedPlan === "enterprise"
                      ? "99,90 EUR/mois"
                      : "Gratuit"}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setChangeDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={() => changeSubMutation.mutate()}
                disabled={!selectedPlan || changeSubMutation.isPending}
              >
                {changeSubMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Confirmer le changement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Organization Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogOpenChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette organisation ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. L'organisation <strong>{orgToDelete?.organization_name}</strong> et toutes ses données
                (magasins, produits, ventes, abonnements...) seront supprimées définitivement.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3 py-2">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                Attention : suppression définitive. Aucun double-clic ou clic accidentel ne doit pouvoir valider cette action.
              </div>
              <div className="space-y-2">
                <label htmlFor="delete-org-confirm" className="text-sm font-medium">
                  Tapez exactement le nom de l'organisation pour confirmer :
                </label>
                <Input
                  id="delete-org-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={orgToDelete?.organization_name || "Nom de l'organisation"}
                  disabled={deleting}
                />
                <p className="text-xs text-muted-foreground">
                  Nom attendu : <strong>{orgToDelete?.organization_name}</strong>
                </p>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteOrg}
                disabled={deleting || !canConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Supprimer définitivement
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
