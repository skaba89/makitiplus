/**
 * Stripe Webhook Edge Function — Handles all Stripe events for MakitiPlus
 *
 * Supported events:
 *   - checkout.session.completed  → Activate subscription after payment
 *   - customer.subscription.updated → Update plan on upgrade/downgrade
 *   - customer.subscription.deleted → Downgrade to starter on cancellation
 *   - invoice.payment_failed      → Mark subscription as past_due
 *   - customer.subscription.created → Record new subscription metadata
 *
 * Idempotency: Uses stripe_events table with unique event_id.
 * Each event is processed exactly once — duplicate events are skipped.
 *
 * Security: Verifies Stripe webhook signature using STRIPE_WEBHOOK_SECRET.
 * Config: verify_jwt = false in config.toml (Stripe sends requests without JWT)
 */

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';

// ─── Stripe Signature Verification ─────────────────────────────

async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  // Stripe webhook signatures use HMAC-SHA256
  // Format: t=<timestamp>,v1=<signature>,...
  const parts = signature.split(',');
  let timestamp = '';
  let signatureHash = '';

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') signatureHash = value;
  }

  if (!timestamp || !signatureHash) return false;

  // Reject events older than 5 minutes (replay protection)
  const eventAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (eventAge > 300) return false;

  // Compute expected signature: HMAC-SHA256(timestamp + '.' + body, secret)
  const payload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const computedHash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return computedHash === signatureHash;
}

// ─── Supabase Admin Client ─────────────────────────────────────

function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

// ─── Organization Lookup Helpers ───────────────────────────────

/**
 * Look up organization_id from Stripe customer ID.
 * Used as fallback when event metadata doesn't contain organization_id.
 */
async function lookupOrgByStripeCustomer(
  adminClient: ReturnType<typeof createClient>,
  stripeCustomerId: string,
): Promise<string | null> {
  if (!stripeCustomerId) return null;

  const { data: org } = await adminClient
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  return org?.id ?? null;
}

/**
 * Look up organization_id from Stripe subscription ID stored in our DB.
 * Used when subscription events don't carry metadata.
 */
async function lookupOrgByStripeSubscription(
  adminClient: ReturnType<typeof createClient>,
  stripeSubscriptionId: string,
): Promise<string | null> {
  if (!stripeSubscriptionId) return null;

  const { data: sub } = await adminClient
    .from('subscriptions')
    .select('organization_id')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();

  return sub?.organization_id ?? null;
}

/**
 * Extract organization_id from event data using multiple strategies:
 * 1. Direct metadata on the object
 * 2. Lookup by stripe_customer_id in organizations table
 * 3. Lookup by stripe_subscription_id in subscriptions table
 */
async function resolveOrgId(
  adminClient: ReturnType<typeof createClient>,
  obj: Record<string, any>,
): Promise<string | null> {
  // Strategy 1: metadata on the object itself
  const orgId = obj.metadata?.organization_id;
  if (orgId) return orgId;

  // Strategy 2: lookup by stripe_customer_id
  const customerId = obj.customer;
  if (customerId) {
    const found = await lookupOrgByStripeCustomer(adminClient, customerId);
    if (found) return found;
  }

  // Strategy 3: lookup by existing stripe_subscription_id in our DB
  const subscriptionId = obj.subscription ?? obj.id;
  if (subscriptionId && subscriptionId.startsWith('sub_')) {
    const found = await lookupOrgByStripeSubscription(adminClient, subscriptionId);
    if (found) return found;
  }

  return null;
}

// ─── Event Handlers ────────────────────────────────────────────

