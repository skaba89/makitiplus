/**
 * useStripePortal — Hook to open the Stripe Customer Portal
 *
 * Calls the stripe-portal Edge Function to create a Portal Session,
 * then redirects the user to the Stripe-hosted portal page.
 *
 * Falls back gracefully if Stripe is not configured.
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { reportError } from "@/lib/sentry";

interface PortalResult {
  url: string;
}

interface UseStripePortalReturn {
  /** Open the Stripe Customer Portal */
  openPortal: () => Promise<void>;
  /** Whether a portal session is being created */
  isLoading: boolean;
  /** Error message if portal creation failed */
  error: string | null;
  /** Whether Stripe is configured (VITE_STRIPE_PUBLISHABLE_KEY set) */
  isStripeConfigured: boolean;
}

export function useStripePortal(): UseStripePortalReturn {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStripeConfigured = !!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

  const openPortal = useCallback(async () => {
    if (!session?.access_token) {
      setError("Vous devez être connecté pour gérer votre abonnement.");
      return;
    }

    if (!isStripeConfigured) {
      setError(
        "Les paiements en ligne ne sont pas encore configurés. " +
        "Contactez contact@makitiplus.com pour gérer votre abonnement."
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("stripe-portal", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        const message = fnError.message || "Erreur lors de l'ouverture du portail de gestion.";
        setError(message);
        reportError(fnError, { action: "stripe_portal" });
        return;
      }

      const result = data as PortalResult;

      if (result.url) {
        // Redirect to Stripe Customer Portal
        window.location.href = result.url;
      } else {
        setError("Aucune URL de portail reçue. Veuillez réessayer.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inattendue lors de l'ouverture du portail.";
      setError(message);
      reportError(err instanceof Error ? err : new Error(message), { action: "stripe_portal" });
    } finally {
      setIsLoading(false);
    }
  }, [session, isStripeConfigured]);

  return { openPortal, isLoading, error, isStripeConfigured };
}
