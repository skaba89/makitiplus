/**
 * Billing Page — Manage subscription, view usage, and upgrade via Stripe
 *
 * Shows current plan, usage counters, upgrade options, payment history,
 * and Stripe checkout/portal integration.
 * Only accessible to admin/super_admin users.
 */

import { useState, useEffect } from "react";
import { useSubscription, usePlanLimit, usePlans, formatLimit, type LimitType, type Plan } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { useStripeCheckout, useStripePortal, usePaymentHistory } from "@/hooks/useStripe";
import { isStripeConfigured as isStripeEnvConfigured, formatStripeAmount } from "@/integrations/stripe/config";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, AlertTriangle, CreditCard, Calendar, TrendingUp, ExternalLink, FileText, Download, Crown, Sparkles, XCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Actif", variant: "default" },
  past_due: { label: "En retard", variant: "destructive" },
  grace_period: { label: "Période de grâce", variant: "secondary" },
  read_only: { label: "Lecture seule", variant: "destructive" },
  cancelled: { label: "Annulé", variant: "outline" },
  expired: { label: "Expiré", variant: "destructive" },
};

export default function Billing() {
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: plans } = usePlans();
  const { toast } = useToast();
  const stripeCheckout = useStripeCheckout();
  const stripePortal = useStripePortal();
  const { data: payments } = usePaymentHistory(10);

  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  // Check for checkout result params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast({ title: "Paiement réussi !", description: "Votre abonnement a été mis à jour. La mise à jour peut prendre quelques instants." });
      window.history.replaceState({}, "", "/dashboard/billing");
    }
    if (params.get("checkout") === "cancelled") {
      toast({ title: "Paiement annulé", description: "Vous n'avez pas été débité.", variant: "destructive" });
      window.history.replaceState({}, "", "/dashboard/billing");
    }
  }, []);

  // Resolve price_id from DB plans data
  const getStripePriceId = (targetPlan: string): string | null => {
    const plan = plans?.find((p) => p.id === targetPlan);
    if (!plan) return null;
    return billingPeriod === "yearly" ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
  };

  // Check if Stripe prices are configured for a plan
  const isPlanReady = (targetPlan: string): boolean => {
    return getStripePriceId(targetPlan) !== null;
  };

  // Check if ANY plan has Stripe prices configured
  const anyStripePriceConfigured = plans?.some(
    (p) => p.stripe_price_id_monthly || p.stripe_price_id_yearly
  ) ?? false;

  // Stripe env key check
  const stripeEnvReady = isStripeEnvConfigured();

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
    : { label: "Starter (défaut)", variant: "secondary" as const };

  const planId = subscription?.plan_id || "starter";
  const isPaidPlan = planId !== "starter";

  const handleUpgrade = (targetPlan: string) => {
    if (!stripeEnvReady) {
      toast({
        variant: "destructive",
        title: "Stripe non configuré",
        description: "La clé Stripe n'est pas encore configurée. Contactez le support.",
      });
      return;
    }

    const priceId = getStripePriceId(targetPlan);
    if (!priceId) {
      toast({
        variant: "destructive",
        title: "Prix non disponible",
        description: `Le tarif ${billingPeriod === "yearly" ? "annuel" : "mensuel"} pour ce plan n'est pas encore configuré dans Stripe. Contactez le support.`,
      });
      return;
    }

    stripeCheckout.mutate({
      price_id: priceId,
      plan_id: targetPlan,
      billing_period: billingPeriod,
    });
  };

  const handleManageSubscription = () => {
    stripePortal.mutate();
  };

  // Get display price for a plan from DB data
  const getDisplayPrice = (plan: Plan): string => {
    const amount = billingPeriod === "yearly" ? plan.price_yearly : plan.price_monthly;
    if (amount === 0 || amount === null) return "Gratuit";
    // DB prices are in cents for USD
    if (plan.currency === 'usd') {
      return `${billingPeriod === "yearly" ? (amount / 100) : (amount / 100)}$/${billingPeriod === "yearly" ? "an" : "mois"}`;
    }
    return `${amount} ${plan.currency.toUpperCase()}/${billingPeriod === "yearly" ? "an" : "mois"}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Abonnement & Facturation</h1>
            <p className="text-muted-foreground">Gérez votre plan et suivez votre utilisation</p>
          </div>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>

        {/* Checkout Error Banner */}
        {(stripeCheckout.isError || stripePortal.isError) && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200">
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Erreur de paiement</p>
              <p className="text-muted-foreground">
                {stripeCheckout.error?.message || stripePortal.error?.message || "Une erreur est survenue. Veuillez réessayer."}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => {
              stripeCheckout.reset();
              stripePortal.reset();
            }}>
              Fermer
            </Button>
          </div>
        )}

        {/* Stripe Not Configured Banner */}
        {!stripeEnvReady && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200">
            <Info className="h-5 w-5 text-blue-500 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Paiement en cours de configuration</p>
              <p className="text-muted-foreground">
                Le système de paiement Stripe est en cours de configuration. Les abonnements payants seront disponibles prochainement.
              </p>
            </div>
          </div>
        )}

        {/* Current Plan Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Plan actuel : {subscription?.plan_name || "Starter"}
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
                    Votre abonnement a expiré. Mettez à jour votre paiement pour retrouver l'accès complet.
                  </p>
                </div>
              </div>
            )}

            {/* Manage Subscription Button */}
            {isPaidPlan && (
              <Button
                variant="outline"
                onClick={handleManageSubscription}
                disabled={stripePortal.isPending}
                className="gap-2"
              >
                {stripePortal.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Gérer l'abonnement (Stripe)
              </Button>
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

        {/* Upgrade Section */}
        {planId !== "enterprise" && (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                Upgrader votre plan
              </CardTitle>
              <CardDescription>
                Débloquez plus de fonctionnalités pour développer votre business
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Billing Period Toggle */}
              <div className="flex items-center gap-3">
                <Button
                  variant={billingPeriod === "monthly" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBillingPeriod("monthly")}
                >
                  Mensuel
                </Button>
                <Button
                  variant={billingPeriod === "yearly" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBillingPeriod("yearly")}
                  className="gap-1"
                >
                  Annuel
                  <Badge className="bg-green-100 text-green-800 text-xs ml-1">-17%</Badge>
                </Button>
              </div>

              {/* Plan Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Croissance */}
                {planId === "starter" && (
                  <UpgradeCard
                    planId="croissance"
                    plans={plans}
                    billingPeriod={billingPeriod}
                    isReady={isPlanReady("croissance") && stripeEnvReady}
                    isLoading={stripeCheckout.isPending}
                    badge="Populaire"
                    badgeColor="bg-primary text-primary-foreground"
                    icon={<Sparkles className="h-5 w-5 text-primary" />}
                    features={[
                      "3 boutiques",
                      "10 utilisateurs",
                      "Fournisseurs & commandes",
                      "Rapports & exports",
                      "WhatsApp Business",
                      "Branding personnalisé",
                    ]}
                    onUpgrade={() => handleUpgrade("croissance")}
                  />
                )}

                {/* Enterprise */}
                <UpgradeCard
                  planId="enterprise"
                  plans={plans}
                  billingPeriod={billingPeriod}
                  isReady={isPlanReady("enterprise") && stripeEnvReady}
                  isLoading={stripeCheckout.isPending}
                  badge="Premium"
                  badgeColor="bg-amber-500 text-white"
                  icon={<Crown className="h-5 w-5 text-amber-500" />}
                  features={[
                    "Boutiques & utilisateurs illimités",
                    "Tout dans Croissance",
                    "API externe",
                    "Assistant IA",
                    "Support prioritaire",
                    "Programme fidélité",
                  ]}
                  onUpgrade={() => handleUpgrade("enterprise")}
                  buttonClassName="bg-amber-500 hover:bg-amber-600"
                />
              </div>

              {!anyStripePriceConfigured && (
                <p className="text-xs text-muted-foreground text-center">
                  Les prix Stripe seront configurés prochainement. Contactez-nous pour une activation anticipée.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Payment History */}
        {payments && payments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Historique des paiements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">
                        Plan {(payment.plan_id || "").charAt(0).toUpperCase() + (payment.plan_id || "").slice(1)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(payment.created_at).toLocaleDateString("fr-FR", {
                          year: "numeric", month: "long", day: "numeric"
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-medium">
                          {formatStripeAmount(payment.amount, payment.currency)}
                        </p>
                        <Badge variant={payment.status === "paid" ? "default" : "destructive"} className="text-xs">
                          {payment.status === "paid" ? "Payé" : payment.status === "failed" ? "Échoué" : payment.status}
                        </Badge>
                      </div>
                      {payment.invoice_pdf && (
                        <Button variant="ghost" size="icon" asChild>
                          <a href={payment.invoice_pdf} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plan Comparison Table */}
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
                          {plan.price_monthly === 0 ? "Gratuit" : `$${plan.price_monthly / 100}/mois`}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <PlanFeatureRow label="Boutiques" plans={plans} getValue={(p) => p.max_stores === null ? "∞" : String(p.max_stores)} />
                  <PlanFeatureRow label="Utilisateurs" plans={plans} getValue={(p) => p.max_users === null ? "∞" : String(p.max_users)} />
                  <PlanFeatureRow label="Produits" plans={plans} getValue={(p) => p.max_products === null ? "∞" : String(p.max_products)} />
                  <PlanFeatureRow label="Rapports avancés" plans={plans} getValue={(p) => p.has_advanced_reports} />
                  <PlanFeatureRow label="Exports PDF/Excel" plans={plans} getValue={(p) => p.has_exports} />
                  <PlanFeatureRow label="Fournisseurs" plans={plans} getValue={(p) => p.has_supplier_management} />
                  <PlanFeatureRow label="WhatsApp Business" plans={plans} getValue={(p) => p.has_supplier_management} />
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

// ─── UpgradeCard Component ──────────────────────────────────

function UpgradeCard({
  planId,
  plans,
  billingPeriod,
  isReady,
  isLoading,
  badge,
  badgeColor,
  icon,
  features,
  onUpgrade,
  buttonClassName,
}: {
  planId: string;
  plans: Plan[] | undefined;
  billingPeriod: "monthly" | "yearly";
  isReady: boolean;
  isLoading: boolean;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  features: string[];
  onUpgrade: () => void;
  buttonClassName?: string;
}) {
  const plan = plans?.find((p) => p.id === planId);
  const displayPrice = plan
    ? billingPeriod === "yearly" && plan.price_yearly
      ? `$${plan.price_yearly / 100}/an`
      : `$${plan.price_monthly / 100}/mois`
    : "—";

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 right-0 ${badgeColor} text-xs font-medium px-3 py-1 rounded-bl-lg`}>
        {badge}
      </div>
      <CardContent className="pt-6 space-y-3">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">
            {icon}
            {planId.charAt(0).toUpperCase() + planId.slice(1)}
          </h3>
          <p className="text-2xl font-bold mt-1">{displayPrice}</p>
        </div>
        <ul className="text-sm space-y-1.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <CheckCircle className="h-3.5 w-3.5 text-green-500" /> {feature}
            </li>
          ))}
        </ul>
        <Button
          className={`w-full ${buttonClassName || ""}`}
          onClick={onUpgrade}
          disabled={isLoading || !isReady}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          {isReady ? `Choisir ${planId.charAt(0).toUpperCase() + planId.slice(1)}` : "Bientôt disponible"}
        </Button>
      </CardContent>
    </Card>
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
  plans: Plan[] | undefined;
  getValue: (plan: Plan) => boolean | string;
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
