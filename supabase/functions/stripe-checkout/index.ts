// stripe-checkout — Create a Stripe Checkout Session
// Called when a user wants to upgrade their plan
// Returns the Stripe Checkout URL for redirect

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

    if (!stripeSecretKey) {
      console.error('[stripe-checkout] STRIPE_SECRET_KEY not configured');
      return new Response(JSON.stringify({ error: 'Stripe non configuré' }), { status: 500, headers });
    }

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
      .from('profiles').select('organization_id, business_name, owner_name, email')
      .eq('user_id', user.id).maybeSingle();
    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'No organization found' }), { status: 403, headers });
    }

    // Verify admin role
    const { data: roleData } = await adminClient
      .from('user_roles').select('role')
      .eq('user_id', user.id).in('role', ['admin', 'super_admin']).maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers });
    }

    // ── Parse body ────────────────────────────────────────────────
    const { price_id, plan_id, billing_period } = await req.json();
    if (!price_id || !plan_id) {
      return new Response(JSON.stringify({ error: 'price_id and plan_id are required' }), { status: 400, headers });
    }

    // ── Validate price_id against DB ──────────────────────────────
    const { data: planData } = await adminClient
      .from('plans').select('id, stripe_price_id_monthly, stripe_price_id_yearly')
      .eq('id', plan_id).maybeSingle();

    if (!planData) {
      return new Response(JSON.stringify({ error: 'Plan introuvable' }), { status: 400, headers });
    }

    // Verify the price_id matches one configured for this plan
    const validPriceIds = [planData.stripe_price_id_monthly, planData.stripe_price_id_yearly].filter(Boolean);
    if (validPriceIds.length > 0 && !validPriceIds.includes(price_id)) {
      console.warn(`[stripe-checkout] Invalid price_id ${price_id} for plan ${plan_id}. Expected one of: ${validPriceIds.join(', ')}`);
      return new Response(JSON.stringify({ error: 'Prix invalide pour ce plan' }), { status: 400, headers });
    }

    // ── Get or create Stripe customer ─────────────────────────────
    let stripeCustomerId: string;

    const { data: existingCustomer } = await adminClient
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    if (existingCustomer?.stripe_customer_id) {
      stripeCustomerId = existingCustomer.stripe_customer_id;
    } else {
      // Create Stripe customer
      const customerParams = new URLSearchParams({
        email: user.email || profile.email || '',
        name: profile.business_name || profile.owner_name || '',
        'metadata[organization_id]': profile.organization_id,
        'metadata[supabase_user_id]': user.id,
      });

      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: customerParams,
      });

      const customerData = await customerRes.json();
      if (!customerRes.ok) {
        console.error('[stripe-checkout] Customer creation failed:', customerData);
        return new Response(
          JSON.stringify({ error: customerData.error?.message || 'Failed to create Stripe customer' }),
          { status: 502, headers }
        );
      }
      stripeCustomerId = customerData.id;

      // Save customer mapping
      await adminClient.from('stripe_customers').upsert({
        organization_id: profile.organization_id,
        stripe_customer_id: stripeCustomerId,
        email: user.email,
        name: profile.business_name || profile.owner_name,
      }, { onConflict: 'organization_id' });
    }

    // ── Create Checkout Session ───────────────────────────────────
    const appUrl = Deno.env.get('APP_URL') || 'https://makitiplus.onrender.com';

    const checkoutParams = new URLSearchParams({
      customer: stripeCustomerId,
      mode: 'subscription',
      'line_items[0][price]': price_id,
      'line_items[0][quantity]': '1',
      success_url: `${appUrl}/dashboard/billing?checkout=success`,
      cancel_url: `${appUrl}/dashboard/billing?checkout=cancelled`,
      'subscription_data[metadata][organization_id]': profile.organization_id,
      'subscription_data[metadata][plan_id]': plan_id,
      'subscription_data[metadata][user_id]': user.id,
      allow_promotion_codes: 'true',
    });

    // Add trial for upgrades from starter
    const { data: currentSub } = await adminClient
      .from('subscriptions')
      .select('plan_id')
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    if (currentSub?.plan_id === 'starter') {
      checkoutParams.set('subscription_data[trial_period_days]', '7');
    }

    const checkoutRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: checkoutParams,
    });

    const checkoutData = await checkoutRes.json();
    if (!checkoutRes.ok) {
      console.error('[stripe-checkout] Checkout session failed:', checkoutData);
      return new Response(
        JSON.stringify({ error: checkoutData.error?.message || 'Failed to create checkout session' }),
        { status: 502, headers }
      );
    }

    // Log checkout initiation
    await adminClient.from('subscription_events').insert({
      organization_id: profile.organization_id,
      event_type: 'checkout_initiated',
      metadata: {
        plan_id,
        price_id,
        billing_period: billing_period || 'monthly',
        stripe_customer_id: stripeCustomerId,
      },
    });

    return new Response(
      JSON.stringify({
        url: checkoutData.url,
        session_id: checkoutData.id,
      }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error('[stripe-checkout] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur interne du serveur' }),
      { status: 500, headers }
    );
  }
});
