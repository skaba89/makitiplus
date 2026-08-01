/**
 * Pricing Page — Public pricing for MakitiPlus plans
 *
 * Shows all plans with features, pricing, and CTA buttons.
 * Accessible without authentication (public route).
 */

import { useTranslation } from "react-i18next";
import { usePlans, useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2 } from "lucide-react";

const PLAN_HIGHLIGHT_KEYS: Record<string, string> = {
  croissance: "planHighlights.croissance",
  enterprise: "planHighlights.enterprise",
};

const FEATURE_LABEL_KEYS: Record<string, string> = {
  has_advanced_reports: "features.has_advanced_reports",
  has_exports: "features.has_exports",
  has_supplier_management: "features.has_supplier_management",
  has_offline_advanced: "features.has_offline_advanced",
  has_custom_branding: "features.has_custom_branding",
  has_multi_currency: "features.has_multi_currency",
  has_api_access: "features.has_api_access",
  has_priority_support: "features.has_priority_support",
  has_ai_assistant: "features.has_ai_assistant",
  has_loyalty_program: "features.has_loyalty_program",
};

export default function Pricing() {
  const { t } = useTranslation("pricing");
  const { data: plans, isLoading } = usePlans();
  const { user } = useAuth();
  const { data: subscription } = useSubscription();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <div className="text-center pt-16 pb-8 px-4">
        <h1 className="text-4xl font-bold mb-4">
          {t("title")}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {t("subtitle")}
        </p>
      </div>

      {/* Plans Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
          {plans?.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              highlight={PLAN_HIGHLIGHT_KEYS[plan.id] ? t(PLAN_HIGHLIGHT_KEYS[plan.id]) : ""}
              isCurrent={!!subscription && subscription.plan_id === plan.id}
              onSelect={() => {
                if (user) {
                  navigate("/dashboard/billing");
                } else {
                  navigate("/auth");
                }
              }}
            />
          ))}
        </div>

        {/* FAQ / Bottom CTA */}
        <div className="text-center mt-12">
          <p className="text-muted-foreground mb-4">
            {t("footerIncludes")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("customPlan")}{" "}
            <a href="mailto:contact@makitiplus.com" className="text-primary underline">
              {t("contactUs")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

interface PlanCardProps {
  plan: {
    id: string;
    name: string;
    description: string | null;
    price_monthly: number;
    price_yearly: number | null;
    currency: string;
    max_stores: number | null;
    max_users: number | null;
    max_products: number | null;
    has_advanced_reports: boolean;
    has_exports: boolean;
    has_supplier_management: boolean;
    has_offline_advanced: boolean;
    has_custom_branding: boolean;
    has_multi_currency: boolean;
    has_api_access: boolean;
    has_priority_support: boolean;
    has_ai_assistant: boolean;
    has_loyalty_program: boolean;
    sort_order: number;
  };
  highlight: string;
  isCurrent: boolean;
  onSelect: () => void;
}

function PlanCard({ plan, highlight, isCurrent, onSelect }: PlanCardProps) {
  const { t } = useTranslation("pricing");
  const isPopular = plan.id === "croissance";
  const isEnterprise = plan.id === "enterprise";
  // Les prix sont stockés dans plan.currency (USD) — convertis vers la devise
  // locale de l'utilisateur (déduite de son profil, ou Guinée/GNF par défaut
  // pour un visiteur non connecté) via le même système de taux de change que
  // le reste de l'app (useExchangeRates, base USD). Fallback gracieux : si les
  // taux ne sont pas encore chargés, formatConvertedPrice affiche le montant
  // dans la devise source plutôt que de planter.
  const { formatConvertedPrice } = useCurrency();
  const displayPrice = (amount: number) => formatConvertedPrice(amount, plan.currency);

  const features = [
    {
      label: plan.max_stores === null
        ? `${t("unlimited")} ${t("store_other")}`
        : `${plan.max_stores} ${t(plan.max_stores === 1 ? "store_one" : "store_other")}`,
      included: true,
    },
    {
      label: plan.max_users === null
        ? `${t("unlimitedMasculine")} ${t("user_other")}`
        : `${plan.max_users} ${t(plan.max_users === 1 ? "user_one" : "user_other")}`,
      included: true,
    },
    {
      label: plan.max_products === null
        ? `${t("unlimitedMasculine")} ${t("product_other")}`
        : `${plan.max_products} ${t(plan.max_products === 1 ? "product_one" : "product_other")}`,
      included: true,
    },
    { label: t(FEATURE_LABEL_KEYS.has_advanced_reports), included: plan.has_advanced_reports },
    { label: t(FEATURE_LABEL_KEYS.has_exports), included: plan.has_exports },
    { label: t(FEATURE_LABEL_KEYS.has_supplier_management), included: plan.has_supplier_management },
    { label: t(FEATURE_LABEL_KEYS.has_offline_advanced), included: plan.has_offline_advanced },
    { label: t(FEATURE_LABEL_KEYS.has_custom_branding), included: plan.has_custom_branding },
    { label: t(FEATURE_LABEL_KEYS.has_multi_currency), included: plan.has_multi_currency },
    { label: t(FEATURE_LABEL_KEYS.has_api_access), included: plan.has_api_access },
    { label: t(FEATURE_LABEL_KEYS.has_priority_support), included: plan.has_priority_support },
    { label: t(FEATURE_LABEL_KEYS.has_ai_assistant), included: plan.has_ai_assistant },
    { label: t(FEATURE_LABEL_KEYS.has_loyalty_program), included: plan.has_loyalty_program },
  ];

  return (
    <Card className={`relative flex flex-col ${isPopular ? "border-primary shadow-lg scale-105" : ""} ${isEnterprise ? "border-amber-400" : ""}`}>
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" variant="default">
          {t("popular")}
        </Badge>
      )}
      {isEnterprise && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500">
          {t("premium")}
        </Badge>
      )}

      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl">{plan.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{highlight}</p>
      </CardHeader>

      <CardContent className="flex-1">
        {/* Price */}
        <div className="text-center mb-6">
          {plan.price_monthly === 0 ? (
            <div>
              <span className="text-4xl font-bold">{t("free")}</span>
            </div>
          ) : (
            <div>
              <span className="text-4xl font-bold">{displayPrice(plan.price_monthly)}</span>
              <span className="text-muted-foreground">{t("perMonth")}</span>
              {plan.price_yearly && (
                <p className="text-sm text-muted-foreground mt-1">
                  {t("perYearSavings", { price: displayPrice(plan.price_yearly) })}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-2">
          {features.map((feature) => (
            <li key={feature.label} className="flex items-center gap-2 text-sm">
              {feature.included ? (
                <Check className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
              <span className={feature.included ? "" : "text-muted-foreground/50"}>
                {feature.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter>
        {isCurrent ? (
          <Button className="w-full" variant="outline" disabled>
            {t("currentPlan")}
          </Button>
        ) : (
          <Button className="w-full" onClick={onSelect}>
            {t("choosePlan", { planName: plan.name })}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
