/**
 * Billing Page — Manage subscription and view usage
 *
 * Security model:
 *   - super_admin (platform): can manually change/extend any org plan via secured RPC
 *   - admin (tenant/shop): can see payment instructions (Mobile Money, cash)
 *     but CANNOT self-upgrade or directly mutate subscriptions
 *   - All subscription mutations go through server-side RPC with is_super_admin() check
 *   - Demo mode blocks all subscription mutations via blockMutation()
 */

import { useSubscription, usePlanLimit, usePlans, formatLimit, type LimitType } from "@/hooks/useSubscription";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { useStripePortal } from "@/hooks/useStripePortal";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle, AlertTriangle, CreditCard, Calendar, TrendingUp, Clock, Shield, Mail, Phone, Banknote, Copy, Check } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useCurrency } from "@/hooks/useCurrency";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Actif", variant: "default" },
  trialing: { label: "Essai gratuit", variant: "secondary" },
  past_due: { label: "En retard", variant: "destructive" },
  grace_period: { label: "Période de grâce", variant: "secondary" },
  read_only: { label: "Lecture seule", variant: "destructive" },
  cancelled: { label: "Annulé", variant: "outline" },
  expired: { label: "Expiré", variant: "destructive" },
};

const DURATION_OPTIONS = [
  { value: "1_month", label: "1 mois" },
  { value: "3_months", label: "3 mois" },
  { value: "6_months", label: "6 mois" },
  { value: "1_year", label: "1 an" },
] as const;

