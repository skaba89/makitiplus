// stripe-webhook — Handles Stripe webhook events
// Configured in Stripe Dashboard → Webhooks → Endpoint URL
// Must verify Stripe signature for security

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';

// Simple HMAC-SHA256 verification using Web Crypto API
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const [timestampPart, signaturePart] = signature.split(',').reduce(
    (acc, part) => {
      const [key, value] = part.split('=');
      if (key === 't') acc[0] = value;
      if (key === 'v1') acc[1] = value;
      return acc;
    },
    ['', ''],
  );

  if (!timestampPart || !signaturePart) return false;

  // Reject events older than 5 minutes
  const timestamp = parseInt(timestampPart, 10);
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const signedPayload = `${timestampPart}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload),
  );

  const computedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Timing-safe comparison to prevent timing attacks
  if (computedSig.length !== signaturePart.length) return false;
  const a = new TextEncoder().encode(computedSig);
  const b = new TextEncoder().encode(signaturePart);
  if (a.byteLength !== b.byteLength) return false;
  const diff = new Uint8Array(a.byteLength);
  for (let i = 0; i < a.byteLength; i++) diff[i] = a[i] ^ b[i];
  return diff.every(v => v === 0);
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
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    const payload = await req.text();
    const signature = req.headers.get('stripe-signature');

    // Verify signature in production
    if (webhookSecret && signature) {
      const isValid = await verifyStripeSignature(payload, signature, webhookSecret);
      if (!isValid) {
        console.error('[stripe-webhook] Invalid signature');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
    } else if (webhookSecret) {
      console.error('[stripe-webhook] Missing stripe-signature header');
      return new Response(JSON.stringify({ error: 'Missing signature' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    } else {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — rejecting request');
      return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(payload);
    const eventId = event.id;

    // Idempotency: skip already-processed events (Stripe retries on failure)
    // Store event IDs in Deno KV with 24h TTL to prevent duplicate processing
    if (eventId) {
      try {
        const kv = await Deno.openKv();
        const existing = await kv.get(['stripe_events', eventId]);
        if (existing.value) {
          console.log(`[stripe-webhook] Duplicate event ${eventId} — skipping`);
          kv.close();
          return new Response(JSON.stringify({ received: true, duplicate: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Mark as processed with 24h expiry (86400 seconds)
        await kv.set(['stripe_events', eventId], { type: event.type, processedAt: Date.now() }, { expireIn: 86_400_000 });
        kv.close();
      } catch (kvErr) {
        // KV unavailable — log but continue (non-critical, idempotency is best-effort)
        console.warn('[stripe-webhook] KV unavailable for idempotency check:', (kvErr as Error).message);
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.93.3');
    const adminClient = createClient(supabaseUrl, serviceKey);

    console.log(`[stripe-webhook] Event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        // Get organization from customer metadata or lookup
        const { data: org } = await adminClient
          .from('organizations')
          .select('id, stripe_customer_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (!org) {
          // Try to find org from subscription metadata
          // Retrieve subscription from Stripe to get metadata
          console.error(`[stripe-webhook] No organization found for customer ${customerId}`);
          break;
        }

        // Retrieve subscription details from Stripe to get plan info
        const secretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { Authorization: `Bearer ${secretKey}` },
        });
        if (!subRes.ok) {
          const errData = await subRes.json().catch(() => ({}));
          console.error(`[stripe-webhook] Failed to retrieve subscription: ${errData.error?.message ?? subRes.status}`);
          break;
        }
        const subscription = await subRes.json();

        // Determine plan from price ID
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const croissancePriceId = Deno.env.get('STRIPE_PRICE_ID_CROISSANCE') ?? '';
        const enterprisePriceId = Deno.env.get('STRIPE_PRICE_ID_ENTERPRISE') ?? '';

        let plan: string = 'croissance'; // default
        if (priceId === enterprisePriceId) {
          plan = 'enterprise';
        } else if (priceId === croissancePriceId) {
          plan = 'croissance';
        }

        // Calculate subscription end date from Stripe
        const currentPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;

        // Update organization with subscription details
        const { error: updateError } = await adminClient
          .from('organizations')
          .update({
            subscription_plan: plan,
            subscription_expires_at: currentPeriodEnd,
            stripe_customer_id: customerId,
          })
          .eq('id', org.id);

        if (updateError) {
          console.error(`[stripe-webhook] Failed to update org: ${updateError.message}`);
        } else {
          console.log(`[stripe-webhook] Updated org ${org.id} to plan: ${plan}`);
        }

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const subscriptionId = subscription.id;

        const { data: org } = await adminClient
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (!org) {
          console.error(`[stripe-webhook] No organization found for customer ${customerId}`);
          break;
        }

        // Determine plan from price ID
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const croissancePriceId = Deno.env.get('STRIPE_PRICE_ID_CROISSANCE') ?? '';
        const enterprisePriceId = Deno.env.get('STRIPE_PRICE_ID_ENTERPRISE') ?? '';

        let plan: string = 'croissance';
        if (priceId === enterprisePriceId) {
          plan = 'enterprise';
        } else if (priceId === croissancePriceId) {
          plan = 'croissance';
        }

        const currentPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;

        // Handle cancellation at period end
        const isCanceled = subscription.cancel_at_period_end === true;

        await adminClient
          .from('organizations')
          .update({
            subscription_plan: isCanceled ? 'starter' : plan,
            subscription_expires_at: currentPeriodEnd,
          })
          .eq('id', org.id);

        console.log(`[stripe-webhook] Updated org ${org.id} — plan: ${isCanceled ? 'starter (canceled)' : plan}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const { data: org } = await adminClient
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (!org) break;

        // Downgrade to starter when subscription is deleted
        await adminClient
          .from('organizations')
          .update({
            subscription_plan: 'starter',
            subscription_expires_at: null,
          })
          .eq('id', org.id);

        console.log(`[stripe-webhook] Subscription deleted for org ${org.id} — downgraded to starter`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        console.warn(`[stripe-webhook] Payment failed for customer ${customerId}`);
        // Could send email notification or create alert
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[stripe-webhook] Error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Webhook handler failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
