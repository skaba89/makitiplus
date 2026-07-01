/**
 * Billing Page — Manage subscription and view usage
 *
 * Shows current plan, usage counters, and upgrade options.
 * Only accessible to admin/super_admin users.
 */

import { useSubscription, usePlanLimit, usePlans, formatLimit, type LimitType } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, AlertTriangle, CreditCard, Calendar, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  const { userRole } = useAuth();
  const navigate = useNavigate();

  if (subLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statusInfo = subscription
    ? STATUS_LABELS[subscription.status] || { label: subscription.status, variant: "outline" as const }
    : { label: "Starter (défaut)", variant: "secondary" as const };

  const planId = subscription?.plan_id || "starter";
  const currentPlan = plans?.find((p) => p.id === planId);

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Abonnement & Facturation</h1>
          <p className="text-muted-foreground">Gérez votre plan et suivez votre utilisation</p>
        </div>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>

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

          {/* Subscription Status Warning */}
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

      {/* Upgrade CTA */}
      {planId !== "enterprise" && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="font-semibold text-lg">
                {planId === "starter"
                  ? "Passez à Croissance pour débloquer fournisseurs, rapports et exports"
                  : "Passez à Enterprise pour analytics, API et support prioritaire"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {planId === "starter"
                  ? "$29/mois — 3 boutiques, 10 utilisateurs, produits illimités"
                  : "$79/mois — Boutiques et utilisateurs illimités, assistant IA, programme fidélité"}
              </p>
            </div>
            <Button size="lg" onClick={() => navigate("/dashboard/billing/upgrade")}>
              Upgrader
            </Button>
          </CardContent>
        </Card>
      )}

      {/* All Plans */}
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
                        {plan.price_monthly === 0 ? "Gratuit" : `$${plan.price_monthly}/mois`}
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
  plans: { id: string; name: string; price_monthly: number; max_stores: number; max_users: number; max_products: number | null; has_advanced_reports: boolean; has_exports: boolean; has_supplier_management: boolean; has_offline_advanced: boolean; has_custom_branding: boolean; has_multi_currency: boolean; has_api_access: boolean; has_priority_support: boolean; has_ai_assistant: boolean; has_loyalty_program: boolean }[] | undefined;
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
