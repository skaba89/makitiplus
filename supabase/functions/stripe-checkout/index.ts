// stripe-checkout — Creates a Stripe Checkout session for subscription
// Called from frontend when user clicks "Subscribe" on pricing page

import { getCorsHeaders, corsOptionsResponse, validateOrigin } from '../_shared/cors.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';
import { requireAdminContext } from '../_shared/orgScope.ts';

const STRIPE_API = 'https://api.stripe.com/v1';
const limiter = createRateLimiter('stripe-checkout', { maxRequests: 10, windowMs: 60_000 });

// Price IDs (set in Supabase Edge Function secrets)
// These map to your Stripe product prices
const PRICE_IDS: Record<string, string> = {
  croissance: Deno.env.get('STRIPE_PRICE_ID_CROISSANCE') ?? '',
  enterprise: Deno.env.get('STRIPE_PRICE_ID_ENTERPRISE') ?? '',
};

// Collect all valid price IDs for server-side validation
const VALID_PRICE_IDS = new Set(Object.values(PRICE_IDS).filter(Boolean));

interface CheckoutRequest {
  planKey?: string;       // 'croissance' or 'enterprise'
  plan_id?: string;       // Alias for planKey (retro-compat frontend)
  successUrl?: string;
  cancelUrl?: string;
}

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

      customerId = customer.id;

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
