// stripe-portal — Creates a Stripe Customer Portal session
// Allows users to manage their subscription (upgrade, cancel, update payment method)

import { getCorsHeaders, corsOptionsResponse, validateOrigin } from '../_shared/cors.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';
import { requireAdminContext } from '../_shared/orgScope.ts';

const STRIPE_API = 'https://api.stripe.com/v1';
const limiter = createRateLimiter('stripe-portal', { maxRequests: 10, windowMs: 60_000 });

async function stripeRequest(
  path: string,
  method: string = 'POST',
  body?: Record<string, string>,
) {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not configured');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
  };

  let fetchOptions: RequestInit = { method };

  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    fetchOptions.body = new URLSearchParams(body).toString();
  }

  fetchOptions.headers = headers;

  const res = await fetch(`${STRIPE_API}${path}`, fetchOptions);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message ?? `Stripe API error: ${res.status}`);
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Rate limit check
  const rateResult = await limiter.check(req);
  if (!rateResult.allowed) {
    return limiter.addHeaders(
      new Response(JSON.stringify({ error: rateResult.error }), {
        status: 429,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }),
      rateResult,
    );
  }

  try {
    // 1. Authenticate + authorize via shared admin context
    const ctx = await requireAdminContext(req);
    if (!ctx.ok) {
      return new Response(JSON.stringify({ error: ctx.error }), {
        status: ctx.status,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { adminClient, user, actorProfile } = ctx;

    if (!actorProfile.organization_id) {
      return new Response(JSON.stringify({ error: 'Aucune organisation associée' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 2. Get organization with Stripe customer ID
    const { data: org } = await adminClient
      .from('organizations')
      .select('stripe_customer_id, subscription_plan')
      .eq('id', actorProfile.organization_id)
      .maybeSingle();

    if (!org?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: 'Aucun abonnement actif. Souscrivez d\'abord à un plan.' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 3. Create Customer Portal session
    const origin = validateOrigin(req);
    const returnUrl = `${origin}/dashboard/billing`;

    const session = await stripeRequest('/billing_portal/sessions', 'POST', {
      customer: org.stripe_customer_id,
      return_url: returnUrl,
    });

    return limiter.addHeaders(
      new Response(JSON.stringify({
        url: session.url,
      }), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }),
      rateResult,
    );

  } catch (err) {
    console.error('[stripe-portal] Error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Impossible de créer la session portail' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
