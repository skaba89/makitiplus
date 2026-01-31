import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    description: "Pour les petits commerces",
    price: "5 000",
    currency: "FCFA",
    period: "/mois",
    features: [
      "1 caisse",
      "Gestion de stock basique",
      "Mode hors ligne",
      "Rapports journaliers",
      "Support par email",
    ],
    cta: "Commencer gratuitement",
    popular: false,
  },
  {
    name: "Croissance",
    description: "Pour les commerces en expansion",
    price: "15 000",
    currency: "FCFA",
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
  },
  {
    name: "Enterprise",
    description: "Pour les grandes structures",
    price: "40 000",
    currency: "FCFA",
    period: "/mois",
    features: [
      "Caisses illimitées",
      "Multi-magasins",
      "API personnalisée",
      "Formations sur site",
      "Support dédié 24/7",
      "Conformité fiscale",
      "Personnalisation",
    ],
    cta: "Contactez-nous",
    popular: false,
  },
];

export const Pricing = () => {
  return (
    <section className="py-20">
      <div className="container-app">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Tarifs <span className="text-gradient">simples et transparents</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Pas de frais cachés. Payez via Mobile Money ou carte bancaire.
            Annulez à tout moment.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
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
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>

        {/* Trust note */}
        <p className="text-center text-sm text-muted-foreground mt-12">
          💳 Paiement sécurisé via Flutterwave • 📱 Mobile Money accepté • 🔒 Données chiffrées
        </p>
      </div>
    </section>
  );
};
