/**
 * Onboarding Page — Plan selection wizard for new users
 *
 * After signup, users are guided through a 3-step onboarding flow:
 * 1. Welcome screen
 * 2. Plan selection (Starter / Croissance / Enterprise)
 * 3. Setup confirmation & redirect to dashboard
 *
 * If the user already has a subscription, they are redirected to the dashboard.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePlans, useSubscription } from "@/hooks/useSubscription";
import { useStripeCheckout } from "@/hooks/useStripe";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, ArrowRight, ArrowLeft, Loader2, Sparkles, Store, Rocket, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { reportError } from "@/lib/sentry";

const STEPS = ["welcome", "plan", "confirm"] as const;
type Step = (typeof STEPS)[number];

const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter: <Store className="h-8 w-8 text-primary" />,
  croissance: <Rocket className="h-8 w-8 text-amber-500" />,
  enterprise: <Crown className="h-8 w-8 text-purple-500" />,
};

const PLAN_DESCRIPTIONS: Record<string, string> = {
  starter: "Idéal pour démarrer votre activité avec les essentiels du POS et de la gestion de stock.",
  croissance: "Pour les boutiques qui grandissent — fournisseurs, rapports avancés, exports et multi-devises.",
  enterprise: "Pour les chaînes et grossistes — tout illimité, API, support prioritaire et assistant IA.",
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

export default function Onboarding() {
  const { user, profile } = useAuth();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: subscription } = useSubscription();
  const stripeCheckout = useStripeCheckout();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("welcome");
  const [selectedPlan, setSelectedPlan] = useState<string>("starter");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If user already has a subscription, redirect to dashboard
  useEffect(() => {
    if (subscription?.status === "active") {
      navigate("/dashboard", { replace: true });
    }
  }, [subscription, navigate]);

  // If not authenticated, redirect to auth
  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
    }
  }, [user, navigate]);

  const handleSelectPlan = async () => {
    if (!user || !profile?.organization_id) return;
    setIsSubmitting(true);

    try {
      if (selectedPlan === "starter") {
        // Starter is free — just ensure the subscription exists (trigger already creates it)
        setStep("confirm");
        return;
      }

      // Paid plan — redirect to Stripe Checkout
      const plan = plans?.find((p) => p.id === selectedPlan);
      if (!plan) {
        toast({ variant: "destructive", title: "Plan introuvable" });
        return;
      }

      const priceId = plan.stripe_price_id_monthly;
      if (!priceId) {
        // Stripe not configured yet — fall back to pending subscription
        const { error } = await supabase
          .from("subscriptions")
          .upsert({
            organization_id: profile.organization_id,
            plan_id: selectedPlan,
            status: "pending",
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
          }, { onConflict: "organization_id" });

        if (error) throw error;
        setStep("confirm");
        return;
      }

      // Redirect to Stripe Checkout (useStripeCheckout handles the redirect on success)
      stripeCheckout.mutate({
        price_id: priceId,
        plan_id: selectedPlan,
        billing_period: "monthly",
      });
    } catch (error) {
      reportError(error, { action: "onboarding_select_plan", planId: selectedPlan });
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de sélectionner ce plan. Veuillez réessayer.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = () => {
    navigate("/dashboard", { replace: true });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  STEPS.indexOf(step) >= i
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-12 h-0.5 transition-colors ${
                    STEPS.indexOf(step) > i ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === "welcome" && (
          <Card className="max-w-lg mx-auto text-center">
            <CardHeader>
              <div className="mx-auto p-4 rounded-full bg-primary/10 mb-4">
                <Sparkles className="h-10 w-10 text-primary" />
              </div>
              <CardTitle className="text-2xl">
                Bienvenue sur MakitiPlus !
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Votre compte a été créé avec succès. MakitiPlus est la caisse
                intelligente et offline-first conçue pour les boutiques et
                commerces en Afrique.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="font-medium text-sm">POS rapide</p>
                  <p className="text-xs text-muted-foreground">Encaissez en quelques secondes</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="font-medium text-sm">Gestion stock</p>
                  <p className="text-xs text-muted-foreground">Suivez votre inventaire en temps réel</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="font-medium text-sm">Mode offline</p>
                  <p className="text-xs text-muted-foreground">Fonctionne sans internet</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Choisissez maintenant le plan adapté à votre activité.
              </p>
            </CardContent>
            <CardFooter className="justify-center">
              <Button size="lg" onClick={() => setStep("plan")} className="gap-2">
                Choisir mon plan
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 2: Plan Selection */}
        {step === "plan" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Choisissez votre plan</h2>
              <p className="text-muted-foreground mt-1">
                Commencez gratuitement, upgradéz quand vous êtes prêt
              </p>
            </div>

            {plansLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4 lg:gap-6">
                {plans?.map((plan) => {
                  const isSelected = selectedPlan === plan.id;
                  const isPopular = plan.id === "croissance";

                  const features = [
                    { label: `${plan.max_stores === null ? "Illimitées" : plan.max_stores} boutique${plan.max_stores !== 1 ? "s" : ""}`, included: true },
                    { label: `${plan.max_users === null ? "Illimités" : plan.max_users} utilisateur${plan.max_users !== 1 ? "s" : ""}`, included: true },
                    { label: `${plan.max_products === null ? "Illimités" : plan.max_products} produit${plan.max_products !== 1 ? "s" : ""}`, included: true },
                    { label: FEATURE_LABELS.has_advanced_reports, included: plan.has_advanced_reports },
                    { label: FEATURE_LABELS.has_exports, included: plan.has_exports },
                    { label: FEATURE_LABELS.has_supplier_management, included: plan.has_supplier_management },
                    { label: FEATURE_LABELS.has_custom_branding, included: plan.has_custom_branding },
                    { label: FEATURE_LABELS.has_multi_currency, included: plan.has_multi_currency },
                    { label: FEATURE_LABELS.has_api_access, included: plan.has_api_access },
                    { label: FEATURE_LABELS.has_ai_assistant, included: plan.has_ai_assistant },
                  ];

                  return (
                    <Card
                      key={plan.id}
                      className={`relative flex flex-col cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/20 shadow-lg"
                          : "hover:border-primary/50"
                      } ${isPopular ? "border-amber-300" : ""}`}
                      onClick={() => setSelectedPlan(plan.id)}
                    >
                      {isPopular && (
                        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500">
                          Populaire
                        </Badge>
                      )}

                      <CardHeader className="text-center pb-2">
                        <div className="mx-auto mb-2">
                          {PLAN_ICONS[plan.id]}
                        </div>
                        <CardTitle className="text-xl">{plan.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {PLAN_DESCRIPTIONS[plan.id]}
                        </p>
                      </CardHeader>

                      <CardContent className="flex-1">
                        {/* Price */}
                        <div className="text-center mb-4">
                          {plan.price_monthly === 0 ? (
                            <span className="text-3xl font-bold">Gratuit</span>
                          ) : (
                            <div>
                              <span className="text-3xl font-bold">${plan.price_monthly}</span>
                              <span className="text-muted-foreground">/mois</span>
                              {plan.price_yearly && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  ${plan.price_yearly}/an — économisez 2 mois
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Features */}
                        <ul className="space-y-1.5">
                          {features.map((feature) => (
                            <li key={feature.label} className="flex items-center gap-2 text-xs">
                              {feature.included ? (
                                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              ) : (
                                <X className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                              )}
                              <span className={feature.included ? "" : "text-muted-foreground/50"}>
                                {feature.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>

                      <CardFooter>
                        <Button
                          className="w-full"
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                        >
                          {isSelected ? "Sélectionné" : "Choisir"}
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("welcome")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Retour
              </Button>
              <Button
                onClick={handleSelectPlan}
                disabled={isSubmitting || plansLoading}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    Confirmer le plan
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === "confirm" && (
          <Card className="max-w-lg mx-auto text-center">
            <CardHeader>
              <div className="mx-auto p-4 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                <Check className="h-10 w-10 text-green-600" />
              </div>
              <CardTitle className="text-2xl">
                Tout est prêt !
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Votre plan{" "}
                <strong>
                  {plans?.find((p) => p.id === selectedPlan)?.name || selectedPlan}
                </strong>{" "}
                a été activé avec succès. Vous pouvez maintenant commencer à
                utiliser MakitiPlus pour gérer votre activité.
              </p>
              {selectedPlan === "starter" && (
                <div className="p-4 rounded-lg bg-muted/50 text-left space-y-2">
                  <p className="font-medium text-sm">Pour commencer :</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>1. Ajoutez vos premiers produits</li>
                    <li>2. Configurez votre boutique dans les paramètres</li>
                    <li>3. Réalisez votre première vente au POS</li>
                  </ul>
                </div>
              )}
              {selectedPlan !== "starter" && (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-left">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>Note :</strong> Vous serez redirigé vers Stripe pour finaliser le paiement de votre plan{" "}
                    {plans?.find((p) => p.id === selectedPlan)?.name}. Vous bénéficiez d'un essai gratuit de 7 jours.
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-center">
              <Button size="lg" onClick={handleFinish} className="gap-2">
                Accéder au tableau de bord
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