export default function Billing() {
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: plans } = usePlans();
  const { userRole, user } = useAuth();
  const { blockMutation } = useDemo();
  const { currency } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const { checkout, isLoading: isCheckingOut, error: checkoutError, isStripeConfigured } = useStripeCheckout();
  const { openPortal, isLoading: isPortalLoading } = useStripePortal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Manual plan change state
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<string>("1_month");
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [copied, setCopied] = useState(false);

  // SECURITY: Only super_admin can manually change plans — NOT admin
  const isPlatformSuperAdmin = userRole === "super_admin";
  const isTenantAdmin = userRole === "admin";

  // Handle Stripe Checkout return URLs
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    if (checkoutStatus === "success") {
      toast({ title: "Paiement en cours de traitement", description: "Votre abonnement sera activé dans quelques instants." });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      setSearchParams({}, { replace: true });
    } else if (checkoutStatus === "cancelled") {
      toast({ title: "Paiement annulé", description: "Vous n'avez pas été débité.", variant: "destructive" });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, toast, queryClient, setSearchParams]);

  /**
   * handleManualPlanChange — super_admin only
   * Calls the secured RPC admin_update_organization_subscription
   * which enforces is_super_admin() server-side.
   * NO direct subscriptions.update() — all changes go through RPC.
   */
  const handleManualPlanChange = useCallback(async () => {
    // Demo mode: block ALL subscription mutations
    if (blockMutation("Modifier l'abonnement")) return;

    if (!selectedPlan) {
      toast({ title: "Plan requis", description: "Sélectionnez un plan avant de continuer.", variant: "destructive" });
      return;
    }

    setIsChangingPlan(true);
    try {
      // Get organization_id for the target org
      const { data: orgData } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id)
        .single();

      const { data, error } = await supabase.rpc("admin_update_organization_subscription", {
        p_organization_id: orgData?.organization_id,
        p_plan_id: selectedPlan,
        p_duration: selectedDuration,
        p_payment_reference: paymentRef || null,
        p_reason: changeReason || null,
      });

      if (error) return [];

      const result = Array.isArray(data) ? data[0] : data;
      toast({
        title: "Plan mis à jour",
        description: `Plan changé vers ${selectedPlan === "croissance" ? "Croissance" : selectedPlan === "enterprise" ? "Enterprise" : "Starter"} (${selectedDuration}). ${result?.event_type === "upgraded" ? "Upgrade" : result?.event_type === "downgraded" ? "Downgrade" : "Renouvellement"} effectué.`,
      });

      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["plan-limit"] });
      queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      setChangeDialogOpen(false);
      setSelectedPlan("");
      setSelectedDuration("1_month");
      setPaymentRef("");
      setChangeReason("");
    } catch (err: unknown) {
      toast({
        title: "Erreur",
        description: (err instanceof Error ? err.message : String(err)) || "Impossible de modifier l'abonnement.",
        variant: "destructive",
      });
    } finally {
      setIsChangingPlan(false);
    }
  }, [blockMutation, selectedPlan, selectedDuration, paymentRef, changeReason, user, queryClient, toast]);

  /**
   * handleExtendSubscription — super_admin only
   * Extends the current plan by calling the same secured RPC
   * with the current plan_id and a new duration.
   */
  const handleExtendSubscription = useCallback(async (duration: string) => {
    // Demo mode: block ALL subscription mutations
    if (blockMutation("Prolonger l'abonnement")) return;

    if (!subscription?.plan_id) {
      toast({ title: "Aucun plan actif", description: "Aucun abonnement à prolonger.", variant: "destructive" });
      return;
    }

    setIsChangingPlan(true);
    try {
      const { data: orgData } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id)
        .single();

      const { data, error } = await supabase.rpc("admin_update_organization_subscription", {
        p_organization_id: orgData?.organization_id,
        p_plan_id: subscription.plan_id,
        p_duration: duration,
        p_payment_reference: paymentRef || null,
        p_reason: changeReason || "Prolongation manuelle",
      });

      if (error) return [];

      const result = Array.isArray(data) ? data[0] : data;
      toast({
        title: "Abonnement prolongé",
        description: `Plan ${subscription.plan_id} prolongé de ${duration === "1_year" ? "1 an" : duration === "6_months" ? "6 mois" : duration === "3_months" ? "3 mois" : "1 mois"}.`,
      });

      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["plan-limit"] });
    } catch (err: unknown) {
      toast({
        title: "Erreur",
        description: (err instanceof Error ? err.message : String(err)) || "Impossible de prolonger l'abonnement.",
        variant: "destructive",
      });
    } finally {
      setIsChangingPlan(false);
    }
  }, [blockMutation, subscription, paymentRef, changeReason, user, queryClient, toast]);

  // Copy contact info
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (subLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const statusInfo = subscription
    ? STATUS_LABELS[subscription.status] || { label: subscription.status, variant: "outline" as const }
    : { label: "Aucun plan actif", variant: "destructive" as const };

  const planId = subscription?.plan_id || "";
  const currentPlan = plans?.find((p) => p.id === planId);
  const currencySymbol = currency.displaySymbol || currency.symbol;

  return (
    <DashboardLayout>
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Abonnement & Facturation</h1>
          <p className="text-muted-foreground">Gérez votre plan et suivez votre utilisation</p>
        </div>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Plan actuel : {subscription?.plan_name || "Aucun"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Renouvellement : {new Date(subscription.current_period_end).toLocaleDateString("fr-FR")}</span>
              </div>
              {subscription.trial_ends_at && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span>Fin d'essai : {new Date(subscription.trial_ends_at).toLocaleDateString("fr-FR")}</span>
                </div>
              )}
            </div>
          )}

          {/* Subscription Status Warnings */}
          {subscription?.status === "trialing" && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200">
              <Clock className="h-5 w-5 text-blue-500 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Période d'essai en cours</p>
                <p className="text-muted-foreground">
                  Votre essai gratuit se termine le{" "}
                  {subscription.trial_ends_at
                    ? new Date(subscription.trial_ends_at).toLocaleDateString("fr-FR")
                    : subscription.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString("fr-FR")
                    : "bientôt"}{" "}
                  . Choisissez un plan pour continuer à utiliser MakitiPlus.
                </p>
              </div>
            </div>
          )}

          {subscription?.status === "grace_period" && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Période de grâce en cours</p>
                <p className="text-muted-foreground">
                  Votre abonnement a expiré. Mettez à jour votre paiement avant le{" "}
                  {subscription.grace_period_ends_at
                    ? new Date(subscription.grace_period_ends_at).toLocaleDateString("fr-FR")
                    : "bientôt"}{" "}
                  pour éviter le passage en lecture seule.
                </p>
              </div>
            </div>
          )}

          {subscription?.status === "read_only" && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Accès en lecture seule</p>
                <p className="text-muted-foreground">
                  Votre abonnement a expiré. Vous pouvez consulter vos données mais pas créer de ventes.
                  Mettez à jour votre paiement pour retrouver l'accès complet.
                </p>
              </div>
            </div>
          )}

          {/* Enterprise plan active indicator */}
          {planId === "enterprise" && subscription?.status === "active" && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200">
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Plan Enterprise actif</p>
                <p className="text-muted-foreground">
                  Vous avez accès à toutes les fonctionnalités : boutiques illimitées, assistant IA, analytics multi-magasins, API et support prioritaire.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Counters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Utilisation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageBar label="Boutiques" limitType="stores" />
          <UsageBar label="Utilisateurs" limitType="users" />
          <UsageBar label="Produits" limitType="products" />
        </CardContent>
      </Card>

      {/* ─── Tenant Admin: Payment Info Card ─────────────────────── */}
      {/* Admin can see how to pay, but CANNOT change the plan directly */}
      {isTenantAdmin && !isPlatformSuperAdmin && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Phone className="h-5 w-5" />
              Comment upgrader votre plan
            </CardTitle>
            <CardDescription className="text-blue-600/70 dark:text-blue-400/70">
              Pour passer à un plan supérieur, contactez l'équipe MakitiPlus.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded bg-background">
                <Phone className="h-4 w-4 text-green-600 shrink-0" />
                <div>
                  <span className="font-medium">Mobile Money (Orange Money / MTN)</span>
                  <p className="text-xs text-muted-foreground">Envoyez le montant au numéro MakitiPlus et communiquez la référence.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-background">
                <Banknote className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-medium">Paiement en espèces</span>
                  <p className="text-xs text-muted-foreground">Rendez-vous au bureau MakitiPlus le plus proche avec votre référence organisation.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-background">
                <CreditCard className="h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <span className="font-medium">Virement bancaire</span>
                  <p className="text-xs text-muted-foreground">Contactez support@makitiplus.com pour les coordonnées bancaires.</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-2 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>contact@makitiplus.com</span>
                <button onClick={() => handleCopy("contact@makitiplus.com")} className="text-muted-foreground hover:text-foreground">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>+224 620 00 00 00</span>
              </div>
            </div>
            {isStripeConfigured && (
              <p className="text-xs text-muted-foreground pt-2 border-t">
                Vous pouvez aussi payer en ligne via Stripe en utilisant les boutons ci-dessous.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Super Admin: Manual Plan Change Card ────────────────── */}
      {/* Only super_admin can see and use manual plan change controls */}
      {isPlatformSuperAdmin && (
        <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <Shield className="h-5 w-5" />
              Gestion manuelle des abonnements (Super Admin)
            </CardTitle>
            <CardDescription className="text-purple-600/70 dark:text-purple-400/70">
              Changez de plan ou prolongez un abonnement. Toute modification est enregistrée dans le journal d'audit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Change Plan — with Dialog */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">Changer le plan</h4>
                <p className="text-sm text-muted-foreground">
                  Sélectionnez un plan et une durée pour mettre à jour l'abonnement.
                </p>
              </div>
              <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-purple-300 hover:bg-purple-100">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Changer le plan
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Changer le plan</DialogTitle>
                    <DialogDescription>
                      Sélectionnez le plan et la durée souhaités. L'abonnement sera mis à jour via le RPC sécurisé.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Plan</label>
                      <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir un plan" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="starter">Starter — Gratuit</SelectItem>
                          <SelectItem value="croissance">Croissance — 39,90 EUR/mois</SelectItem>
                          <SelectItem value="enterprise">Enterprise — 99,90 EUR/mois</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Durée</label>
                      <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DURATION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Référence paiement (optionnel)</label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="ex: MM-20260705-001"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Motif (optionnel)</label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="ex: Paiement Mobile Money reçu"
                        value={changeReason}
                        onChange={(e) => setChangeReason(e.target.value)}
                      />
                    </div>
                    {selectedPlan && (
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <p className="font-medium">
                          {selectedPlan === "starter" ? "Starter" : selectedPlan === "croissance" ? "Croissance" : "Enterprise"}
                          {" — "}
                          {selectedDuration === "1_year"
                            ? selectedPlan === "croissance" ? "399,00 EUR/an" : selectedPlan === "enterprise" ? "999,00 EUR/an" : "Gratuit"
                            : selectedPlan === "croissance" ? "39,90 EUR/mois" : selectedPlan === "enterprise" ? "99,90 EUR/mois" : "Gratuit"
                          }
                        </p>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setChangeDialogOpen(false)}>Annuler</Button>
                    <Button onClick={handleManualPlanChange} disabled={!selectedPlan || isChangingPlan} className="bg-purple-600 hover:bg-purple-700">
                      {isChangingPlan ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Confirmer le changement
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Extend Subscription */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">Prolonger l'abonnement</h4>
                <p className="text-sm text-muted-foreground">
                  Prolongez l'abonnement actuel ({planId === "enterprise" ? "Enterprise" : planId === "croissance" ? "Croissance" : "Starter"}).
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExtendSubscription("1_month")} disabled={isChangingPlan}>
                  {isChangingPlan ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  +1 mois
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExtendSubscription("3_months")} disabled={isChangingPlan}>
                  +3 mois
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExtendSubscription("1_year")} disabled={isChangingPlan}>
                  +1 an
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Toute modification est enregistrée dans le journal d'audit (subscription_events) et nécessite le rôle super_admin côté serveur.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Manage Subscription — Stripe (when configured) */}
      {(subscription?.status === "active" || subscription?.status === "trialing") && isStripeConfigured && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">Gérer votre abonnement</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Modifiez votre moyen de paiement, consultez l'historique de facturation ou annulez votre abonnement.
              </p>
            </div>
            <Button variant="outline" onClick={() => { if (blockMutation("Gérer l'abonnement")) return; openPortal(); }} disabled={isPortalLoading}>
              {isPortalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Gérer mon abonnement
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Non-admin: Contact to upgrade */}
      {!isPlatformSuperAdmin && !isTenantAdmin && !isStripeConfigured && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">Améliorer votre plan</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Contactez votre administrateur pour changer de plan ou activer des fonctionnalités supplémentaires.
              </p>
            </div>
            <Button variant="outline" onClick={() => handleCopy("contact@makitiplus.com")}>
              <Mail className="h-4 w-4 mr-2" />
              {copied ? "Copié !" : "Nous contacter"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stripe Checkout for upgrade */}
      {isStripeConfigured && !subscription && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">Choisissez un plan pour commencer</h3>
              <p className="text-sm text-muted-foreground mt-1">
                À partir de 39,90 EUR/mois — POS, gestion stock, clients à crédit
              </p>
            </div>
            <Button size="lg" onClick={() => { if (blockMutation("Souscrire au plan")) return; checkout("croissance"); }} disabled={isCheckingOut}>
              {isCheckingOut ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Commencer
            </Button>
          </CardContent>
        </Card>
      )}
      {isStripeConfigured && planId === "croissance" && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">
                Passez à Enterprise pour boutiques illimitées, API et support prioritaire
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                99,90 EUR/mois — Boutiques et utilisateurs illimités, assistant IA, programme fidélité
              </p>
            </div>
            <Button size="lg" onClick={() => { if (blockMutation("Souscrire au plan")) return; checkout("enterprise"); }} disabled={isCheckingOut}>
              {isCheckingOut ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Upgrader
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Checkout Error */}
      {checkoutError && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-destructive">{checkoutError}</p>
          </div>
        </div>
      )}

      {/* All Plans Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Comparer les plans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4">Fonctionnalité</th>
                  {plans?.map((plan) => (
                    <th key={plan.id} className="text-center py-2 px-2">
                      <div className="font-semibold">{plan.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {plan.price_monthly === 0 ? "Gratuit" : `${plan.price_monthly.toFixed(2).replace('.00', '')} EUR/mois`}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <PlanFeatureRow label="Boutiques" plans={plans} getValue={(p) => p.max_stores === null ? "Infini" : String(p.max_stores)} />
                <PlanFeatureRow label="Utilisateurs" plans={plans} getValue={(p) => p.max_users === null ? "Infini" : String(p.max_users)} />
                <PlanFeatureRow label="Produits" plans={plans} getValue={(p) => p.max_products === null ? "Infini" : String(p.max_products)} />
                <PlanFeatureRow label="Rapports avancés" plans={plans} getValue={(p) => p.has_advanced_reports} />
                <PlanFeatureRow label="Exports PDF/Excel" plans={plans} getValue={(p) => p.has_exports} />
                <PlanFeatureRow label="Fournisseurs" plans={plans} getValue={(p) => p.has_supplier_management} />
                <PlanFeatureRow label="Offline avancé" plans={plans} getValue={(p) => p.has_offline_advanced} />
                <PlanFeatureRow label="Branding personnalisé" plans={plans} getValue={(p) => p.has_custom_branding} />
                <PlanFeatureRow label="Multi-devises" plans={plans} getValue={(p) => p.has_multi_currency} />
                <PlanFeatureRow label="API externe" plans={plans} getValue={(p) => p.has_api_access} />
                <PlanFeatureRow label="Support prioritaire" plans={plans} getValue={(p) => p.has_priority_support} />
                <PlanFeatureRow label="Assistant IA" plans={plans} getValue={(p) => p.has_ai_assistant} />
                <PlanFeatureRow label="Programme fidélité" plans={plans} getValue={(p) => p.has_loyalty_program} />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}

// ─── UsageBar Component ──────────────────────────────────────

function UsageBar({ label, limitType }: { label: string; limitType: LimitType }) {
  const { data: limitCheck, isLoading } = usePlanLimit(limitType);

  if (isLoading || !limitCheck) {
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>{label}</span>
          <span className="text-muted-foreground">Chargement...</span>
        </div>
        <Progress value={0} className="h-2" />
      </div>
    );
  }

  const percentage = limitCheck.limit_value
    ? Math.min((limitCheck.current_count / limitCheck.limit_value) * 100, 100)
    : 0;
  const isNearLimit = limitCheck.limit_value !== null && percentage >= 80;
  const isAtLimit = !limitCheck.allowed;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className={isAtLimit ? "text-destructive font-medium" : isNearLimit ? "text-amber-500" : "text-muted-foreground"}>
          {formatLimit(limitCheck.current_count, limitCheck.limit_value)}
        </span>
      </div>
      <Progress
        value={percentage}
        className={`h-2 ${isAtLimit ? "[&>div]:bg-destructive" : isNearLimit ? "[&>div]:bg-amber-500" : ""}`}
      />
    </div>
  );
}

// ─── PlanFeatureRow Component ────────────────────────────────

function PlanFeatureRow({
  label,
  plans,
  getValue,
}: {
  label: string;
  plans: { id: string; name: string; price_monthly: number; max_stores: number | null; max_users: number | null; max_products: number | null; has_advanced_reports: boolean; has_exports: boolean; has_supplier_management: boolean; has_offline_advanced: boolean; has_custom_branding: boolean; has_multi_currency: boolean; has_api_access: boolean; has_priority_support: boolean; has_ai_assistant: boolean; has_loyalty_program: boolean }[] | undefined;
  getValue: (plan: NonNullable<typeof plans>[0]) => boolean | string;
}) {
  if (!plans) return null;

  return (
    <tr className="border-b">
      <td className="py-2 pr-4">{label}</td>
      {plans.map((plan) => {
        const value = getValue(plan);
        return (
          <td key={plan.id} className="text-center py-2 px-2">
            {typeof value === "boolean" ? (
              value ? (
                <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
              ) : (
                <span className="text-muted-foreground/40">—</span>
              )
            ) : (
              <span>{value}</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
