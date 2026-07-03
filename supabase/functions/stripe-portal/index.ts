// stripe-portal — Creates a Stripe Customer Portal session
// Allows users to manage their subscription (upgrade, cancel, update payment method)

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';

const STRIPE_API = 'https://api.stripe.com/v1';

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
    // 1. Authenticate user
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

    // 2. Get organization with Stripe customer ID
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'Aucune organisation associée' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { data: org } = await adminClient
      .from('organizations')
      .select('stripe_customer_id, subscription_plan')
      .eq('id', profile.organization_id)
      .maybeSingle();

    if (!org?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: 'Aucun abonnement actif. Souscrivez d\'abord à un plan.' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // 3. Create Customer Portal session
    const origin = req.headers.get('origin') ?? 'https://makitiplus.onrender.com';
    const returnUrl = `${origin}/dashboard/billing`;

    const session = await stripeRequest('/billing_portal/sessions', 'POST', {
      customer: org.stripe_customer_id,
      return_url: returnUrl,
    });

    return new Response(JSON.stringify({
      url: session.url,
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[stripe-portal] Error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Impossible de créer la session portail' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
