/**
 * Stripe Client Configuration for MakitiPlus
 *
 * Provides:
 * - Stripe publishable key (safe for client-side use)
 * - Lazy-loaded Stripe.js instance
 * - Environment validation
 */

import { loadStripe, type Stripe } from '@stripe/stripe-js';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

/**
 * Check if Stripe is configured (publishable key is set).
 * Used to conditionally render Stripe-dependent UI.
 */
export function isStripeConfigured(): boolean {
  return !!STRIPE_PUBLISHABLE_KEY;
}

/**
 * Lazy singleton for the Stripe.js instance.
 * Only loads Stripe.js when first accessed, and only if the publishable key is configured.
 * Returns null if Stripe is not configured.
 */
let _stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!_stripePromise) {
    if (!STRIPE_PUBLISHABLE_KEY) {
      console.warn('[Stripe] VITE_STRIPE_PUBLISHABLE_KEY is not set. Stripe features will be disabled.');
      _stripePromise = Promise.resolve(null);
    } else {
      _stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
    }
  }
  return _stripePromise;
}

/**
 * Format an amount in cents to a display string.
 * Stripe stores amounts in cents (e.g., 2900 = $29.00).
 */
export function formatStripeAmount(amountCents: number, currency: string = 'usd'): string {
  const amount = amountCents / 100;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
