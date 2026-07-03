/**
 * Stripe Integration Hooks for MakitiPlus
 *
 * Provides:
 * - useStripeCustomer: Get the Stripe customer for the current org
 * - usePaymentHistory: Get payment history for the current org
 * - useStripeCheckout: Initiate a Stripe Checkout session
 * - useStripePortal: Open Stripe Customer Portal
 *
 * All hooks use Supabase Edge Functions as the backend proxy.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isStripeConfigured } from "@/integrations/stripe/config";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface StripeCustomer {
  id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  email: string | null;
  name: string | null;
}

export interface StripePayment {
  id: string;
  organization_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  amount: number;
  currency: string;
  status: string;
  plan_id: string | null;
  period_start: string | null;
  period_end: string | null;
  invoice_url: string | null;
  invoice_pdf: string | null;
  created_at: string;
}

// ─── Hook: useStripeCustomer ───────────────────────────────────────────────

export function useStripeCustomer() {
  const { user } = useAuth();

  return useQuery<StripeCustomer | null>({
    queryKey: ["stripe-customer", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_stripe_customer");
      if (error) throw error;
      return (data as StripeCustomer) ?? null;
    },
    enabled: !!user && isStripeConfigured(),
  });
}

// ─── Hook: usePaymentHistory ───────────────────────────────────────────────

export function usePaymentHistory(limit = 20) {
  const { user } = useAuth();

  return useQuery<StripePayment[]>({
    queryKey: ["payment-history", user?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_payment_history", { p_limit: limit });
      if (error) throw error;
      return (data as StripePayment[]) ?? [];
    },
    enabled: !!user && isStripeConfigured(),
  });
}

// ─── Hook: useStripeCheckout ───────────────────────────────────────────────

export function useStripeCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { price_id: string; plan_id: string; billing_period?: 'monthly' | 'yearly' }) => {
      if (!isStripeConfigured()) {
        throw new Error("Stripe n'est pas configuré. Veuillez contacter le support.");
      }

      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: params,
      });

      if (error) {
        // Extract meaningful error message from Supabase Functions error
        const message = error.message || error.name || "Erreur lors de la création de la session de paiement.";
        throw new Error(message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data as { url: string; session_id: string };
    },
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      console.error("[useStripeCheckout] Checkout failed:", error.message);
    },
  });
}

// ─── Hook: useStripePortal ─────────────────────────────────────────────────

export function useStripePortal() {
  return useMutation({
    mutationFn: async () => {
      if (!isStripeConfigured()) {
        throw new Error("Stripe n'est pas configuré. Veuillez contacter le support.");
      }

      const { data, error } = await supabase.functions.invoke("stripe-portal", {
        body: {},
      });

      if (error) {
        const message = error.message || error.name || "Erreur lors de l'ouverture du portail client.";
        throw new Error(message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data as { url: string };
    },
    onSuccess: (data) => {
      // Redirect to Stripe Portal
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      console.error("[useStripePortal] Portal failed:", error.message);
    },
  });
}
