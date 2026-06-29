import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Wifi, WifiOff, Smartphone, ShoppingCart as CartIcon, Package, BarChart3, Users, Banknote, QrCode } from "lucide-react";

export const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-hero-gradient opacity-5" />
      
      {/* Decorative elements */}
      <div className="absolute top-20 right-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-10 w-96 h-96 bg-accent/30 rounded-full blur-3xl" />

      <div className="container-app relative z-10 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left content */}
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border">
              <span className="flex h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium text-secondary-foreground">
                Fonctionne 100% hors ligne
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
              Gérez votre commerce{" "}
              <span className="text-gradient">simplement</span>
              <br />
              même sans internet
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl">
              La caisse enregistreuse et gestion de stock pensée pour l'Afrique. 
              Simple, rapide, et toujours disponible.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="hero" size="xl" className="group">
                Essai gratuit 14 jours
                <ArrowRight className="transition-transform group-hover:translate-x-1" />
              </Button>
              <Button variant="outline" size="xl">
                <Play className="mr-1" />
                Voir la démo
              </Button>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center gap-6 pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="w-5 h-5 text-primary" />
                <span>Mobile-first</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <WifiOff className="w-5 h-5 text-success" />
                <span>Mode offline</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">2,500+</span>
                <span>commerces</span>
              </div>
            </div>
          </div>

          {/* Right - App mockup */}
          <div className="relative flex justify-center lg:justify-end">
            <div className="relative">
              {/* Phone frame */}
              <div className="relative w-[280px] sm:w-[320px] h-[580px] sm:h-[640px] bg-foreground rounded-[3rem] p-3 shadow-strong animate-float">
                {/* Screen */}
                <div className="w-full h-full bg-background rounded-[2.5rem] overflow-hidden">
                  {/* Status bar */}
                  <div className="flex items-center justify-between px-6 py-3 bg-card">
                    <span className="text-xs font-medium">9:41</span>
                    <div className="flex items-center gap-1">
                      <Wifi className="w-4 h-4" />
                      <div className="w-6 h-3 bg-success rounded-sm" />
                    </div>
                  </div>
                  
                  {/* App content mockup */}
                  <div className="p-4 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Bonjour,</p>
                        <p className="font-bold text-lg">Boutique Mama Awa</p>
                      </div>
                      <div className="sync-indicator sync-online">
                        <span className="h-2 w-2 rounded-full bg-success" />
                        En ligne
                      </div>
                    </div>

                    {/* Quick stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="card-elevated p-3">
                        <p className="text-xs text-muted-foreground">Aujourd'hui</p>
                        <p className="text-xl font-bold text-success">125,000 F</p>
                      </div>
                      <div className="card-elevated p-3">
                        <p className="text-xs text-muted-foreground">Ventes</p>
                        <p className="text-xl font-bold">47</p>
                      </div>
                    </div>

                    {/* Quick actions */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Actions rapides</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="touch" className="flex-col h-20 gap-1">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <CartIcon className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-medium">Nouvelle vente</span>
                        </Button>
                        <Button variant="touch" className="flex-col h-20 gap-1">
                          <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                            <Package className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-medium">Stock</span>
                        </Button>
                        <Button variant="touch" className="flex-col h-20 gap-1">
                          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                            <BarChart3 className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-medium">Rapports</span>
                        </Button>
                        <Button variant="touch" className="flex-col h-20 gap-1">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                            <Users className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-medium">Clients</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating elements */}
              <div className="absolute -left-16 top-20 card-elevated p-4 shadow-medium animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                    <Banknote className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Paiement reçu</p>
                    <p className="font-bold text-success">+15,000 F</p>
                  </div>
                </div>
              </div>

              <div className="absolute -right-12 bottom-32 card-elevated p-4 shadow-medium animate-fade-in" style={{ animationDelay: "0.6s" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Mobile Money</p>
                    <p className="font-semibold">Wave, Orange, MTN</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
