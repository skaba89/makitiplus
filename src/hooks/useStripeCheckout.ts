/**
 * useStripeCheckout — Hook to initiate Stripe Checkout for plan upgrades
 *
 * Calls the stripe-checkout Edge Function to create a Checkout Session,
 * then redirects the user to the Stripe-hosted payment page.
 *
 * Falls back gracefully if Stripe is not configured (VITE_STRIPE_PUBLISHABLE_KEY empty).
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { reportError } from "@/lib/sentry";

interface CheckoutResult {
  url: string;
  session_id: string;
}

interface UseStripeCheckoutReturn {
  /** Initiate a checkout for the given plan */
  checkout: (planId: string, billing?: "monthly" | "yearly") => Promise<void>;
  /** Whether a checkout is in progress */
  isLoading: boolean;
  /** Error message if checkout failed */
  error: string | null;
  /** Whether Stripe is configured (VITE_STRIPE_PUBLISHABLE_KEY set) */
  isStripeConfigured: boolean;
}

export function useStripeCheckout(): UseStripeCheckoutReturn {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStripeConfigured = !!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

  const checkout = useCallback(async (planId: string, billing: "monthly" | "yearly" = "monthly") => {
    if (!session?.access_token) {
      setError("Vous devez être connecté pour effectuer un paiement.");
      return;
    }

    // Starter is free — no checkout needed
    if (planId === "starter") {
      setError("Le plan Starter est gratuit. Aucun paiement nécessaire.");
      return;
    }

    // Stripe not configured — show helpful message
    if (!isStripeConfigured) {
      setError(
        "Les paiements en ligne ne sont pas encore configurés. " +
        "Contactez contact@makitiplus.com pour finaliser votre abonnement."
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("stripe-checkout", {
        body: { plan_id: planId, billing },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        // Edge function error
        const message = fnError.message || "Erreur lors de la création de la session de paiement.";
        setError(message);
        reportError(fnError, { action: "stripe_checkout", planId, billing });
        return;
      }

      const result = data as CheckoutResult;

      if (result.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.url;
      } else {
        setError("Aucune URL de paiement reçue. Veuillez réessayer.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inattendue lors du paiement.";
      setError(message);
      reportError(err instanceof Error ? err : new Error(message), { action: "stripe_checkout", planId, billing });
    } finally {
      setIsLoading(false);
    }
  }, [session, isStripeConfigured]);

  return { checkout, isLoading, error, isStripeConfigured };
}
