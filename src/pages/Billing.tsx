/**
 * Billing Page — Manage subscription and view usage
 *
 * Shows current plan, usage counters, and manual plan management.
 * Supports both Stripe (when configured) and manual plan changes
 * via SQL for markets like Guinea (Mobile Money + cash).
 */

import { useSubscription, usePlanLimit, usePlans, formatLimit, type LimitType } from "@/hooks/useSubscription";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { useStripePortal } from "@/hooks/useStripePortal";
import { useDemo } from "@/contexts/DemoContext";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminRole } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
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
import { Loader2, CheckCircle, AlertTriangle, CreditCard, Calendar, TrendingUp, Clock, Shield, Mail, Phone, Copy, Check } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Actif", variant: "default" },
  trialing: { label: "Essai gratuit", variant: "secondary" },
  past_due: { label: "En retard", variant: "destructive" },
  grace_period: { label: "Periode de grace", variant: "secondary" },
  read_only: { label: "Lecture seule", variant: "destructive" },
  cancelled: { label: "Annule", variant: "outline" },
  expired: { label: "Expire", variant: "destructive" },
};

export default function Billing() {
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: plans } = usePlans();
  const { blockMutation } = useDemo();
  const { currency } = useCurrency();
  const { userRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { checkout, isLoading: isCheckingOut, error: checkoutError, isStripeConfigured } = useStripeCheckout();
  const { openPortal, isLoading: isPortalLoading } = useStripePortal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Manual plan change state
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<"1month" | "1year">("1month");
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isAdmin = userRole ? isAdminRole(userRole) : false;

  // Handle Stripe Checkout return URLs
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    if (checkoutStatus === "success") {
      toast({ title: "Paiement en cours de traitement", description: "Votre abonnement sera active dans quelques instants." });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      setSearchParams({}, { replace: true });
    } else if (checkoutStatus === "cancelled") {
      toast({ title: "Paiement annule", description: "Vous n'avez pas ete debite.", variant: "destructive" });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, toast, queryClient, setSearchParams]);

  // Manual plan change handler
  const handleManualPlanChange = async () => {
    if (!selectedPlan) return;
    setIsChangingPlan(true);
    try {
      const durationInterval = selectedDuration === "1year" ? "1 year" : "1 month";
      const { error } = await supabase.rpc("update_organization_subscription", {
        p_plan_id: selectedPlan,
        p_status: "active",
        p_duration: durationInterval,
      });

      if (error) {
        // Fallback: direct update via subscription table
        logger.warn("[Billing] RPC update_organization_subscription failed, using direct update:", error.message);

        const { data: orgData } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
          .single();

        if (orgData?.organization_id) {
          const { error: updateError } = await supabase
            .from("subscriptions")
            .update({
              plan_id: selectedPlan,
              status: "active",
              current_period_start: new Date().toISOString(),
              current_period_end: selectedDuration === "1year"
                ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .eq("organization_id", orgData.organization_id);

          if (updateError) throw updateError;
        }
      }

      toast({
        title: "Plan mis a jour",
        description: `Votre plan a ete change vers ${selectedPlan === "croissance" ? "Croissance" : selectedPlan === "enterprise" ? "Enterprise" : "Starter"}.`,
      });

      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["plan-limit"] });
      queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      setChangeDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du changement de plan.";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setIsChangingPlan(false);
    }
  };

  // Extend subscription handler
  const handleExtendSubscription = async () => {
    setIsChangingPlan(true);
    try {
      const { data: orgData } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (orgData?.organization_id) {
        const { error } = await supabase
          .from("subscriptions")
          .update({
            current_period_end: selectedDuration === "1year"
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            status: "active",
          })
          .eq("organization_id", orgData.organization_id);

        if (error) throw error;
      }

      toast({ title: "Abonnement prolonge", description: `Votre abonnement a ete prolonge de ${selectedDuration === "1year" ? "1 an" : "1 mois"}.` });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de la prolongation.";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setIsChangingPlan(false);
    }
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Abonnement & Facturation</h1>
          <p className="text-muted-foreground">Gerez votre plan et suivez votre utilisation</p>
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
                <p className="font-medium">Periode d'essai en cours</p>
                <p className="text-muted-foreground">
                  Votre essai gratuit se termine le{" "}
                  {subscription.trial_ends_at
                    ? new Date(subscription.trial_ends_at).toLocaleDateString("fr-FR")
                    : subscription.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString("fr-FR")
                    : "bientot"}{" "}
                  . Choisissez un plan pour continuer a utiliser MakitiPlus.
                </p>
              </div>
            </div>
          )}

          {subscription?.status === "grace_period" && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Periode de grace en cours</p>
                <p className="text-muted-foreground">
                  Votre abonnement a expire. Mettez a jour votre paiement avant le{" "}
                  {subscription.grace_period_ends_at
                    ? new Date(subscription.grace_period_ends_at).toLocaleDateString("fr-FR")
                    : "bientot"}{" "}
                  pour eviter le passage en lecture seule.
                </p>
              </div>
            </div>
          )}

          {subscription?.status === "read_only" && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Acces en lecture seule</p>
                <p className="text-muted-foreground">
                  Votre abonnement a expire. Vous pouvez consulter vos donnees mais pas creer de ventes.
                  Mettez a jour votre paiement pour retrouver l'acces complet.
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
                  Vous avez acces a toutes les fonctionnalites : boutiques illimitees, assistant IA, analytics multi-magasins, API et support prioritaire.
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

      {/* Manage Subscription — Admin Manual Management (no Stripe) */}
      {isAdmin && !isStripeConfigured && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Gestion de l'abonnement
            </CardTitle>
            <CardDescription>
              Changez de plan ou prolongez votre abonnement. Les paiements se font par Mobile Money ou espece.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Change Plan */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">Changer de plan</h4>
                <p className="text-sm text-muted-foreground">
                  Selectionnez un plan et une duree pour mettre a jour votre abonnement.
                </p>
              </div>
              <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Changer le plan
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Changer le plan</DialogTitle>
                    <DialogDescription>
                      Selectionnez le plan et la duree souhaites. Votre abonnement sera mis a jour immediatement.
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
                          <SelectItem value="starter">Essai gratuit (14 jours)</SelectItem>
                          <SelectItem value="croissance">Croissance — 39,90 EUR/mois</SelectItem>
                          <SelectItem value="enterprise">Enterprise — 99,90 EUR/mois</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Duree</label>
                      <Select value={selectedDuration} onValueChange={(v) => setSelectedDuration(v as "1month" | "1year")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1month">1 mois</SelectItem>
                          <SelectItem value="1year">1 an (economisez 2 mois)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedPlan && (
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <p className="font-medium">
                          {selectedPlan === "starter" ? "Essai gratuit" : selectedPlan === "croissance" ? "Croissance" : "Enterprise"}
                          {" — "}
                          {selectedDuration === "1year"
                            ? selectedPlan === "croissance" ? "399,00 EUR/an" : selectedPlan === "enterprise" ? "999,00 EUR/an" : "Gratuit"
                            : selectedPlan === "croissance" ? "39,90 EUR/mois" : selectedPlan === "enterprise" ? "99,90 EUR/mois" : "Gratuit"
                          }
                        </p>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setChangeDialogOpen(false)}>Annuler</Button>
                    <Button onClick={handleManualPlanChange} disabled={!selectedPlan || isChangingPlan}>
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
                  Prolongez votre abonnement actuel ({planId === "enterprise" ? "Enterprise" : planId === "croissance" ? "Croissance" : "Starter"}).
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setSelectedDuration("1month"); handleExtendSubscription(); }} disabled={isChangingPlan}>
                  {isChangingPlan ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  +1 mois
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setSelectedDuration("1year"); handleExtendSubscription(); }} disabled={isChangingPlan}>
                  +1 an
                </Button>
              </div>
            </div>

            {/* Contact for Payment */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">Paiement par Mobile Money ou espece</h4>
                <p className="text-sm text-muted-foreground">
                  Contactez-nous pour finaliser votre paiement via Orange Money, MTN Money ou en espece.
                </p>
              </div>
              <div className="flex flex-col gap-2">
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manage Subscription — Stripe (when configured) */}
      {(subscription?.status === "active" || subscription?.status === "trialing") && isStripeConfigured && (
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">Gerer votre abonnement</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Modifiez votre moyen de paiement, consultez l'historique de facturation ou annulez votre abonnement.
              </p>
            </div>
            <Button variant="outline" onClick={() => { if (blockMutation("Gerer l'abonnement")) return; openPortal(); }} disabled={isPortalLoading}>
              {isPortalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Gerer mon abonnement
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Non-admin: Contact to upgrade */}
      {!isAdmin && !isStripeConfigured && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">Ameliorer votre plan</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Contactez votre administrateur pour changer de plan ou activer des fonctionnalites supplementaires.
              </p>
            </div>
            <Button variant="outline" onClick={() => handleCopy("contact@makitiplus.com")}>
              <Mail className="h-4 w-4 mr-2" />
              {copied ? "Copie !" : "Nous contacter"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stripe Checkout for upgrade */}
      {isStripeConfigured && !subscription && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">Choisissez un plan pour commencer</h3>
              <p className="text-sm text-muted-foreground mt-1">
                A partir de 39,90 EUR/mois — POS, gestion stock, clients a credit
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
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">
                Passez a Enterprise pour boutiques illimitees, API et support prioritaire
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                99,90 EUR/mois — Boutiques et utilisateurs illimites, assistant IA, programme fidelite
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
                  <th className="text-left py-2 pr-4">Fonctionnalite</th>
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
                <PlanFeatureRow label="Rapports avances" plans={plans} getValue={(p) => p.has_advanced_reports} />
                <PlanFeatureRow label="Exports PDF/Excel" plans={plans} getValue={(p) => p.has_exports} />
                <PlanFeatureRow label="Fournisseurs" plans={plans} getValue={(p) => p.has_supplier_management} />
                <PlanFeatureRow label="Offline avance" plans={plans} getValue={(p) => p.has_offline_advanced} />
                <PlanFeatureRow label="Branding personnalise" plans={plans} getValue={(p) => p.has_custom_branding} />
                <PlanFeatureRow label="Multi-devises" plans={plans} getValue={(p) => p.has_multi_currency} />
                <PlanFeatureRow label="API externe" plans={plans} getValue={(p) => p.has_api_access} />
                <PlanFeatureRow label="Support prioritaire" plans={plans} getValue={(p) => p.has_priority_support} />
                <PlanFeatureRow label="Assistant IA" plans={plans} getValue={(p) => p.has_ai_assistant} />
                <PlanFeatureRow label="Programme fidelite" plans={plans} getValue={(p) => p.has_loyalty_program} />
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
