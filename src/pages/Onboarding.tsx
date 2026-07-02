/**
 * Onboarding Premium — Guided 5-step wizard for new users
 *
 * Steps:
 * 1. Welcome — Choose business type (Boutique, Restaurant, Grossiste, Service, Autre)
 * 2. Business Setup — Configure store (name, city, country, currency, phone)
 * 3. Plan Selection — Starter / Croissance / Enterprise
 * 4. Quick Start — Add first products or skip
 * 5. Done — Success + redirect to dashboard with checklist
 *
 * If the user already completed onboarding, they are redirected to the dashboard.
 * Progress is tracked via profiles.onboarding_step and profiles.onboarding_completed.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePlans, useSubscription } from "@/hooks/useSubscription";
import { useStripeCheckout } from "@/hooks/useStripe";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  Store,
  Rocket,
  Crown,
  ShoppingCart,
  Package,
  Utensils,
  Briefcase,
  Wrench,
  MapPin,
  Phone,
  Globe,
  Coins,
  Plus,
  SkipForward,
  PartyPopper,
  CheckSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { reportError } from "@/lib/sentry";

// ─── Step definitions ─────────────────────────────────────────

const STEPS = ["welcome", "business", "plan", "quickstart", "done"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  welcome: "Bienvenue",
  business: "Votre boutique",
  plan: "Forfait",
  quickstart: "Démarrage",
  done: "Terminé",
};

// ─── Business types ───────────────────────────────────────────

const BUSINESS_TYPES = [
  { id: "boutique", label: "Boutique / Commerce", icon: Store, desc: "Vente au détail de produits physiques" },
  { id: "restaurant", label: "Restaurant / Bar", icon: Utensils, desc: "Restauration, boissons, snacks" },
  { id: "grossiste", label: "Grossiste", icon: ShoppingCart, desc: "Vente en gros et demi-gros" },
  { id: "service", label: "Prestataire de services", icon: Briefcase, desc: "Services, artisanat, réparation" },
  { id: "autre", label: "Autre", icon: Wrench, desc: "Autre type d'activité" },
] as const;

// ─── Country/currency presets for African markets ─────────────

const COUNTRY_CURRENCIES: Record<string, { currency: string; name: string }> = {
  GN: { currency: "GNF", name: "Guinée" },
  SN: { currency: "XOF", name: "Sénégal" },
  CI: { currency: "XOF", name: "Côte d'Ivoire" },
  ML: { currency: "XOF", name: "Mali" },
  BF: { currency: "XOF", name: "Burkina Faso" },
  CM: { currency: "XAF", name: "Cameroun" },
  TG: { currency: "XOF", name: "Togo" },
  BJ: { currency: "XOF", name: "Bénin" },
  NE: { currency: "XOF", name: "Niger" },
  CD: { currency: "CDF", name: "RD Congo" },
  GA: { currency: "XAF", name: "Gabon" },
  CG: { currency: "XAF", name: "Congo" },
  MG: { currency: "MGA", name: "Madagascar" },
  Other: { currency: "USD", name: "Autre" },
};

// ─── Plan display config ──────────────────────────────────────

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

// ─── Product suggestion presets by business type ──────────────

const PRODUCT_SUGGESTIONS: Record<string, string[]> = {
  boutique: ["Riz 25kg", "Huile 5L", "Sucre 1kg", "Savon", "Lait en poudre", "Pâte dentifrice"],
  restaurant: ["Plat du jour", "Riz sauce", "Sandwich", "Jus bissap", "Eau minérale", "Café"],
  grossiste: ["Ciment 50kg", "Riz 50kg", "Huile 20L", "Sucre 25kg", "Savon carton", "Pâtes carton"],
  service: ["Service standard", "Consultation", "Réparation", "Installation", "Livraison", "Devis"],
  autre: ["Produit 1", "Produit 2", "Produit 3"],
};

// ─── Main component ───────────────────────────────────────────

export default function Onboarding() {
  const { user, profile } = useAuth();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: subscription } = useSubscription();
  const stripeCheckout = useStripeCheckout();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Step state
  const [step, setStep] = useState<Step>("welcome");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Business type
  const [businessType, setBusinessType] = useState<string>("");

  // Step 2: Business setup
  const [storeName, setStoreName] = useState(profile?.business_name || "");
  const [storeCity, setStoreCity] = useState(profile?.city || "");
  const [storeCountry, setStoreCountry] = useState(profile?.country || "GN");
  const [storeCurrency, setStoreCurrency] = useState(profile?.currency || "GNF");
  const [storePhone, setStorePhone] = useState(profile?.phone || "");

  // Step 3: Plan selection
  const [selectedPlan, setSelectedPlan] = useState<string>("starter");

  // Step 4: Quick start
  const [quickProducts, setQuickProducts] = useState<{ name: string; price: string; stock: string }[]>([]);
  const [addedProductCount, setAddedProductCount] = useState(0);

  // If user already completed onboarding, redirect to dashboard
  useEffect(() => {
    if (profile?.onboarding_completed) {
      navigate("/dashboard", { replace: true });
    }
  }, [profile?.onboarding_completed, navigate]);

  // If not authenticated, redirect to auth
  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
    }
  }, [user, navigate]);

  // Auto-set currency when country changes
  useEffect(() => {
    const preset = COUNTRY_CURRENCIES[storeCountry];
    if (preset) {
      setStoreCurrency(preset.currency);
    }
  }, [storeCountry]);

  // Initialize quick products suggestions when business type changes
  useEffect(() => {
    if (businessType && PRODUCT_SUGGESTIONS[businessType]) {
      const suggestions = PRODUCT_SUGGESTIONS[businessType];
      setQuickProducts(
        suggestions.map((name) => ({ name, price: "", stock: "10" }))
      );
    }
  }, [businessType]);

  // Save onboarding progress to DB
  const saveStep = useCallback(async (stepName: Step) => {
    try {
      await supabase.rpc("update_onboarding_progress", { p_step: stepName });
    } catch {
      // Non-critical — don't block the user
    }
  }, []);

  // Navigate to step with progress save
  const goToStep = useCallback((nextStep: Step) => {
    setStep(nextStep);
    saveStep(nextStep);
  }, [saveStep]);

  // ─── Step 2: Save business setup ──────────────────────────
  const handleBusinessSetup = async () => {
    if (!storeName.trim()) {
      toast({ variant: "destructive", title: "Nom de boutique requis" });
      return;
    }
    setIsSubmitting(true);
    try {
      // Save business type
      if (businessType) {
        await supabase.rpc("update_business_type", { p_business_type: businessType });
      }
      // Save store configuration
      await supabase.rpc("setup_onboarding_store", {
        p_store_name: storeName.trim(),
        p_city: storeCity.trim() || null,
        p_country: storeCountry,
        p_currency: storeCurrency,
        p_phone: storePhone.trim() || null,
      });
      goToStep("plan");
    } catch (error) {
      reportError(error, { action: "onboarding_business_setup" });
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de sauvegarder les informations. Veuillez réessayer.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Step 3: Select plan ──────────────────────────────────
  const handleSelectPlan = async () => {
    if (!user || !profile?.organization_id) return;
    setIsSubmitting(true);

    try {
      if (selectedPlan === "starter") {
        goToStep("quickstart");
        return;
      }

      const plan = plans?.find((p) => p.id === selectedPlan);
      if (!plan) {
        toast({ variant: "destructive", title: "Plan introuvable" });
        return;
      }

      const priceId = plan.stripe_price_id_monthly;
      if (!priceId) {
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
        goToStep("quickstart");
        return;
      }

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

  // ─── Step 4: Save quick products ──────────────────────────
  const handleQuickStart = async (skip: boolean = false) => {
    if (!skip && quickProducts.length > 0) {
      setIsSubmitting(true);
      try {
        const productsToInsert = quickProducts
          .filter((p) => p.name.trim())
          .map((p) => ({
            name: p.name.trim(),
            price: parseFloat(p.price) || 0,
            stock_quantity: parseInt(p.stock) || 0,
            organization_id: profile?.organization_id,
            is_active: true,
            category_id: null,
          }));

        if (productsToInsert.length > 0) {
          const { error } = await supabase.from("products").insert(productsToInsert);
          if (error) throw error;
          setAddedProductCount(productsToInsert.length);
        }
      } catch (error) {
        reportError(error, { action: "onboarding_quick_products" });
        toast({
          variant: "destructive",
          title: "Erreur",
          description: "Impossible d'ajouter les produits. Vous pourrez les ajouter plus tard.",
        });
      } finally {
        setIsSubmitting(false);
      }
    }

    // Mark onboarding as complete
    try {
      await supabase.rpc("complete_onboarding");
    } catch {
      // Non-critical
    }
    goToStep("done");
  };

  const handleFinish = () => {
    navigate("/dashboard", { replace: true });
  };

  if (!user) return null;

  // ─── Render helpers ────────────────────────────────────────

  const currentStepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => { if (i < currentStepIndex) goToStep(s); }}
                className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                  i < currentStepIndex
                    ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                    : i === currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
                disabled={i > currentStepIndex}
              >
                {i < currentStepIndex ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span>{i + 1}</span>
                )}
                <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-6 sm:w-10 h-0.5 transition-colors rounded-full ${
                    currentStepIndex > i ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Welcome + Business Type */}
        {step === "welcome" && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto p-4 rounded-full bg-primary/10 mb-4">
                <Sparkles className="h-10 w-10 text-primary" />
              </div>
              <CardTitle className="text-2xl">
                Bienvenue sur MakitiPlus !
              </CardTitle>
              <p className="text-muted-foreground mt-2">
                Votre compte a été créé avec succès. MakitiPlus est la caisse
                intelligente et offline-first conçue pour les boutiques et
                commerces en Afrique.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Key features overview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <ShoppingCart className="h-6 w-6 mx-auto text-primary mb-1" />
                  <p className="font-medium text-sm">POS rapide</p>
                  <p className="text-xs text-muted-foreground">Encaissez en quelques secondes</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <Package className="h-6 w-6 mx-auto text-green-600 mb-1" />
                  <p className="font-medium text-sm">Gestion stock</p>
                  <p className="text-xs text-muted-foreground">Suivez votre inventaire en temps réel</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <Globe className="h-6 w-6 mx-auto text-blue-600 mb-1" />
                  <p className="font-medium text-sm">Mode offline</p>
                  <p className="text-xs text-muted-foreground">Fonctionne sans internet</p>
                </div>
              </div>

              {/* Business type selection */}
              <div>
                <Label className="text-base font-semibold mb-3 block">
                  Quel type d'activité avez-vous ?
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {BUSINESS_TYPES.map((bt) => (
                    <button
                      key={bt.id}
                      onClick={() => setBusinessType(bt.id)}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                        businessType === bt.id
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/50 hover:bg-muted/30"
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${
                        businessType === bt.id ? "bg-primary/10" : "bg-muted"
                      }`}>
                        <bt.icon className={`h-5 w-5 ${
                          businessType === bt.id ? "text-primary" : "text-muted-foreground"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{bt.label}</p>
                        <p className="text-xs text-muted-foreground">{bt.desc}</p>
                      </div>
                      {businessType === bt.id && (
                        <Check className="h-5 w-5 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <div />
              <Button
                size="lg"
                onClick={() => goToStep("business")}
                disabled={!businessType}
                className="gap-2"
              >
                Continuer
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 2: Business Setup */}
        {step === "business" && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Store className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Configurez votre boutique</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Ces informations apparaîtront sur vos reçus et dans les rapports.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Store name */}
              <div className="space-y-2">
                <Label htmlFor="store-name" className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  Nom de la boutique *
                </Label>
                <Input
                  id="store-name"
                  placeholder="Ex: Chez Mamadou Boutique"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                />
              </div>

              {/* City + Country row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="store-city" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Ville
                  </Label>
                  <Input
                    id="store-city"
                    placeholder="Ex: Conakry"
                    value={storeCity}
                    onChange={(e) => setStoreCity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    Pays
                  </Label>
                  <Select value={storeCountry} onValueChange={setStoreCountry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(COUNTRY_CURRENCIES).map(([code, info]) => (
                        <SelectItem key={code} value={code}>
                          {info.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Currency + Phone row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-muted-foreground" />
                    Devise
                  </Label>
                  <Select value={storeCurrency} onValueChange={setStoreCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GNF">GNF — Franc guinéen</SelectItem>
                      <SelectItem value="XOF">XOF — Franc CFA (UEMOA)</SelectItem>
                      <SelectItem value="XAF">XAF — Franc CFA (CEMAC)</SelectItem>
                      <SelectItem value="CDF">CDF — Franc congolais</SelectItem>
                      <SelectItem value="MGA">MGA — Ariary malgache</SelectItem>
                      <SelectItem value="USD">USD — Dollar américain</SelectItem>
                      <SelectItem value="EUR">EUR — Euro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="store-phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    Téléphone
                  </Label>
                  <Input
                    id="store-phone"
                    placeholder="Ex: +224 622 00 00 00"
                    value={storePhone}
                    onChange={(e) => setStorePhone(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <Button variant="outline" onClick={() => goToStep("welcome")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Retour
              </Button>
              <Button
                onClick={handleBusinessSetup}
                disabled={isSubmitting || !storeName.trim()}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    Continuer
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 3: Plan Selection */}
        {step === "plan" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Choisissez votre forfait</h2>
              <p className="text-muted-foreground mt-1">
                Commencez gratuitement, évoluez quand vous êtes prêt
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
              <Button variant="outline" onClick={() => goToStep("business")} className="gap-2">
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
                    Confirmer le forfait
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Quick Start — Add first products */}
        {step === "quickstart" && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-xl bg-green-500/10">
                  <Plus className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-xl">Ajoutez vos premiers produits</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Ajoutez rapidement vos produits ou passez cette étape pour le faire plus tard.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {quickProducts.length > 0 ? (
                <div className="space-y-3">
                  {quickProducts.map((product, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-6 gap-2 items-center"
                    >
                      <div className="col-span-3">
                        <Input
                          placeholder="Nom du produit"
                          value={product.name}
                          onChange={(e) => {
                            const updated = [...quickProducts];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            setQuickProducts(updated);
                          }}
                          className="text-sm"
                        />
                      </div>
                      <div className="col-span-1">
                        <Input
                          placeholder="Prix"
                          type="number"
                          value={product.price}
                          onChange={(e) => {
                            const updated = [...quickProducts];
                            updated[idx] = { ...updated[idx], price: e.target.value };
                            setQuickProducts(updated);
                          }}
                          className="text-sm"
                        />
                      </div>
                      <div className="col-span-1">
                        <Input
                          placeholder="Stock"
                          type="number"
                          value={product.stock}
                          onChange={(e) => {
                            const updated = [...quickProducts];
                            updated[idx] = { ...updated[idx], stock: e.target.value };
                            setQuickProducts(updated);
                          }}
                          className="text-sm"
                        />
                      </div>
                      <div className="col-span-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setQuickProducts(quickProducts.filter((_, i) => i !== idx));
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuickProducts([...quickProducts, { name: "", price: "", stock: "10" }]);
                    }}
                    className="gap-2 w-full"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter un produit
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Aucun produit suggéré. Vous pourrez en ajouter depuis la page Produits.</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                <CheckSquare className="h-4 w-4 shrink-0" />
                <span>
                  Vous pourrez modifier, supprimer et ajouter des produits à tout moment depuis la page Produits.
                </span>
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <Button variant="outline" onClick={() => goToStep("plan")} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Retour
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => handleQuickStart(true)}
                  className="gap-2 text-muted-foreground"
                >
                  <SkipForward className="h-4 w-4" />
                  Passer
                </Button>
                <Button
                  onClick={() => handleQuickStart(false)}
                  disabled={isSubmitting}
                  className="gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Ajouter et continuer
                    </>
                  )}
                </Button>
              </div>
            </CardFooter>
          </Card>
        )}

        {/* Step 5: Done */}
        {step === "done" && (
          <Card className="max-w-lg mx-auto text-center">
            <CardHeader>
              <div className="mx-auto p-4 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                <PartyPopper className="h-10 w-10 text-green-600" />
              </div>
              <CardTitle className="text-2xl">
                Tout est prêt !
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Votre espace <strong>{storeName || profile?.business_name}</strong> est configuré et prêt à l'emploi.
                Vous pouvez maintenant commencer à vendre avec MakitiPlus.
              </p>

              {/* Summary */}
              <div className="p-4 rounded-lg bg-muted/50 text-left space-y-2">
                <p className="font-medium text-sm mb-3">Récapitulatif :</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Boutique</div>
                  <div className="font-medium">{storeName || profile?.business_name}</div>
                  <div className="text-muted-foreground">Type</div>
                  <div className="font-medium">
                    {BUSINESS_TYPES.find((bt) => bt.id === businessType)?.label || "—"}
                  </div>
                  <div className="text-muted-foreground">Forfait</div>
                  <div className="font-medium">
                    {plans?.find((p) => p.id === selectedPlan)?.name || selectedPlan}
                  </div>
                  {addedProductCount > 0 && (
                    <>
                      <div className="text-muted-foreground">Produits ajoutés</div>
                      <div className="font-medium">{addedProductCount}</div>
                    </>
                  )}
                </div>
              </div>

              {/* Next steps hint */}
              <div className="p-4 rounded-lg border-2 border-dashed text-left space-y-2">
                <p className="font-medium text-sm">Prochaines étapes :</p>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">1</span>
                    Ajoutez vos catégories de produits
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">2</span>
                    Complétez vos informations fournisseur
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">3</span>
                    Réalisez votre première vente au POS
                  </li>
                </ul>
              </div>

              {selectedPlan !== "starter" && (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-left">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>Note :</strong> Vous serez redirigé vers Stripe pour finaliser le paiement de votre forfait{" "}
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
