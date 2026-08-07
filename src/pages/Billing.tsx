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

import { useTranslation } from "react-i18next";
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
import { Loader2, CheckCircle, AlertTriangle, CreditCard, Calendar, TrendingUp, Clock, Shield, Mail, Phone, Banknote, Copy, Check, Building2, Store } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useCurrency } from "@/hooks/useCurrency";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  trialing: "secondary",
  past_due: "destructive",
  grace_period: "secondary",
  read_only: "destructive",
  cancelled: "outline",
  expired: "destructive",
};

const DURATION_VALUES = ["1_month", "3_months", "6_months", "1_year"] as const;

export default function Billing() {
  const { t } = useTranslation("billing");
  const getStatusLabel = (status: string) => t(`statusLabels.${status}`, { defaultValue: status });
  const getStatusVariant = (status: string) => STATUS_VARIANTS[status] || "outline";
  const DURATION_OPTIONS = DURATION_VALUES.map((value) => ({ value, label: t(`durationOptions.${value}`) }));
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: plans } = usePlans();
  const { userRole, user } = useAuth();
  const { blockMutation } = useDemo();
  useCurrency();
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

  // Super admin: sélection d'une organisation cible
  const [targetOrgId, setTargetOrgId] = useState<string>("");

  // SECURITY: Only super_admin can manually change plans — NOT admin
  const isPlatformSuperAdmin = userRole === "super_admin";
  const isTenantAdmin = userRole === "admin";

  // Fetch toutes les organisations + leurs abonnements (super_admin seulement)
  const { data: allOrgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ["all-orgs-with-subs"],
    enabled: isPlatformSuperAdmin,
    queryFn: async () => {
      // 1. Toutes les organisations
      const { data: orgs, error: orgsError } = await supabase
        .from("organizations")
        .select("id, name, owner_user_id, created_at")
        .order("created_at", { ascending: false });
      if (orgsError) throw orgsError;
      if (!orgs || orgs.length === 0) return [];

      // 2. Tous les abonnements de ces orgs
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("organization_id, plan_id, status, current_period_end")
        .in("organization_id", orgs.map((o) => o.id));

      // 3. Tous les stores de ces orgs (pour afficher le nombre de magasins)
      const { data: stores } = await supabase
        .from("stores")
        .select("organization_id, id, name")
        .in("organization_id", orgs.map((o) => o.id));

      // 4. Fusionner
      return orgs.map((org) => {
        const sub = subs?.find((s) => s.organization_id === org.id);
        const orgStores = stores?.filter((s) => s.organization_id === org.id) || [];
        return {
          id: org.id,
          name: org.name,
          created_at: org.created_at,
          plan_id: sub?.plan_id || "starter",
          status: sub?.status || "active",
          current_period_end: sub?.current_period_end,
          stores_count: orgStores.length,
          stores: orgStores.map((s) => ({ id: s.id, name: s.name })),
        };
      });
    },
  });

  // L'org cible pour les actions (super_admin = org sélectionnée, admin = son org)
  const effectiveTargetOrgId = isPlatformSuperAdmin
    ? targetOrgId || (allOrgs[0]?.id ?? "")
    : null; // sera résolu via profile pour admin

  // Handle Stripe Checkout return URLs
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    if (checkoutStatus === "success") {
      toast({ title: t("toasts.paymentProcessingTitle"), description: t("toasts.paymentProcessingDescription") });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      setSearchParams({}, { replace: true });
    } else if (checkoutStatus === "cancelled") {
      toast({ title: t("toasts.paymentCancelledTitle"), description: t("toasts.paymentCancelledDescription"), variant: "destructive" });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, toast, queryClient, setSearchParams, t]);

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
      toast({ title: t("toasts.planRequiredTitle"), description: t("toasts.planRequiredDescription"), variant: "destructive" });
      return;
    }

    // Super_admin doit sélectionner une org cible
    if (isPlatformSuperAdmin && !effectiveTargetOrgId) {
      toast({ title: t("toasts.orgRequiredTitle"), description: t("toasts.orgRequiredDescriptionChange"), variant: "destructive" });
      return;
    }

    setIsChangingPlan(true);
    try {
      // Pour super_admin : utiliser l'org sélectionnée. Pour admin : son propre org.
      const orgIdToUse = isPlatformSuperAdmin
        ? effectiveTargetOrgId
        : (await supabase
            .from("profiles")
            .select("organization_id")
            .eq("user_id", user?.id ?? "")
            .single()
          ).data?.organization_id;

      if (!orgIdToUse) {
        toast({ title: t("toasts.genericErrorTitle"), description: t("toasts.orgNotFoundError"), variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.rpc("admin_update_organization_subscription", {
        p_organization_id: orgIdToUse,
        p_plan_id: selectedPlan,
        p_duration: selectedDuration,
        p_payment_reference: paymentRef || undefined,
        p_reason: changeReason || undefined,
      });

      if (error) {
        toast({ title: t("toasts.genericErrorTitle"), description: error.message, variant: "destructive" });
        return;
      }

      const result = (Array.isArray(data) ? data[0] : data) as unknown as { event_type?: string } | undefined;
      const planLabel = selectedPlan === "croissance" ? t("superAdmin.planNameCroissance") : selectedPlan === "enterprise" ? t("superAdmin.planNameEnterprise") : selectedPlan === "pilot_national" ? t("superAdmin.planNamePilotNational") : t("superAdmin.planNameStarter");
      const targetOrgName = allOrgs.find((o) => o.id === orgIdToUse)?.name || "Organisation";
      const eventLabel = result?.event_type === "upgraded" ? t("toasts.eventUpgraded") : result?.event_type === "downgraded" ? t("toasts.eventDowngraded") : t("toasts.eventRenewed");
      toast({
        title: t("toasts.planUpdatedTitle"),
        description: t("toasts.planUpdatedDescription", { org: targetOrgName, plan: planLabel, duration: selectedDuration, eventType: eventLabel }),
      });

      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["plan-limit"] });
      queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      queryClient.invalidateQueries({ queryKey: ["all-orgs-with-subs"] });
      setChangeDialogOpen(false);
      setSelectedPlan("");
      setSelectedDuration("1_month");
      setPaymentRef("");
      setChangeReason("");
    } catch (err: unknown) {
      toast({
        title: t("toasts.genericErrorTitle"),
        description: (err instanceof Error ? err.message : String(err)) || t("toasts.planUpdateErrorFallback"),
        variant: "destructive",
      });
    } finally {
      setIsChangingPlan(false);
    }
  }, [blockMutation, selectedPlan, selectedDuration, paymentRef, changeReason, user, queryClient, toast, isPlatformSuperAdmin, effectiveTargetOrgId, allOrgs, t]);

  /**
   * handleExtendSubscription — super_admin only
   * Extends the current plan by calling the same secured RPC
   * with the current plan_id and a new duration.
   */
  const handleExtendSubscription = useCallback(async (duration: string) => {
    // Demo mode: block ALL subscription mutations
    if (blockMutation("Prolonger l'abonnement")) return;

    // Pour super_admin : utiliser le plan de l'org sélectionnée.
    // Pour admin : utiliser son propre plan.
    let planId: string | undefined;
    let orgIdToUse: string | null | undefined;

    if (isPlatformSuperAdmin) {
      if (!effectiveTargetOrgId) {
        toast({ title: t("toasts.orgRequiredTitle"), description: t("toasts.orgRequiredDescriptionExtend"), variant: "destructive" });
        return;
      }
      orgIdToUse = effectiveTargetOrgId;
      planId = allOrgs.find((o) => o.id === effectiveTargetOrgId)?.plan_id;
    } else {
      if (!subscription?.plan_id) {
        toast({ title: t("toasts.noActivePlanTitle"), description: t("toasts.noActivePlanDescription"), variant: "destructive" });
        return;
      }
      planId = subscription.plan_id;
      const { data: orgData } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user?.id ?? "")
        .single();
      orgIdToUse = orgData?.organization_id;
    }

    if (!planId || !orgIdToUse) {
      toast({ title: t("toasts.genericErrorTitle"), description: t("toasts.planOrOrgNotFoundError"), variant: "destructive" });
      return;
    }

    setIsChangingPlan(true);
    try {
      const { error } = await supabase.rpc("admin_update_organization_subscription", {
        p_organization_id: orgIdToUse,
        p_plan_id: planId,
        p_duration: duration,
        p_payment_reference: paymentRef || undefined,
        p_reason: changeReason || t("toasts.manualPlanChangeReason"),
      });

      if (error) {
        toast({ title: t("toasts.genericErrorTitle"), description: error.message, variant: "destructive" });
        return;
      }

      const targetOrgName = isPlatformSuperAdmin
        ? allOrgs.find((o) => o.id === orgIdToUse)?.name || "Organisation"
        : "";
      toast({
        title: t("toasts.subscriptionExtendedTitle"),
        description: t("toasts.subscriptionExtendedDescription", {
          orgPrefix: isPlatformSuperAdmin ? `"${targetOrgName}" — ` : "",
          plan: planId,
          duration: t(`durationOptions.${duration}`, { defaultValue: duration }),
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["plan-limit"] });
      queryClient.invalidateQueries({ queryKey: ["all-orgs-with-subs"] });
    } catch (err: unknown) {
      toast({
        title: t("toasts.genericErrorTitle"),
        description: (err instanceof Error ? err.message : String(err)) || t("toasts.subscriptionExtendErrorFallback"),
        variant: "destructive",
      });
    } finally {
      setIsChangingPlan(false);
    }
  }, [blockMutation, subscription, paymentRef, changeReason, user, queryClient, toast, isPlatformSuperAdmin, effectiveTargetOrgId, allOrgs, t]);

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
    ? { label: getStatusLabel(subscription.status), variant: getStatusVariant(subscription.status) }
    : { label: t("statusLabels.noActivePlan"), variant: "destructive" as const };

  const planId = subscription?.plan_id || "";

  return (
    <DashboardLayout>
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t("currentPlan.cardTitle", { planName: subscription?.plan_name || t("currentPlan.noneLabel") })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{t("currentPlan.renewalDate", { date: new Date(subscription.current_period_end).toLocaleDateString("fr-FR") })}</span>
              </div>
              {subscription.trial_ends_at && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span>{t("currentPlan.trialEndsAt", { date: new Date(subscription.trial_ends_at).toLocaleDateString("fr-FR") })}</span>
                </div>
              )}
            </div>
          )}

          {/* Subscription Status Warnings */}
          {subscription?.status === "trialing" && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200">
              <Clock className="h-5 w-5 text-blue-500 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">{t("currentPlan.trialWarningTitle")}</p>
                <p className="text-muted-foreground">
                  {t("currentPlan.trialWarningDescription", {
                    date: subscription.trial_ends_at
                      ? new Date(subscription.trial_ends_at).toLocaleDateString("fr-FR")
                      : subscription.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString("fr-FR")
                      : t("currentPlan.soon"),
                  })}
                </p>
              </div>
            </div>
          )}

          {subscription?.status === "grace_period" && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">{t("currentPlan.graceWarningTitle")}</p>
                <p className="text-muted-foreground">
                  {t("currentPlan.graceWarningDescription", {
                    date: subscription.grace_period_ends_at
                      ? new Date(subscription.grace_period_ends_at).toLocaleDateString("fr-FR")
                      : t("currentPlan.soon"),
                  })}
                </p>
              </div>
            </div>
          )}

          {subscription?.status === "read_only" && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div className="text-sm">
                <p className="font-medium">{t("currentPlan.readOnlyWarningTitle")}</p>
                <p className="text-muted-foreground">
                  {t("currentPlan.readOnlyWarningDescription")}
                </p>
              </div>
            </div>
          )}

          {/* Enterprise plan active indicator */}
          {planId === "enterprise" && subscription?.status === "active" && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200">
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">{t("currentPlan.enterpriseActiveTitle")}</p>
                <p className="text-muted-foreground">
                  {t("currentPlan.enterpriseActiveDescription")}
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
            {t("usage.cardTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageBar label={t("usage.stores")} limitType="stores" />
          <UsageBar label={t("usage.users")} limitType="users" />
          <UsageBar label={t("usage.products")} limitType="products" />
        </CardContent>
      </Card>

      {/* ─── Tenant Admin: Payment Info Card ─────────────────────── */}
      {/* Admin can see how to pay, but CANNOT change the plan directly */}
      {isTenantAdmin && !isPlatformSuperAdmin && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Phone className="h-5 w-5" />
              {t("tenantAdminPayment.cardTitle")}
            </CardTitle>
            <CardDescription className="text-blue-600/70 dark:text-blue-400/70">
              {t("tenantAdminPayment.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded bg-background">
                <Phone className="h-4 w-4 text-green-600 shrink-0" />
                <div>
                  <span className="font-medium">{t("tenantAdminPayment.mobileMoneyLabel")}</span>
                  <p className="text-xs text-muted-foreground">{t("tenantAdminPayment.mobileMoneyDescription")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-background">
                <Banknote className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-medium">{t("tenantAdminPayment.cashLabel")}</span>
                  <p className="text-xs text-muted-foreground">{t("tenantAdminPayment.cashDescription")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-background">
                <CreditCard className="h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <span className="font-medium">{t("tenantAdminPayment.bankTransferLabel")}</span>
                  <p className="text-xs text-muted-foreground">{t("tenantAdminPayment.bankTransferDescription")}</p>
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
                {t("tenantAdminPayment.stripeNote")}
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
              {t("superAdmin.cardTitle")}
            </CardTitle>
            <CardDescription className="text-purple-600/70 dark:text-purple-400/70">
              {t("superAdmin.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Sélecteur d'organisation cible (super_admin) */}
            <div className="space-y-3 p-4 bg-background border-2 border-purple-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-600" />
                <label className="text-sm font-medium">{t("superAdmin.targetOrgLabel")}</label>
              </div>
              <Select value={effectiveTargetOrgId ?? undefined} onValueChange={setTargetOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder={orgsLoading ? t("superAdmin.orgSelectLoading") : t("superAdmin.orgSelectPlaceholder")} />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {allOrgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      <span className="flex items-center gap-2">
                        <Store className="h-3 w-3 text-purple-500" />
                        <span className="font-medium">{org.name}</span>
                        <Badge variant="outline" className="text-xs ml-1 capitalize">
                          {org.plan_id}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {t("superAdmin.storeCount", { count: org.stores_count })}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Détails de l'org sélectionnée */}
              {effectiveTargetOrgId && (() => {
                const selectedOrg = allOrgs.find((o) => o.id === effectiveTargetOrgId);
                if (!selectedOrg) return null;
                return (
                  <div className="mt-2 p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-md border border-purple-100">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-medium">{selectedOrg.name}</span>
                      <Badge variant="outline" className="capitalize">{selectedOrg.plan_id}</Badge>
                      <Badge variant={getStatusVariant(selectedOrg.status)}>
                        {getStatusLabel(selectedOrg.status)}
                      </Badge>
                      {selectedOrg.current_period_end && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t("superAdmin.expiresOn", { date: new Date(selectedOrg.current_period_end).toLocaleDateString("fr-FR") })}
                        </span>
                      )}
                    </div>
                    {selectedOrg.stores.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selectedOrg.stores.map((s) => (
                          <span key={s.id} className="text-xs px-2 py-0.5 bg-muted rounded">
                            <Store className="h-3 w-3 inline mr-1" />
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Change Plan — with Dialog */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">{t("superAdmin.changePlanTitle")}</h4>
                <p className="text-sm text-muted-foreground">
                  {t("superAdmin.changePlanDescription")}
                </p>
              </div>
              <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-purple-300 hover:bg-purple-100">
                    <CreditCard className="h-4 w-4 mr-2" />
                    {t("superAdmin.changePlanButton")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("superAdmin.dialogTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("superAdmin.dialogDescription")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("superAdmin.planLabel")}</label>
                      <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("superAdmin.planChoicePlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="starter">{t("superAdmin.planStarter")}</SelectItem>
                          <SelectItem value="pilot_national">{t("superAdmin.planPilotNational")}</SelectItem>
                          <SelectItem value="croissance">{t("superAdmin.planCroissance")}</SelectItem>
                          <SelectItem value="enterprise">{t("superAdmin.planEnterprise")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("superAdmin.durationLabel")}</label>
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
                      <label className="text-sm font-medium">{t("superAdmin.paymentRefLabel")}</label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder={t("superAdmin.paymentRefPlaceholder")}
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("superAdmin.reasonLabel")}</label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder={t("superAdmin.reasonPlaceholder")}
                        value={changeReason}
                        onChange={(e) => setChangeReason(e.target.value)}
                      />
                    </div>
                    {selectedPlan && (
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <p className="font-medium">
                          {selectedPlan === "starter" ? t("superAdmin.planNameStarter") : selectedPlan === "croissance" ? t("superAdmin.planNameCroissance") : t("superAdmin.planNameEnterprise")}
                          {" — "}
                          {selectedDuration === "1_year"
                            ? selectedPlan === "croissance" ? t("superAdmin.priceSummaryCroissanceYear") : selectedPlan === "enterprise" ? t("superAdmin.priceSummaryEnterpriseYear") : t("superAdmin.priceSummaryFree")
                            : selectedPlan === "croissance" ? t("superAdmin.priceSummaryCroissanceMonth") : selectedPlan === "enterprise" ? t("superAdmin.priceSummaryEnterpriseMonth") : t("superAdmin.priceSummaryFree")
                          }
                        </p>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setChangeDialogOpen(false)}>{t("superAdmin.cancelButton")}</Button>
                    <Button onClick={handleManualPlanChange} disabled={!selectedPlan || isChangingPlan} className="bg-purple-600 hover:bg-purple-700">
                      {isChangingPlan ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      {t("superAdmin.confirmButton")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Extend Subscription */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">{t("superAdmin.extendTitle")}</h4>
                <p className="text-sm text-muted-foreground">
                  {t("superAdmin.extendDescription", { plan: planId === "enterprise" ? t("superAdmin.planNameEnterprise") : planId === "croissance" ? t("superAdmin.planNameCroissance") : t("superAdmin.planNameStarter") })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExtendSubscription("1_month")} disabled={isChangingPlan}>
                  {isChangingPlan ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  {t("superAdmin.extend1Month")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExtendSubscription("3_months")} disabled={isChangingPlan}>
                  {t("superAdmin.extend3Months")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExtendSubscription("1_year")} disabled={isChangingPlan}>
                  {t("superAdmin.extend1Year")}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("superAdmin.auditNote")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Manage Subscription — Stripe (when configured) */}
      {(subscription?.status === "active" || subscription?.status === "trialing") && isStripeConfigured && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">{t("manageSub.title")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("manageSub.description")}
              </p>
            </div>
            <Button variant="outline" onClick={() => { if (blockMutation("Gérer l'abonnement")) return; openPortal(); }} disabled={isPortalLoading}>
              {isPortalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              {t("manageSub.button")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Non-admin: Contact to upgrade */}
      {!isPlatformSuperAdmin && !isTenantAdmin && !isStripeConfigured && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">{t("contactUpgrade.title")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("contactUpgrade.description")}
              </p>
            </div>
            <Button variant="outline" onClick={() => handleCopy("contact@makitiplus.com")}>
              <Mail className="h-4 w-4 mr-2" />
              {copied ? t("contactUpgrade.copiedButton") : t("contactUpgrade.button")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stripe Checkout for upgrade */}
      {isStripeConfigured && !subscription && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">{t("stripeCheckout.chooseTitle")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("stripeCheckout.chooseDescription")}
              </p>
            </div>
            <Button size="lg" onClick={() => { if (blockMutation("Souscrire au plan")) return; checkout("croissance"); }} disabled={isCheckingOut}>
              {isCheckingOut ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("stripeCheckout.startButton")}
            </Button>
          </CardContent>
        </Card>
      )}
      {isStripeConfigured && planId === "croissance" && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">
                {t("stripeCheckout.upgradeTitle")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("stripeCheckout.upgradeDescription")}
              </p>
            </div>
            <Button size="lg" onClick={() => { if (blockMutation("Souscrire au plan")) return; checkout("enterprise"); }} disabled={isCheckingOut}>
              {isCheckingOut ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("stripeCheckout.upgradeButton")}
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
          <CardTitle>{t("comparePlans.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4">{t("comparePlans.featureColumn")}</th>
                  {plans?.map((plan) => (
                    <th key={plan.id} className="text-center py-2 px-2">
                      <div className="font-semibold">{plan.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {plan.price_monthly === 0 ? t("comparePlans.freeLabel") : `${plan.price_monthly.toFixed(2).replace('.00', '')} EUR/mois`}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <PlanFeatureRow label={t("comparePlans.features.stores")} plans={plans} getValue={(p) => p.max_stores === null ? t("comparePlans.unlimited") : String(p.max_stores)} />
                <PlanFeatureRow label={t("comparePlans.features.users")} plans={plans} getValue={(p) => p.max_users === null ? t("comparePlans.unlimited") : String(p.max_users)} />
                <PlanFeatureRow label={t("comparePlans.features.products")} plans={plans} getValue={(p) => p.max_products === null ? t("comparePlans.unlimited") : String(p.max_products)} />
                <PlanFeatureRow label={t("comparePlans.features.advancedReports")} plans={plans} getValue={(p) => p.has_advanced_reports} />
                <PlanFeatureRow label={t("comparePlans.features.exports")} plans={plans} getValue={(p) => p.has_exports} />
                <PlanFeatureRow label={t("comparePlans.features.suppliers")} plans={plans} getValue={(p) => p.has_supplier_management} />
                <PlanFeatureRow label={t("comparePlans.features.offlineAdvanced")} plans={plans} getValue={(p) => p.has_offline_advanced} />
                <PlanFeatureRow label={t("comparePlans.features.customBranding")} plans={plans} getValue={(p) => p.has_custom_branding} />
                <PlanFeatureRow label={t("comparePlans.features.multiCurrency")} plans={plans} getValue={(p) => p.has_multi_currency} />
                <PlanFeatureRow label={t("comparePlans.features.apiAccess")} plans={plans} getValue={(p) => p.has_api_access} />
                <PlanFeatureRow label={t("comparePlans.features.prioritySupport")} plans={plans} getValue={(p) => p.has_priority_support} />
                <PlanFeatureRow label={t("comparePlans.features.aiAssistant")} plans={plans} getValue={(p) => p.has_ai_assistant} />
                <PlanFeatureRow label={t("comparePlans.features.loyaltyProgram")} plans={plans} getValue={(p) => p.has_loyalty_program} />
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
  const { t } = useTranslation("billing");
  const { data: limitCheck, isLoading } = usePlanLimit(limitType);

  if (isLoading || !limitCheck) {
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>{label}</span>
          <span className="text-muted-foreground">{t("usage.loading")}</span>
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
