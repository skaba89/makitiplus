import { Button } from "@/components/ui/button";
import { Check, CreditCard, Smartphone, Lock, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const plans = [
  {
    key: "croissance",
    name: "Croissance",
    description: "Pour les commerces en expansion",
    price: "39,90",
    currency: "€",
    period: "/mois",
    features: [
      "3 caisses",
      "Multi-vendeurs avec PIN",
      "Mobile Money intégré",
      "Rapports avancés",
      "Gestion créances clients",
      "Support prioritaire",
      "Export comptable",
    ],
    cta: "Essai gratuit 14 jours",
    popular: true,
    trialDays: 14,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    description: "Pour les grandes structures",
    price: "99,90",
    currency: "€",
    period: "/mois",
    features: [
      "Caisses illimitées",
      "Multi-magasins",
      "API personnalisée",
      "Formations sur site",
      "Support dédié 24/7",
      "Conformité fiscale",
      "Personnalisation complète",
    ],
    cta: "Essai gratuit 14 jours",
    popular: false,
    trialDays: 14,
  },
];

export const Pricing = () => {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSubscribe = async (planKey: string) => {
    setLoadingPlan(planKey);

    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { planKey },
      });

      if (error) {
        console.error('Checkout error:', error.message);
        // If not authenticated, redirect to sign up
        if (error.message.includes('authorization') || error.message.includes('session')) {
          window.location.href = '/auth?redirect=pricing';
          return;
        }
        alert('Erreur lors de la création du checkout. Veuillez réessayer.');
        return;
      }

      if (data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Subscribe error:', err);
      alert('Erreur de connexion. Veuillez réessayer.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section className="py-20">
      <div className="container-app">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Tarifs <span className="text-gradient">simples et transparents</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Pas de frais cachés. 14 jours d'essai gratuit inclus.
            Annulez à tout moment.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.key}
              className={`relative card-elevated p-8 flex flex-col animate-fade-in ${
                plan.popular
                  ? "border-2 border-primary shadow-glow"
                  : ""
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-hero-gradient text-primary-foreground text-sm font-semibold px-4 py-1 rounded-full">
                    Le plus populaire
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">{plan.price}</span>
                  <span className="text-lg text-muted-foreground">{plan.currency}</span>
                </div>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
                {plan.trialDays && (
                  <p className="text-xs text-primary mt-1 font-medium">
                    {plan.trialDays} jours d'essai gratuit
                  </p>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-grow">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-success shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.popular ? "hero" : "outline"}
                size="lg"
                className="w-full"
                onClick={() => handleSubscribe(plan.key)}
                disabled={loadingPlan !== null}
              >
                {loadingPlan === plan.key ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Redirection...
                  </>
                ) : (
                  plan.cta
                )}
              </Button>
            </div>
          ))}
        </div>

        {/* Trust note */}
        <p className="text-center text-sm text-muted-foreground mt-12">
          <span className="flex items-center justify-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <CreditCard className="h-4 w-4" /> Paiement sécurisé via Stripe
            </span>
            <span className="flex items-center gap-1.5">
              <Smartphone className="h-4 w-4" /> Mobile Money accepté
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-4 w-4" /> Données chiffrées
            </span>
          </span>
        </p>
      </div>
    </section>
  );
};
