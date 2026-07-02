// stripe-portal — Create a Stripe Customer Portal session
// Allows customers to manage their subscription, view invoices, update payment methods

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);
  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.93.3');
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get org
    const { data: profile } = await adminClient
      .from('profiles').select('organization_id')
      .eq('user_id', user.id).maybeSingle();
    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'No organization found' }), { status: 403, headers });
    }

    // ── Get Stripe customer ───────────────────────────────────────
    const { data: customer } = await adminClient
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    if (!customer?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'Aucun compte Stripe trouvé. Veuillez d\'abord souscrire à un plan.' }),
        { status: 400, headers }
      );
    }

    // ── Create Portal Session ─────────────────────────────────────
    const appUrl = Deno.env.get('APP_URL') || 'https://makitiplus.onrender.com';

    const portalParams = new URLSearchParams({
      customer: customer.stripe_customer_id,
      return_url: `${appUrl}/dashboard/billing`,
    });

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: portalParams,
    });

    const portalData = await portalRes.json();
    if (!portalRes.ok) {
      console.error('[stripe-portal] Error:', portalData);
      return new Response(
        JSON.stringify({ error: portalData.error?.message || 'Failed to create portal session' }),
        { status: 502, headers }
      );
    }

    return new Response(
      JSON.stringify({ url: portalData.url }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error('[stripe-portal] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur interne du serveur' }),
      { status: 500, headers }
    );
  }
});
