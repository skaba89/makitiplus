/**
 * Pricing Page — Public pricing for MakitiPlus plans
 *
 * Shows all plans with features, pricing, and CTA buttons.
 * Accessible without authentication (public route).
 */

import { usePlans, useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2 } from "lucide-react";

const PRICING_CURRENCY = "USD";

const PLAN_HIGHLIGHTS: Record<string, string> = {
  starter: "Idéal pour démarrer",
  croissance: "Pour les boutiques qui grandissent",
  enterprise: "Pour les chaînes et grossistes",
};

const FEATURE_LABELS: Record<string, string> = {
  max_stores: "Boutiques",
  max_users: "Utilisateurs",
  max_products: "Produits",
  has_advanced_reports: "Rapports avancés",
  has_exports: "Exports PDF / Excel",
  has_supplier_management: "Gestion fournisseurs",
  has_offline_advanced: "Mode offline avancé",
  has_custom_branding: "Branding personnalisé",
  has_multi_currency: "Multi-devises",
  has_api_access: "API externe",
  has_priority_support: "Support prioritaire",
  has_ai_assistant: "Assistant IA métier",
  has_loyalty_program: "Programme fidélité",
};

export default function Pricing() {
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
          Choisissez votre plan
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          La caisse intelligente et offline-first pour les boutiques, grossistes
          et chaînes de magasins en Afrique. Commencez gratuitement.
        </p>
      </div>

      {/* Plans Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {plans?.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              highlight={PLAN_HIGHLIGHTS[plan.id] || ""}
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
            Tous les plans incluent : POS, gestion stock, clients à crédit, reçus PDF, mode offline basique
          </p>
          <p className="text-sm text-muted-foreground">
            Besoin d'un plan personnalisé ?{" "}
            <a href="mailto:contact@makitiplus.com" className="text-primary underline">
              Contactez-nous
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
  const isPopular = plan.id === "croissance";
  const isEnterprise = plan.id === "enterprise";

  const features = [
    { label: `${plan.max_stores === null ? "Illimitées" : plan.max_stores} boutique${plan.max_stores !== 1 ? "s" : ""}`, included: true },
    { label: `${plan.max_users === null ? "Illimités" : plan.max_users} utilisateur${plan.max_users !== 1 ? "s" : ""}`, included: true },
    { label: `${plan.max_products === null ? "Illimités" : plan.max_products} produit${plan.max_products !== 1 ? "s" : ""}`, included: true },
    { label: FEATURE_LABELS.has_advanced_reports, included: plan.has_advanced_reports },
    { label: FEATURE_LABELS.has_exports, included: plan.has_exports },
    { label: FEATURE_LABELS.has_supplier_management, included: plan.has_supplier_management },
    { label: FEATURE_LABELS.has_offline_advanced, included: plan.has_offline_advanced },
    { label: FEATURE_LABELS.has_custom_branding, included: plan.has_custom_branding },
    { label: FEATURE_LABELS.has_multi_currency, included: plan.has_multi_currency },
    { label: FEATURE_LABELS.has_api_access, included: plan.has_api_access },
    { label: FEATURE_LABELS.has_priority_support, included: plan.has_priority_support },
    { label: FEATURE_LABELS.has_ai_assistant, included: plan.has_ai_assistant },
    { label: FEATURE_LABELS.has_loyalty_program, included: plan.has_loyalty_program },
  ];

  return (
    <Card className={`relative flex flex-col ${isPopular ? "border-primary shadow-lg scale-105" : ""} ${isEnterprise ? "border-amber-400" : ""}`}>
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" variant="default">
          Populaire
        </Badge>
      )}
      {isEnterprise && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500">
          Premium
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
              <span className="text-4xl font-bold">Gratuit</span>
            </div>
          ) : (
            <div>
              <span className="text-4xl font-bold">${plan.price_monthly}</span>
              <span className="text-muted-foreground">/mois</span>
              {plan.price_yearly && (
                <p className="text-sm text-muted-foreground mt-1">
                  ${plan.price_yearly}/an — économisez 2 mois
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
            Plan actuel
          </Button>
        ) : plan.price_monthly === 0 ? (
          <Button className="w-full" variant="outline" onClick={onSelect}>
            Commencer gratuitement
          </Button>
        ) : (
          <Button className="w-full" onClick={onSelect}>
            Choisir {plan.name}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
