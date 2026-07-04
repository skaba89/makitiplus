/**
 * Shared Stripe API helper for Supabase Edge Functions.
 *
 * Provides a thin wrapper around the Stripe REST API using fetch.
 * Extracted from stripe-portal and stripe-checkout to avoid duplication.
 *
 * Also exports PRICE_IDS and resolvePlanKey() for server-side price validation.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

// Price IDs (set in Supabase Edge Function secrets)
export const PRICE_IDS: Record<string, string> = {
  croissance: Deno.env.get('STRIPE_PRICE_ID_CROISSANCE') ?? '',
  enterprise: Deno.env.get('STRIPE_PRICE_ID_ENTERPRISE') ?? '',
};

// Collect all valid price IDs for server-side validation
export const VALID_PRICE_IDS = new Set(Object.values(PRICE_IDS).filter(Boolean));

/**
 * Resolve a plan key (e.g. 'croissance') to its Stripe price ID.
 * Returns null if the plan key is invalid.
 */
export function resolvePriceId(planKey: string): string | null {
  const id = PRICE_IDS[planKey];
  return id || null;
}

/**
 * Resolve a Stripe price ID back to a plan key.
 * Returns null if the price ID doesn't match any known plan.
 */
export function resolvePlanFromPriceId(priceId: string | undefined | null): string | null {
  if (!priceId) return null;
  for (const [plan, pid] of Object.entries(PRICE_IDS)) {
    if (pid && pid === priceId) return plan;
  }
  return null;
}

/**
 * Make an authenticated request to the Stripe API.
 * Uses application/x-www-form-urlencoded for compatibility with Stripe v1.
 */
export async function stripeRequest(
  path: string,
  method: string = 'POST',
  body?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not configured');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
  };

  let fetchOptions: RequestInit = { method };

  if (body) {
    const encoded = new URLSearchParams(body).toString();
    if (method === 'GET') {
      // For GET requests, append as query string
      path += `?${encoded}`;
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      fetchOptions.body = encoded;
    }
  }

  fetchOptions.headers = headers;

  const res = await fetch(`${STRIPE_API}${path}`, fetchOptions);
  const data = await res.json();

  if (!res.ok) {
    const errMsg = (data as Record<string, unknown>)?.error
      ? ((data as Record<string, unknown>).error as Record<string, unknown>)?.message ?? `Stripe API error ${res.status}`
      : `Stripe API error ${res.status}`;
    throw new Error(String(errMsg));
  }

  return data as Record<string, unknown>;
}
