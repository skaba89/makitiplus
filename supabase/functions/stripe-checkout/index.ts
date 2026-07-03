// stripe-checkout — Creates a Stripe Checkout session for subscription
// Called from frontend when user clicks "Subscribe" on pricing page

import { getCorsHeaders, corsOptionsResponse, validateOrigin } from '../_shared/cors.ts';

const STRIPE_API = 'https://api.stripe.com/v1';

// Price IDs (set in Supabase Edge Function secrets)
// These map to your Stripe product prices
const PRICE_IDS: Record<string, string> = {
  croissance: Deno.env.get('STRIPE_PRICE_ID_CROISSANCE') ?? '',
  enterprise: Deno.env.get('STRIPE_PRICE_ID_ENTERPRISE') ?? '',
};

interface CheckoutRequest {
  priceId?: string;       // Direct Stripe price ID (alternative to planKey)
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

  try {
    // 1. Authenticate user via Supabase
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user session
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.93.3');
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 2. Get organization + verify admin role
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('organization_id, business_name')
      .eq('user_id', user.id)
      .maybeSingle();

    // Verify the user has admin role
    const { data: roleRow } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!roleRow || !['admin', 'super_admin'].includes(roleRow.role)) {
      return new Response(JSON.stringify({ error: 'Accès refusé : seuls les administrateurs peuvent gérer l\'abonnement' }), {
        status: 403,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'Aucune organisation associée. Créez d\'abord votre boutique.' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const orgId = profile.organization_id;

    // 3. Parse request body
    const body: CheckoutRequest = await req.json();
    const resolvedPlanKey = body.planKey ?? body.plan_id ?? '';
    const priceId = body.priceId ?? PRICE_IDS[resolvedPlanKey];

    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Plan invalide ou price ID manquant' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 4. Check if org already has a Stripe customer ID
    const { data: org } = await adminClient
      .from('organizations')
      .select('stripe_customer_id, name')
      .eq('id', orgId)
      .maybeSingle();

    let customerId = org?.stripe_customer_id;

    // 5. Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripeRequest('/customers', 'POST', {
        email: user.email ?? '',
        name: org?.name ?? profile.business_name ?? 'MakitiPlus Client',
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

    // 6. Create Checkout Session
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

    return new Response(JSON.stringify({
      sessionId: session.id,
      url: session.url,
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[stripe-checkout] Error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Erreur lors de la création de la session de paiement' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
