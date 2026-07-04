// stripe-portal — Creates a Stripe Customer Portal session
// Allows users to manage their subscription (upgrade, cancel, update payment method)

import { getCorsHeaders, corsOptionsResponse, validateOrigin } from '../_shared/cors.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';
import { requireAdminContext } from '../_shared/orgScope.ts';
import { stripeRequest } from '../_shared/stripeApi.ts';

const limiter = createRateLimiter('stripe-portal', { maxRequests: 10, windowMs: 60_000 });

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
