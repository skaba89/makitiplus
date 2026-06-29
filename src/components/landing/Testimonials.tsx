import { Star, User, Stethoscope, ChefHat } from "lucide-react";

const testimonials = [
  {
    name: "Mama Fatou Diallo",
    business: "Boutique Fatou, Dakar",
    image: "businesswoman",
    Icon: User,
    content: "Avant j'utilisais un cahier. Maintenant je vois mes ventes en temps réel sur mon téléphone. Même quand le réseau coupe, ça continue de marcher !",
    rating: 5,
  },
  {
    name: "Ibrahim Koné",
    business: "Pharmacie Santé Plus, Abidjan",
    image: "doctor",
    Icon: Stethoscope,
    content: "Le suivi des dates de péremption m'a fait économiser beaucoup. Plus de médicaments perdus. L'alerte stock bas est géniale.",
    rating: 5,
  },
  {
    name: "Grace Mensah",
    business: "Restaurant La Terrasse, Accra",
    image: "chef",
    Icon: ChefHat,
    content: "Mes serveurs apprennent en 5 minutes. Les gros boutons c'est parfait. Le paiement Wave marche très bien avec les clients.",
    rating: 5,
  },
];

export const Testimonials = () => {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container-app">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ils font confiance à{" "}
            <span className="text-gradient">MakitiPlus</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Plus de 2 500 commerces à travers l'Afrique de l'Ouest utilisent notre solution chaque jour.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.name}
              className="card-elevated p-6 animate-fade-in"
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-5 h-5 fill-primary text-primary"
                  />
                ))}
              </div>

              {/* Content */}
              <p className="text-foreground leading-relaxed mb-6">
                "{testimonial.content}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                  {testimonial.Icon ? <testimonial.Icon className="h-6 w-6 text-primary" /> : <User className="h-6 w-6 text-primary" />}
                </div>
                <div>
                  <p className="font-semibold">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {testimonial.business}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16">
          {[
            { value: "2,500+", label: "Commerces actifs" },
            { value: "8", label: "Pays couverts" },
            { value: "99.9%", label: "Disponibilité" },
            { value: "< 2min", label: "Temps d'apprentissage" },
          ].map((stat, index) => (
            <div key={stat.label} className="text-center animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
              <p className="text-3xl sm:text-4xl font-extrabold text-gradient">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
