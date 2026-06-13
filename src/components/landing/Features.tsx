import { 
  ShoppingCart, 
  Package, 
  Smartphone, 
  BarChart3, 
  WifiOff, 
  Users,
  Receipt,
  Shield
} from "lucide-react";

const features = [
  {
    icon: ShoppingCart,
    title: "Caisse tactile simple",
    description: "Gros boutons, peu de texte. Parfait pour vendre vite même avec peu de formation.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Package,
    title: "Gestion de stock",
    description: "Alertes automatiques quand le stock est bas. Suivi des dates de péremption.",
    color: "bg-success/10 text-success",
  },
  {
    icon: Smartphone,
    title: "Mobile Money intégré",
    description: "Wave, Orange Money, M-Pesa, MTN... Tous les paiements en un seul endroit.",
    color: "bg-accent text-accent-foreground",
  },
  {
    icon: BarChart3,
    title: "Rapports visuels",
    description: "Graphiques simples pour comprendre vos ventes en un coup d'œil.",
    color: "bg-secondary text-secondary-foreground",
  },
  {
    icon: WifiOff,
    title: "100% hors ligne",
    description: "Fonctionne sans internet. Synchronise automatiquement quand le réseau revient.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Users,
    title: "Multi-vendeurs",
    description: "Chaque vendeur a son code PIN. Suivez les performances de chacun.",
    color: "bg-success/10 text-success",
  },
  {
    icon: Receipt,
    title: "Tickets & SMS",
    description: "Imprimez ou envoyez les reçus par SMS/WhatsApp. Pas besoin de papier.",
    color: "bg-accent text-accent-foreground",
  },
  {
    icon: Shield,
    title: "Données sécurisées",
    description: "Sauvegarde automatique quotidienne. Vos données ne sont jamais perdues.",
    color: "bg-secondary text-secondary-foreground",
  },
];

export const Features = () => {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container-app">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Tout ce qu'il faut pour{" "}
            <span className="text-gradient">gérer votre commerce</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Une solution complète pensée pour les réalités africaines : 
            connexion instable, appareils basiques, utilisateurs non-techniciens.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="card-elevated p-6 hover:shadow-medium transition-all duration-300 group animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className={`w-14 h-14 rounded-2xl ${feature.color} flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
