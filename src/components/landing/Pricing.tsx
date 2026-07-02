import { Button } from "@/components/ui/button";
import { Check, CreditCard, Smartphone, Lock, Zap, Crown } from "lucide-react";
import { DEFAULT_CURRENCY } from "@/utils/currencies";
import { usePlans } from "@/hooks/useSubscription";

const FALLBACK_PLANS = [
  {
    id: "starter",
    name: "Starter",
    description: "Pour les petits commerces",
    price_monthly: 0,
    price_yearly: 0,
    currency: "gnf",
    features: [
      "1 caisse",
      "Gestion de stock basique",
      "Mode hors ligne",
      "Rapports journaliers",
      "Support par email",
    ],
    cta: "Commencer gratuitement",
    popular: false,
    icon: Zap,
  },
  {
    id: "croissance",
    name: "Croissance",
    description: "Pour les commerces en expansion",
    price_monthly: 2900, // $29 in cents (USD)
    price_yearly: 29000, // $290 in cents (USD)
    currency: "usd",
    features: [
      "3 caisses",
      "Multi-vendeurs avec PIN",
      "Mobile Money intégré",
      "Rapports avancés",
      "Gestion créances clients",
      "Support prioritaire",
      "Export comptable",
    ],
    cta: "Essai gratuit 7 jours",
    popular: true,
    icon: Zap,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Pour les grandes structures",
    price_monthly: 7900, // $79 in cents (USD)
    price_yearly: 79000, // $790 in cents (USD)
    currency: "usd",
    features: [
      "Caisses illimitées",
      "Multi-magasins",
      "API personnalisée",
      "Formations sur site",
      "Support dédié 24/7",
      "Conformité fiscale",
      "Personnalisation",
    ],
    cta: "Essai gratuit 7 jours",
    popular: false,
    icon: Crown,
  },
];

function formatPrice(amount: number, currency: string): string {
  if (amount === 0) return "Gratuit";
  // Stripe stores amounts in cents for USD
  const displayAmount = currency.toLowerCase() === 'usd' ? amount / 100 : amount;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(displayAmount);
}

export const Pricing = () => {
  const { data: plans } = usePlans();

  // Merge DB plans with fallback features/descriptions
  const displayPlans = FALLBACK_PLANS.map((fallback) => {
    const dbPlan = plans?.find((p) => p.id === fallback.id);
    return {
      ...fallback,
      // Use DB prices if available, otherwise fallback
      price_monthly: dbPlan?.price_monthly ?? fallback.price_monthly,
      price_yearly: dbPlan?.price_yearly ?? fallback.price_yearly,
      currency: dbPlan?.currency ?? fallback.currency,
    };
  });

  return (
    <section className="py-20">
      <div className="container-app">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Tarifs <span className="text-gradient">simples et transparents</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Pas de frais cachés. Payez par carte bancaire ou Mobile Money.
            Annulez à tout moment.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {displayPlans.map((plan, index) => {
            const IconComponent = plan.icon;
            return (
              <div
                key={plan.id}
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
                  <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
                    <IconComponent className="h-5 w-5" />
                    {plan.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                <div className="mb-6">
                  {plan.price_monthly === 0 ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold">Gratuit</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-extrabold">
                          {formatPrice(plan.price_monthly, plan.currency)}
                        </span>
                        <span className="text-lg text-muted-foreground">/mois</span>
                      </div>
                      {plan.price_yearly && plan.price_yearly > 0 && (
                        <p className="text-sm text-green-600 mt-1">
                          {formatPrice(plan.price_yearly, plan.currency)}/an — économisez 2 mois
                        </p>
                      )}
                    </>
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
                  variant={plan.popular ? "hero" : plan.price_monthly === 0 ? "outline" : "default"}
                  size="lg"
                  className="w-full"
                  asChild={plan.price_monthly === 0}
                >
                  {plan.price_monthly === 0 ? (
                    <a href="/auth">{plan.cta}</a>
                  ) : (
                    plan.cta
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Trust note */}
        <p className="text-center text-sm text-muted-foreground mt-12">
          <span className="flex items-center justify-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5"><CreditCard className="h-4 w-4" /> Paiement sécurisé via Stripe</span>
            <span className="flex items-center gap-1.5"><Smartphone className="h-4 w-4" /> Mobile Money accepté</span>
            <span className="flex items-center gap-1.5"><Lock className="h-4 w-4" /> Données chiffrées</span>
          </span>
        </p>
      </div>
    </section>
  );
};
