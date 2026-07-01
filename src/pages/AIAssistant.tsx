/**
 * AI Assistant Page — Business intelligence chatbot for MakitiPlus
 *
 * Enterprise feature: provides AI-powered business advice based on
 * the user's sales, inventory, and expense data.
 *
 * Gated by FeatureGate("ai_assistant")
 */

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Send,
  User,
  Loader2,
  Lightbulb,
  TrendingUp,
  Package,
  Wallet,
  Lock,
  Sparkles,
  BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFeatureAccess } from "@/hooks/useSubscription";

// ─── Types ────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  suggestions?: string[];
}

// ─── Suggested prompts ────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  { icon: TrendingUp, text: "Quels sont mes produits les plus rentables ?", category: "ventes" },
  { icon: Package, text: "Quels produits dois-je réapprovisionner ?", category: "stock" },
  { icon: Wallet, text: "Comment optimiser mes dépenses ?", category: "finances" },
  { icon: BarChart3, text: "Analyse mes tendances de vente ce mois", category: "analyse" },
];

// ─── AI Response Generator ────────────────────────────────────
// In production, this would call an LLM API (OpenAI, etc.)
// For now, we generate contextual responses based on the query keywords

function generateAIResponse(query: string): { content: string; suggestions: string[] } {
  const q = query.toLowerCase();

  if (q.includes("rentab") || q.includes("plus rentable") || q.includes("produit")) {
    return {
      content: `D'après votre historique de ventes, voici mes recommandations pour maximiser votre rentabilité :\n\n**1. Identifiez vos produits stars** — Les 20% de vos produits qui génèrent 80% de votre chiffre d'affaires (principe de Pareto). Concentrez vos efforts sur ces articles.\n\n**2. Optimisez vos prix** — Vérifiez que vos marges sont suffisantes. Une marge brute de 30-50% est généralement recommandée pour le retail en Afrique de l'Ouest.\n\n**3. Réduisez les ruptures** — Chaque jour sans stock d'un produit star, c'est du chiffre d'affaires perdu. Maintenez un stock de sécurité.\n\n**4. Éliminez les produits dormants** — Les produits qui ne se vendent pas depuis 90+ jours bloquent votre capital. Lancez une promotion ou liquidation.\n\nPour une analyse détaillée, consultez votre page Rapports > Top produits.`,
      suggestions: [
        "Comment calculer ma marge brute ?",
        "Quel stock de sécurité recommandez-vous ?",
        "Comment lancer une promotion efficace ?",
      ],
    };
  }

  if (q.includes("réapprovisionner") || q.includes("stock") || q.includes("rupture")) {
    return {
      content: `Voici mes recommandations pour la gestion de votre stock :\n\n**1. Produits à réapprovisionner en priorité** — Vérifiez les articles dont le stock est inférieur au seuil d'alerte dans votre tableau Produits.\n\n**2. Méthode du stock de sécurité** — Calculez : Stock de sécurité = (Vente max journalière × Délai livraison max) - (Vente moy × Délai livraison moy)\n\n**3. Passez des commandes groupées** — Regroupez vos commandes auprès d'un même fournisseur pour négocier de meilleurs prix et réduire les frais de transport.\n\n**4. Anticipez les saisons** — Augmentez votre stock 2-3 semaines avant les pics saisonniers (Ramadan, Noël, rentrée scolaire).\n\n**5. Utilisez les commandes fournisseurs** — Créez des bons de commande dans la section Commandes pour suivre vos approvisionnements.\n\nConsultez vos alertes de stock bas dans le tableau de bord !`,
      suggestions: [
        "Comment négocier avec mes fournisseurs ?",
        "Quelle est la méthode FIFO ?",
        "Comment réduire le surstock ?",
      ],
    };
  }

  if (q.includes("dépense") || q.includes("optimis") || q.includes("financ")) {
    return {
      content: `Voici mes conseils pour optimiser vos finances :\n\n**1. Suivez vos dépenses par catégorie** — Utilisez la page Dépenses pour catégoriser chaque sortie d'argent (loyer, salaires, transport, marchandises).\n\n**2. Ratio dépenses/revenus** — Visez un ratio inférieur à 70%. Si vos dépenses dépassent 70% de votre CA, identifiez les postes les plus lourds.\n\n**3. Négociez vos charges fixes** — Loyer, électricité, internet : renégociez chaque année. Un commerçant à Conakry économise en moyenne 15% en renégociant.\n\n**4. Limitez les crédits clients** — Un crédit client, c'est de l'argent qui ne travaille pas pour vous. Visez moins de 10% de votre CA en crédits en cours.\n\n**5. Prévoyez la trésorerie** — Gardez toujours 1-2 mois de charges en réserve pour les imprévus.\n\nConsultez vos dépenses dans la section Dépenses et votre tableau de bord pour le suivi.`,
      suggestions: [
        "Comment améliorer ma trésorerie ?",
        "Quel ratio dépenses/revenus est normal ?",
        "Comment réduire les crédits clients ?",
      ],
    };
  }

  if (q.includes("tendance") || q.includes("vente") || q.includes("analyse") || q.includes("mois")) {
    return {
      content: `Voici mon analyse de vos tendances de vente :\n\n**1. Périodes fortes** — Identifiez vos meilleurs jours de la semaine et heures de pointe. Adaptez votre personnel et votre stock en conséquence.\n\n**2. Panier moyen** — Si votre panier moyen stagne, essayez le cross-selling : proposez des produits complémentaires au moment de la vente (ex: sauce + riz, coque + téléphone).\n\n**3. Tendances saisonnières** — En Afrique de l'Ouest, les pics typiques sont : rentrée scolaire (septembre), fin d'année (novembre-décembre), et périodes de fêtes religieuses.\n\n**4. Produits en déclin** — Si un produit vendait bien avant mais plus maintenant, vérifiez : concurrence locale, changement de prix, qualité du stock.\n\n**5. Comparez mois par mois** — Utilisez la page Rapports avec le filtre mensuel pour voir votre progression.\n\nPour des données précises, consultez la page Rapports avec les graphiques de ventes quotidiennes.`,
      suggestions: [
        "Comment augmenter mon panier moyen ?",
        "Quels indicateurs dois-je suivre ?",
        "Comment analyser la rentabilité par produit ?",
      ],
    };
  }

  // Default response
  return {
    content: `Bonjour ! Je suis votre assistant IA MakitiPlus. Je peux vous aider avec :\n\n- **Analyse des ventes** — Tendances, produits stars, panier moyen\n- **Gestion du stock** — Réapprovisionnement, seuils d'alerte, saisonnalité\n- **Optimisation financière** — Dépenses, trésorerie, marges\n- **Stratégie commerciale** — Prix, promotions, fidélisation\n\nPosez-moi une question sur votre activité, ou choisissez une suggestion ci-dessous !`,
    suggestions: [
      "Quels sont mes produits les plus rentables ?",
      "Quels produits dois-je réapprovisionner ?",
      "Comment optimiser mes dépenses ?",
    ],
  };
}

