/**
 * Stripe Webhook Edge Function — Handles all Stripe events for MakitiPlus
 *
 * Supported events:
 *   - checkout.session.completed  → Activate subscription after payment
 *   - customer.subscription.updated → Update plan on upgrade/downgrade
 *   - customer.subscription.deleted → Downgrade to starter on cancellation
 *   - invoice.payment_failed      → Mark subscription as past_due
 *
 * Idempotency: Uses stripe_events table with unique event_id.
 * Each event is processed exactly once — duplicate events are skipped.
 *
 * Security: Verifies Stripe webhook signature using STRIPE_WEBHOOK_SECRET.
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

// ─── Event Handlers ────────────────────────────────────────────

async function handleCheckoutCompleted(adminClient: ReturnType<typeof createClient>, session: Record<string, any>) {
  const orgId = session.metadata?.organization_id;
  const planId = session.metadata?.plan_id;

  if (!orgId || !planId) {
    console.error('[Stripe] checkout.session.completed missing metadata:', session.id);
    return;
  }

  // Upsert subscription
  const { error } = await adminClient
    .from('subscriptions')
    .upsert({
      organization_id: orgId,
      plan_id: planId,
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
    metadata: { stripe_session_id: session.id, amount: session.amount_total },
  });

  console.log(`[Stripe] Subscription activated: org=${orgId} plan=${planId}`);
}

async function handleSubscriptionUpdated(adminClient: ReturnType<typeof createClient>, subscription: Record<string, any>) {
  const orgId = subscription.metadata?.organization_id;
  if (!orgId) {
    console.error('[Stripe] subscription.updated missing metadata:', subscription.id);
    return;
  }

  // Map Stripe status to our status
  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    trialing: 'active',
    canceled: 'cancelled',
    unpaid: 'expired',
  };
  const newStatus = statusMap[subscription.status] || 'active';

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await adminClient
    .from('subscriptions')
    .update({
      status: newStatus,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId);

  if (error) {
    console.error('[Stripe] Failed to update subscription:', error.message);
    throw error;
  }

  await adminClient.from('subscription_events').insert({
    organization_id: orgId,
    event_type: newStatus === 'active' ? 'renewed' : 'payment_failed',
    to_plan: subscription.metadata?.plan_id,
    metadata: { stripe_subscription_id: subscription.id, stripe_status: subscription.status },
  });

  console.log(`[Stripe] Subscription updated: org=${orgId} status=${newStatus}`);
}

async function handleSubscriptionDeleted(adminClient: ReturnType<typeof createClient>, subscription: Record<string, any>) {
  const orgId = subscription.metadata?.organization_id;
  if (!orgId) return;

  // Downgrade to starter
  const { error } = await adminClient
    .from('subscriptions')
    .update({
      plan_id: 'starter',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId);

  if (error) throw error;

  await adminClient.from('subscription_events').insert({
    organization_id: orgId,
    event_type: 'cancelled',
    from_plan: subscription.metadata?.plan_id,
    to_plan: 'starter',
    metadata: { stripe_subscription_id: subscription.id },
  });

  console.log(`[Stripe] Subscription cancelled, downgraded to starter: org=${orgId}`);
}

async function handleInvoicePaymentFailed(adminClient: ReturnType<typeof createClient>, invoice: Record<string, any>) {
  const orgId = invoice.metadata?.organization_id;
  if (!orgId) return;

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
    metadata: { stripe_invoice_id: invoice.id, attempt_count: invoice.attempt_count },
  });

  console.log(`[Stripe] Payment failed: org=${orgId}`);
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
