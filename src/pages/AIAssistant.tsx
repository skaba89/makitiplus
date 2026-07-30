/**
 * AI Assistant Page — Business intelligence chatbot for MakitiPlus
 *
 * Enterprise feature: provides AI-powered business advice based on
 * the user's sales, inventory, and expense data.
 *
 * Gated by FeatureGate("ai_assistant")
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";
import { supabase } from "@/integrations/supabase/client";
import { reportError } from "@/lib/sentry";
import { extractErrorMessage } from "@/lib/extractErrorMessage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Send,
  User,
  Loader2,
  TrendingUp,
  Package,
  Wallet,
  Lock,
  Sparkles,
  BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

// ─── Initial greeting (static — no need to burn an LLM call just to say hello) ──

const INITIAL_GREETING = {
  content: `Bonjour ! Je suis votre assistant IA MakitiPlus. Je peux vous aider avec :\n\n- **Analyse des ventes** — Tendances, produits stars, panier moyen\n- **Gestion du stock** — Réapprovisionnement, seuils d'alerte, saisonnalité\n- **Optimisation financière** — Dépenses, trésorerie, marges\n- **Stratégie commerciale** — Prix, promotions, fidélisation\n\nPosez-moi une question sur votre activité, ou choisissez une suggestion ci-dessous !`,
  suggestions: [
    "Quels sont mes produits les plus rentables ?",
    "Quels produits dois-je réapprovisionner ?",
    "Comment optimiser mes dépenses ?",
  ],
};

// ─── Component ────────────────────────────────────────────────

const AIAssistant = () => {
  useAuth();
  const navigate = useNavigate();
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

  // Initial greeting (static, not an LLM call)
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "greeting",
          role: "assistant",
          content: INITIAL_GREETING.content,
          timestamp: new Date(),
          suggestions: INITIAL_GREETING.suggestions,
        },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async (text?: string) => {
    const content = text || input.trim();
    if (!content) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    // Historique court (hors message de bienvenue statique) pour donner du
    // contexte conversationnel au LLM, sans persistance serveur pour ce v1.
    const history = messages
      .filter((m) => m.id !== "greeting")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant-chat", {
        body: { message: content, history },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.content,
        timestamp: new Date(),
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error: unknown) {
      const msg = extractErrorMessage(error);
      toast({ variant: "destructive", title: "Assistant IA indisponible", description: msg });
      reportError(error instanceof Error ? error : new Error(msg));
    } finally {
      setIsTyping(false);
    }
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
            <Button onClick={() => navigate("/dashboard/billing")}>
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
                  aria-label="Envoyer le message"
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