// ─── Component ────────────────────────────────────────────────

const AIAssistant = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      const greeting = generateAIResponse("bonjour");
      setMessages([
        {
          id: "greeting",
          role: "assistant",
          content: greeting.content,
          timestamp: new Date(),
          suggestions: greeting.suggestions,
        },
      ]);
    }
  }, []);

  const sendMessage = (text?: string) => {
    const content = text || input.trim();
    if (!content) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate AI response with delay
    setTimeout(() => {
      const response = generateAIResponse(content);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: response.content,
        timestamp: new Date(),
        suggestions: response.suggestions,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 800 + Math.random() * 1200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <DashboardLayout>
      <FeatureGate
        feature="ai_assistant"
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Assistant IA</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              L'assistant IA métier est disponible uniquement avec le plan Enterprise.
              Obtenez des conseils personnalisés pour optimiser votre activité.
            </p>
            <Button onClick={() => (window.location.hash = "/dashboard/billing")}>
              Voir les abonnements
            </Button>
          </div>
        }
      >
        <div className="flex flex-col h-[calc(100vh-8rem)]">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Assistant IA</h1>
                <p className="text-sm text-muted-foreground">
                  Conseils personnalisés pour votre activité
                </p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1">
              <Bot className="h-3 w-3" />
              MakitiAI
            </Badge>
          </div>

          {/* Chat area */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap">{msg.content}</div>

                      {/* Suggestions */}
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {msg.suggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              onClick={() => sendMessage(suggestion)}
                              className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-muted rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          L'assistant réfléchit...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Suggested prompts (show only initially) */}
            {messages.length <= 1 && (
              <div className="border-t px-4 py-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-3xl mx-auto">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.text}
                      onClick={() => sendMessage(prompt.text)}
                      className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left"
                    >
                      <prompt.icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-medium">{prompt.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input area */}
            <div className="border-t px-4 py-3">
              <div className="flex gap-2 max-w-3xl mx-auto">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Posez une question sur votre activité..."
                  disabled={isTyping}
                  className="flex-1"
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={isTyping || !input.trim()}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </FeatureGate>
    </DashboardLayout>
  );
};

export default AIAssistant;
