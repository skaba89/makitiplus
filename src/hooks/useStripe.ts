/**
 * Stripe Integration Hooks for MakitiPlus
 *
 * Provides:
 * - useStripeCustomer: Get the Stripe customer for the current org
 * - usePaymentHistory: Get payment history for the current org
 *
 * For checkout & portal, use @/hooks/useStripeCheckout and @/hooks/useStripePortal.
 */

import { useQuery } from "@tanstack/react-query";
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

// ─── Deprecated hooks removed ────────────────────────────────────────────
// useStripeCheckout → use @/hooks/useStripeCheckout instead
// useStripePortal    → use @/hooks/useStripePortal instead
