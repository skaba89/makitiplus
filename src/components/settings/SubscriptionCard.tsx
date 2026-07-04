import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, Crown, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { reportError } from "@/lib/sentry";
import { useToast } from "@/hooks/use-toast";

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  starter: { label: "Starter", color: "bg-gray-100 text-gray-700" },
  croissance: { label: "Croissance", color: "bg-blue-100 text-blue-700" },
  enterprise: { label: "Enterprise", color: "bg-purple-100 text-purple-700" },
};

export const SubscriptionCard = () => {
  const { data: subscription, isLoading } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await (await import("@/integrations/supabase/client")).supabase.functions.invoke("stripe-portal");

      if (error) {
        reportError(error);
        toast({ title: "Erreur", description: "Erreur lors de l'ouverture du portail. Veuillez réessayer.", variant: "destructive" });
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      reportError(err instanceof Error ? err : new Error(String(err)));
      toast({ title: "Erreur", description: "Erreur de connexion. Veuillez réessayer.", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const planId = subscription?.plan_id ?? "starter";
  const planInfo = PLAN_LABELS[planId] ?? PLAN_LABELS.starter;
  const isExpired = subscription?.current_period_end
    ? new Date(subscription.current_period_end) < new Date()
    : planId !== "starter";
  const expiryDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  // Determine if Stripe customer exists — check organizations table for stripe_customer_id
  // For now, if subscription has a current_period_end and plan is not starter, assume Stripe customer exists
  const hasStripeCustomer = planId !== "starter" && !!subscription?.current_period_end;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="w-5 h-5" />
          Abonnement
        </CardTitle>
        <CardDescription>
          Gérez votre plan et vos informations de paiement
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current plan */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Plan actuel</span>
          <Badge className={planInfo.color}>{planInfo.label}</Badge>
        </div>

        {/* Expiry date */}
        {expiryDate && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Expire le</span>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              {isExpired && <AlertTriangle className="w-4 h-4 text-destructive" />}
              {expiryDate}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          {hasStripeCustomer ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleManageSubscription}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Chargement...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Gérer l'abonnement
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="default"
              className="w-full"
              onClick={() => navigate("/pricing")}
            >
              <Crown className="w-4 h-4 mr-2" />
              Voir les offres
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
