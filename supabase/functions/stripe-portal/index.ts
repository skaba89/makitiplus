/**
 * Stripe Customer Portal Edge Function — Self-serve subscription management
 *
 * Creates a Stripe Customer Portal Session and returns the URL for redirect.
 * Allows users to:
 *   - Update payment methods
 *   - View billing history
 *   - Cancel their subscription
 *   - Switch between monthly/yearly billing
 *
 * Called by the frontend when a user clicks "Gérer mon abonnement".
 * Requires admin context (only org admins can manage billing).
 */

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { requireMethod } from '../_shared/httpMethodGuard.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';
import { requireAdminContext } from '../_shared/orgScope.ts';

const limiter = createRateLimiter('stripe-portal', { maxRequests: 10, windowMs: 300_000 });

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
    // Require admin context — only admins can manage billing
    const ctx = await requireAdminContext(req);
    if (!ctx.ok) {
      return new Response(JSON.stringify({ error: ctx.error }), {
        status: ctx.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { adminClient, actorProfile } = ctx;
    const orgId = actorProfile.organization_id;

    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Organisation introuvable' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the Stripe customer ID for this organization
    const { data: org } = await adminClient
      .from('organizations')
      .select('stripe_customer_id, name')
      .eq('id', orgId)
      .maybeSingle();

    if (!org?.stripe_customer_id) {
      return new Response(JSON.stringify({
        error: 'Aucun compte Stripe trouvé pour cette organisation. Vous devez avoir un abonnement actif pour accéder au portail.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe non configuré' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://makitiplus.onrender.com';

    // Create a Stripe Customer Portal Session
    const portalParams = new URLSearchParams({
      customer: org.stripe_customer_id,
      return_url: `${appUrl}/dashboard/billing`,
      'configuration[business_profile[headline]]': 'Gestion de votre abonnement MakitiPlus',
      // Allow subscription cancellation and payment method updates
      'configuration[features[subscription_update][enabled]]': 'true',
      'configuration[features[subscription_update[default_allowed_updates]]]': '["price"]',
      'configuration[features[subscription_cancel][enabled]]': 'true',
      'configuration[features[subscription_cancel[mode]]': 'at_period_end',
      'configuration[features[invoice_history][enabled]]': 'true',
      'configuration[features[payment_method_update][enabled]]': 'true',
    } as Record<string, string>);

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: portalParams,
    });

    if (!portalRes.ok) {
      const errBody = await portalRes.text();
      console.error('[Stripe] Failed to create portal session:', errBody);
      return new Response(JSON.stringify({ error: 'Erreur lors de la création de la session du portail' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const portalSession = await portalRes.json();

    // Audit
    await adminClient.from('subscription_events').insert({
      organization_id: orgId,
      event_type: 'created',
      metadata: {
        action: 'portal_session_created',
        stripe_customer_id: org.stripe_customer_id,
      },
    });

    return limiter.addHeaders(
      new Response(JSON.stringify({
        url: portalSession.url,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
      rateResult,
    );
  } catch (err) {
    console.error('[Stripe] Portal error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
