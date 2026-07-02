/**
 * Stripe Checkout Edge Function — Creates Stripe Checkout Sessions for MakitiPlus
 *
 * Called by the frontend when a user clicks "Upgrader" or selects a paid plan.
 * Creates a Stripe Checkout Session and returns the URL for redirect.
 *
 * Required metadata on the Checkout Session:
 *   - organization_id: To link the payment back to the org
 *   - plan_id: To know which plan was purchased
 *
 * The Stripe webhook (stripe-webhook) handles the checkout.session.completed
 * event and activates the subscription.
 */

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { requireMethod } from '../_shared/httpMethodGuard.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';
import { requireAdminContext } from '../_shared/orgScope.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';

const limiter = createRateLimiter('stripe-checkout', { maxRequests: 10, windowMs: 300_000 });

// Stripe Price IDs — set in Supabase Edge Function environment variables
// Format: STRIPE_PRICE_<PLAN_ID>_MONTHLY / STRIPE_PRICE_<PLAN_ID>_YEARLY
function getPriceId(planId: string, billing: 'monthly' | 'yearly'): string | null {
  const key = `STRIPE_PRICE_${planId.toUpperCase()}_${billing.toUpperCase()}`;
  return Deno.env.get(key) || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);

  const methodErr = requireMethod(req, 'POST');
  if (methodErr) return methodErr;

  const corsHeaders = getCorsHeaders(req);

  // Rate limiting
  const rateResult = await limiter.check(req);
  if (!rateResult.allowed) {
    return limiter.addHeaders(
      new Response(JSON.stringify({ error: rateResult.error }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      rateResult,
    );
  }

  try {
    // Require admin context — only admins can initiate checkout
    const ctx = await requireAdminContext(req);
    if (!ctx.ok) {
      return new Response(JSON.stringify({ error: ctx.error }), {
        status: ctx.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { adminClient, actorProfile, user } = ctx;
    const orgId = actorProfile.organization_id;

    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Organisation introuvable' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body = await req.json();
    const planId = body.plan_id as string;
    const billing = (body.billing as 'monthly' | 'yearly') || 'monthly';

    if (!planId || !['croissance', 'enterprise'].includes(planId)) {
      return new Response(JSON.stringify({ error: 'Plan invalide. Seuls les plans payants nécessitent un checkout.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Stripe price ID
    const priceId = getPriceId(planId, billing);
    if (!priceId) {
      return new Response(JSON.stringify({
        error: `Configuration Stripe manquante pour le plan ${planId} (${billing}). Contactez le support.`,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create Stripe customer
    const { data: org } = await adminClient
      .from('organizations')
      .select('stripe_customer_id, name')
      .eq('id', orgId)
      .maybeSingle();

    let customerId = org?.stripe_customer_id;

    if (!customerId) {
      // Create Stripe customer via API
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: user.email || '',
          name: org?.name || actorProfile.business_name || '',
          metadata: JSON.stringify({ organization_id: orgId }),
        } as Record<string, string>),
      });

      if (!customerRes.ok) {
        const errBody = await customerRes.text();
        console.error('[Stripe] Failed to create customer:', errBody);
        return new Response(JSON.stringify({ error: 'Erreur lors de la création du client Stripe' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const customer = await customerRes.json();
      customerId = customer.id;

      // Save customer ID to org
      await adminClient
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', orgId);
    }

    // Create Checkout Session
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
    const appUrl = Deno.env.get('APP_URL') || 'https://makitiplus.onrender.com';

    const sessionParams = new URLSearchParams({
      customer: customerId,
      mode: billing === 'yearly' ? 'payment' : 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${appUrl}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard/billing?checkout=cancelled`,
      'metadata[organization_id]': orgId,
      'metadata[plan_id]': planId,
      'metadata[billing]': billing,
    } as Record<string, string>);

    // For yearly billing, add subscription data
    if (billing === 'yearly') {
      sessionParams.set('subscription_data[metadata][organization_id]', orgId);
      sessionParams.set('subscription_data[metadata][plan_id]', planId);
      sessionParams.set('mode', 'subscription');
    }

    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sessionParams,
    });

    if (!sessionRes.ok) {
      const errBody = await sessionRes.text();
      console.error('[Stripe] Failed to create checkout session:', errBody);
      return new Response(JSON.stringify({ error: 'Erreur lors de la création de la session de paiement' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const session = await sessionRes.json();

    // Audit
    await adminClient.from('subscription_events').insert({
      organization_id: orgId,
      event_type: 'created',
      to_plan: planId,
      performed_by: user.id,
      metadata: { stripe_session_id: session.id, billing, price_id: priceId },
    });

    return limiter.addHeaders(
      new Response(JSON.stringify({
        url: session.url,
        session_id: session.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      rateResult,
    );
  } catch (err) {
    console.error('[Stripe] Checkout error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
