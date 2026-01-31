import { Button } from "@/components/ui/button";
import { ArrowRight, Phone } from "lucide-react";

export const CTA = () => {
  return (
    <section className="py-20">
      <div className="container-app">
        <div className="relative overflow-hidden rounded-3xl bg-hero-gradient p-8 sm:p-12 lg:p-16">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
          
          <div className="relative z-10 max-w-2xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-primary-foreground mb-6">
              Prêt à moderniser votre commerce ?
            </h2>
            <p className="text-lg sm:text-xl text-primary-foreground/90 mb-8">
              Essayez gratuitement pendant 14 jours. Aucune carte bancaire requise.
              Configuration en 5 minutes.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="hero-outline" size="xl" className="group">
                Démarrer l'essai gratuit
                <ArrowRight className="transition-transform group-hover:translate-x-1" />
              </Button>
              <Button 
                variant="ghost" 
                size="xl" 
                className="text-primary-foreground hover:bg-white/10"
              >
                <Phone className="mr-2 w-5 h-5" />
                +221 77 123 45 67
              </Button>
            </div>

            <p className="text-sm text-primary-foreground/70 mt-8">
              🌍 Disponible au Sénégal, Côte d'Ivoire, Mali, Burkina Faso, Ghana, Nigeria, Kenya et RDC
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