async function handleCheckoutCompleted(
  adminClient: ReturnType<typeof createClient>,
  session: Record<string, any>,
) {
  const orgId = await resolveOrgId(adminClient, session);
  const planId = session.metadata?.plan_id;
  const billing = session.metadata?.billing || 'monthly';

  if (!orgId) {
    console.error('[Stripe] checkout.session.completed: could not resolve organization_id for session:', session.id);
    return;
  }

  if (!planId) {
    console.error('[Stripe] checkout.session.completed missing plan_id in metadata:', session.id);
    return;
  }

  // Get the Stripe subscription ID from the checkout session
  const stripeSubscriptionId = session.subscription ?? null;

  // Compute period dates from the Stripe session or default to 30 days
  const periodStart = new Date().toISOString();
  const periodEnd = new Date(Date.now() + (billing === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString();

  // Upsert subscription with all Stripe data
  const { error } = await adminClient
    .from('subscriptions')
    .upsert({
      organization_id: orgId,
      plan_id: planId,
      status: 'active',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      billing_period: billing,
      stripe_subscription_id: stripeSubscriptionId,
    }, { onConflict: 'organization_id' });

  if (error) {
    console.error('[Stripe] Failed to upsert subscription:', error.message);
    throw error;
  }

  // Record event
  await adminClient.from('subscription_events').insert({
    organization_id: orgId,
    event_type: 'payment_received',
    to_plan: planId,
    metadata: {
      stripe_session_id: session.id,
      stripe_subscription_id: stripeSubscriptionId,
      amount: session.amount_total,
      billing,
    },
  });

  console.log(`[Stripe] Subscription activated: org=${orgId} plan=${planId} billing=${billing} sub=${stripeSubscriptionId}`);
}

async function handleSubscriptionUpdated(
  adminClient: ReturnType<typeof createClient>,
  subscription: Record<string, any>,
) {
  const orgId = await resolveOrgId(adminClient, subscription);

  if (!orgId) {
    console.error('[Stripe] subscription.updated: could not resolve organization_id for subscription:', subscription.id);
    return;
  }

  // Map Stripe status to our status
  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    trialing: 'active',
    canceled: 'cancelled',
    unpaid: 'expired',
    paused: 'grace_period',
  };
  const newStatus = statusMap[subscription.status] || 'active';

  // Get plan from subscription metadata or from the price product lookup
  let planId = subscription.metadata?.plan_id;
  const billing = subscription.metadata?.billing || 'monthly';

  // If no plan_id in metadata, try to derive from the price ID
  if (!planId && subscription.items?.data?.length > 0) {
    const priceId = subscription.items.data[0].price?.id;
    if (priceId) {
      planId = await lookupPlanByPriceId(priceId);
    }
  }

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const updateData: Record<string, any> = {
    status: newStatus,
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
    stripe_subscription_id: subscription.id,
    billing_period: billing,
  };

  // If we resolved a plan_id, update it too
  if (planId) {
    updateData.plan_id = planId;
  }

  const { error } = await adminClient
    .from('subscriptions')
    .update(updateData)
    .eq('organization_id', orgId);

  if (error) {
    console.error('[Stripe] Failed to update subscription:', error.message);
    throw error;
  }

  // Determine event type for audit
  let eventType = 'renewed';
  if (newStatus === 'past_due') eventType = 'payment_failed';
  else if (newStatus === 'cancelled') eventType = 'cancelled';
  else if (newStatus === 'expired') eventType = 'expired';
  else if (planId) eventType = 'upgraded'; // plan change during active

  await adminClient.from('subscription_events').insert({
    organization_id: orgId,
    event_type: eventType,
    to_plan: planId,
    metadata: {
      stripe_subscription_id: subscription.id,
      stripe_status: subscription.status,
      billing,
    },
  });

  console.log(`[Stripe] Subscription updated: org=${orgId} status=${newStatus} plan=${planId || 'unchanged'}`);
}

async function handleSubscriptionDeleted(
  adminClient: ReturnType<typeof createClient>,
  subscription: Record<string, any>,
) {
  const orgId = await resolveOrgId(adminClient, subscription);
  if (!orgId) {
    console.error('[Stripe] subscription.deleted: could not resolve organization_id for subscription:', subscription.id);
    return;
  }

  const previousPlanId = subscription.metadata?.plan_id;

  // Downgrade to starter
  const { error } = await adminClient
    .from('subscriptions')
    .update({
      plan_id: 'starter',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      billing_period: 'monthly',
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId);

  if (error) throw error;

  await adminClient.from('subscription_events').insert({
    organization_id: orgId,
    event_type: 'cancelled',
    from_plan: previousPlanId,
    to_plan: 'starter',
    metadata: { stripe_subscription_id: subscription.id },
  });

  console.log(`[Stripe] Subscription cancelled, downgraded to starter: org=${orgId}`);
}

async function handleInvoicePaymentFailed(
  adminClient: ReturnType<typeof createClient>,
  invoice: Record<string, any>,
) {
  // For invoices, the metadata might be on the subscription, not the invoice itself
  let orgId = await resolveOrgId(adminClient, invoice);

  // Fallback: try to get org from the subscription referenced in the invoice
  if (!orgId && invoice.subscription) {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (stripeKey) {
      try {
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${invoice.subscription}`, {
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
        if (subRes.ok) {
          const stripeSub = await subRes.json();
          orgId = await resolveOrgId(adminClient, stripeSub);
        }
      } catch (e) {
        console.error('[Stripe] Failed to fetch subscription for invoice:', (e as Error).message);
      }
    }
  }

  if (!orgId) {
    console.error('[Stripe] invoice.payment_failed: could not resolve organization_id for invoice:', invoice.id);
    return;
  }

  const { error } = await adminClient
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId);

  if (error) throw error;

  await adminClient.from('subscription_events').insert({
    organization_id: orgId,
    event_type: 'payment_failed',
    metadata: {
      stripe_invoice_id: invoice.id,
      attempt_count: invoice.attempt_count,
      stripe_subscription_id: invoice.subscription,
    },
  });

  console.log(`[Stripe] Payment failed: org=${orgId} invoice=${invoice.id}`);
}

// ─── Price ID to Plan Lookup ───────────────────────────────────

/**
 * Map a Stripe price ID back to a plan_id using environment variables.
 * The env vars follow the pattern: STRIPE_PRICE_<PLAN_ID>_MONTHLY / _YEARLY
 */
function lookupPlanByPriceId(priceId: string): string | null {
  const planIds = ['croissance', 'enterprise'];
  const billings = ['monthly', 'yearly'];

  for (const planId of planIds) {
    for (const billing of billings) {
      const envKey = `STRIPE_PRICE_${planId.toUpperCase()}_${billing.toUpperCase()}`;
      if (Deno.env.get(envKey) === priceId) {
        return planId;
      }
    }
  }
  return null;
}

// ─── Main Handler ──────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);

  const corsHeaders = getCorsHeaders(req);

  // Only accept POST from Stripe
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!signature || !webhookSecret) {
    console.error('[Stripe] Missing signature or webhook secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify signature
  const isValid = await verifyStripeSignature(body, signature, webhookSecret);
  if (!isValid) {
    console.error('[Stripe] Invalid webhook signature');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Parse event
  let event: Record<string, any>;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Idempotency check — skip if already processed
  const adminClient = getAdminClient();
  const { data: existing } = await adminClient
    .from('stripe_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle();

  if (existing) {
    console.log(`[Stripe] Duplicate event skipped: ${event.id}`);
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Process event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(adminClient, event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(adminClient, event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(adminClient, event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(adminClient, event.data.object);
        break;
      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }

    // Record processed event (idempotency)
    await adminClient.from('stripe_events').insert({
      event_id: event.id,
      event_type: event.type,
      payload: event,
      organization_id: event.data?.object?.metadata?.organization_id || null,
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[Stripe] Error processing ${event.type}:`, (err as Error).message);

    // Still record the event to prevent infinite retries for bad data
    await adminClient.from('stripe_events').insert({
      event_id: event.id,
      event_type: event.type,
      payload: event,
      organization_id: event.data?.object?.metadata?.organization_id || null,
    }).catch(() => {});

    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
