/**
 * OnboardingChecklist — Progress card shown on the Dashboard for new users
 *
 * Shows a checklist of setup tasks with auto-detection:
 * - ✅ Compte créé
 * - ⬜ Boutique configurée
 * - ⬜ Produits ajoutés
 * - ⬜ Catégories créées
 * - ⬜ Première vente
 *
 * Auto-detects progress via the get_onboarding_checklist RPC.
 * Dismissible by the user (stored in localStorage).
 * Reappears if not all steps are completed and not explicitly dismissed.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  Store,
  Package,
  FolderOpen,
  ShoppingCart,
  UserCheck,
  X,
  ArrowRight,
  Sparkles,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

interface ChecklistData {
  has_account: boolean;
  has_store_configured: boolean;
  has_products: boolean;
  has_categories: boolean;
  has_sales: boolean;
  completion_pct: number;
}

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  icon: React.ElementType;
  action: string;
  path: string;
}

const DISMISS_KEY = "makitiplus_onboarding_checklist_dismissed";

export function OnboardingChecklist() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  // Check if user dismissed the checklist
  useEffect(() => {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (stored) setDismissed(true);
  }, []);

  // Fetch checklist progress
  const { data: checklist, isLoading } = useQuery({
    queryKey: ["onboarding-checklist"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_onboarding_checklist");
      if (error) throw error;
      return data as ChecklistData;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  // Hide if dismissed or all complete
  if (dismissed || !checklist || checklist.completion_pct >= 100) {
    return null;
  }

  const items: ChecklistItem[] = [
    {
      id: "account",
      label: "Compte créé",
      description: "Votre compte est prêt",
      completed: checklist.has_account,
      icon: UserCheck,
      action: "",
      path: "",
    },
    {
      id: "store",
      label: "Boutique configurée",
      description: "Ajoutez le nom, la ville et la devise",
      completed: checklist.has_store_configured,
      icon: Store,
      action: "Configurer",
      path: "/dashboard/settings",
    },
    {
      id: "products",
      label: "Produits ajoutés",
      description: "Ajoutez au moins un produit",
      completed: checklist.has_products,
      icon: Package,
      action: "Ajouter",
      path: "/dashboard/products",
    },
    {
      id: "categories",
      label: "Catégories créées",
      description: "Organisez vos produits par catégorie",
      completed: checklist.has_categories,
      icon: FolderOpen,
      action: "Créer",
      path: "/dashboard/categories",
    },
    {
      id: "first_sale",
      label: "Première vente",
      description: "Réalisez votre première vente au POS",
      completed: checklist.has_sales,
      icon: ShoppingCart,
      action: "Vendre",
      path: "/dashboard/pos",
    },
  ];

  const completedCount = items.filter((i) => i.completed).length;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, "true");
  };

  const handleAction = (path: string) => {
    navigate(path);
  };

  const handleComplete = async () => {
    try {
      await supabase.rpc("complete_onboarding");
      queryClient.invalidateQueries({ queryKey: ["onboarding-checklist"] });
    } catch {
      // Non-critical
    }
  };

  // If all steps done, auto-complete and show success briefly
  if (completedCount === 5) {
    handleComplete();
    return null;
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Configurez votre espace</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={checklist.completion_pct} className="flex-1 h-2" />
          <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
            {completedCount}/5
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
              item.completed
                ? "bg-green-500/5"
                : "hover:bg-muted/50"
            }`}
          >
            {item.completed ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${
                item.completed ? "text-muted-foreground line-through" : ""
              }`}>
                {item.label}
              </p>
              {!item.completed && (
                <p className="text-xs text-muted-foreground">{item.description}</p>
              )}
            </div>
            {!item.completed && item.action && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAction(item.path)}
                className="gap-1 text-xs h-7 text-primary hover:text-primary"
              >
                {item.action}
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
