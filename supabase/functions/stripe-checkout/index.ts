// stripe-checkout — Creates a Stripe Checkout session for subscription
// Called from frontend when user clicks "Subscribe" on pricing page

import { getCorsHeaders, corsOptionsResponse, validateOrigin } from '../_shared/cors.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';
import { requireAdminContext } from '../_shared/orgScope.ts';
import { stripeRequest, PRICE_IDS } from '../_shared/stripeApi.ts';

const limiter = createRateLimiter('stripe-checkout', { maxRequests: 10, windowMs: 60_000 });

interface CheckoutRequest {
  planKey?: string;       // 'croissance' or 'enterprise'
  plan_id?: string;       // Alias for planKey (retro-compat frontend)
  successUrl?: string;
  cancelUrl?: string;
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
      return new Response(JSON.stringify({ error: 'Aucune organisation associée. Créez d\'abord votre boutique.' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const orgId = actorProfile.organization_id;

    // 2. Parse request body — only accept planKey, reject arbitrary priceId
    const body: CheckoutRequest = await req.json();
    const resolvedPlanKey = body.planKey ?? body.plan_id ?? '';
    const priceId = PRICE_IDS[resolvedPlanKey];

    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Plan invalide. Plans disponibles : croissance, enterprise' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 3. Check if org already has a Stripe customer ID
    const { data: org } = await adminClient
      .from('organizations')
      .select('stripe_customer_id, name')
      .eq('id', orgId)
      .maybeSingle();

    let customerId = org?.stripe_customer_id;

    // 4. Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripeRequest('/customers', 'POST', {
        email: user.email ?? '',
        name: org?.name ?? actorProfile.business_name ?? 'MakitiPlus Client',
        'metadata[organization_id]': orgId,
        'metadata[user_id]': user.id,
      });

      customerId = customer.id as string;

      // Save customer ID to organization
      await adminClient
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', orgId);
    }

    // 5. Create Checkout Session
    const origin = validateOrigin(req);
    const successUrl = body.successUrl?.startsWith(origin) ? body.successUrl : `${origin}/dashboard/billing?checkout=success`;
    const cancelUrl = body.cancelUrl?.startsWith(origin) ? body.cancelUrl : `${origin}/dashboard/billing?checkout=canceled`;

    const session = await stripeRequest('/checkout/sessions', 'POST', {
      customer: customerId,
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'subscription_data[metadata][organization_id]': orgId,
      'subscription_data[metadata][user_id]': user.id,
      'subscription_data[trial_period_days]': '14', // 14-day free trial
      allow_promotion_codes: 'true',
      billing_address_collection: 'auto',
      'payment_method_types[0]': 'card',
    });

    return limiter.addHeaders(
      new Response(JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }),
      rateResult,
    );

  } catch (err) {
    console.error('[stripe-checkout] Error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Erreur lors de la création de la session de paiement' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
