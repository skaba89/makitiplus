// stripe-webhook — Handles Stripe webhook events
// Configured in Stripe Dashboard → Webhooks → Endpoint URL
// Must verify Stripe signature for security

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { requireMethod } from '../_shared/httpMethodGuard.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';
import { resolvePlanFromPriceId } from '../_shared/stripeApi.ts';
import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';

// Rate limit: 100 req/min — Stripe webhooks can retry aggressively, but we
// still need protection against brute-force signature attempts.
const limiter = createRateLimiter('stripe-webhook', { maxRequests: 100, windowMs: 60_000 });

// Idempotency states
type EventStatus = 'processing' | 'succeeded' | 'failed';

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
  return timingSafeEqual(computedSig, signaturePart);
}

Deno.serve(async (req) => {
  const methodErr = requireMethod(req, 'POST');
  if (methodErr) return methodErr;

  // Rate limit check — defense-in-depth even for Stripe-initiated calls
  const rateResult = await limiter.check(req);
  if (!rateResult.allowed) {
    return limiter.addHeaders(
      new Response(JSON.stringify({ error: rateResult.error }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
      rateResult,
    );
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

    // ── Idempotency: processing → succeeded pattern ─────────────
    // 1. Check if already succeeded → skip (duplicate)
    // 2. If currently processing and recent → return accepted (Stripe will retry)
    // 3. Otherwise mark as processing, do work, then mark succeeded
    // 4. On failure, delete key to allow Stripe retry
    if (eventId) {
      let kv: Deno.Kv | null = null;
      try {
        kv = await Deno.openKv();
        const existing = await kv.get<{ status: EventStatus; type: string; processedAt: number }>(['stripe_events', eventId]);

        if (existing.value) {
          if (existing.value.status === 'succeeded') {
            console.log(`[stripe-webhook] Duplicate event ${eventId} — already succeeded, skipping`);
            return new Response(JSON.stringify({ received: true, duplicate: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (existing.value.status === 'processing') {
            // Still being processed — return accepted so Stripe retries later
            const age = Date.now() - existing.value.processedAt;
            if (age < 60_000) {
              console.log(`[stripe-webhook] Event ${eventId} still processing (${age}ms ago) — returning accepted`);
              return new Response(JSON.stringify({ received: true, processing: true }), {
                status: 202,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            // Processing for over 1 minute — likely stuck, allow retry by clearing
            console.warn(`[stripe-webhook] Event ${eventId} stuck in processing for ${age}ms — allowing retry`);
          }
        }

        // Mark as processing with 24h expiry
        await kv.set(['stripe_events', eventId], { status: 'processing' as EventStatus, type: event.type, processedAt: Date.now() }, { expireIn: 86_400_000 });
      } catch (kvErr) {
        // KV unavailable — log but continue (non-critical, idempotency is best-effort)
        console.warn('[stripe-webhook] KV unavailable for idempotency check:', (kvErr as Error).message);
      } finally {
        kv?.close();
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.93.3');
    const adminClient = createClient(supabaseUrl, serviceKey);

    console.log(`[stripe-webhook] Event: ${event.type}`);

    // ── Process event ────────────────────────────────────────────
    let processingError = false;

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const customerId = session.customer;
          const subscriptionId = session.subscription;

          // Get organization from customer lookup
          const { data: org } = await adminClient
            .from('organizations')
            .select('id, stripe_customer_id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();

          if (!org) {
            console.error(`[stripe-webhook] No organization found for customer ${customerId}`);
            processingError = true;
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
            processingError = true;
            break;
          }
          const subscription = await subRes.json();

          // Determine plan from price ID — reject unknown price IDs
          const priceId = subscription.items?.data?.[0]?.price?.id;
          const plan = resolvePlanFromPriceId(priceId);

          if (!plan) {
            console.error(`[stripe-webhook] Unknown price ID: ${priceId} — skipping event`);
            processingError = true;
            break;
          }

          // Calculate subscription dates from Stripe
          const currentPeriodStart = subscription.current_period_start
            ? new Date(subscription.current_period_start * 1000).toISOString()
            : new Date().toISOString();
          const currentPeriodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;

          // 1. Upsert into subscriptions table (source of truth)
          const { error: subUpsertError } = await adminClient
            .from('subscriptions')
            .upsert({
              organization_id: org.id,
              plan_id: plan,
              status: 'active',
              billing_period: 'monthly',
              current_period_start: currentPeriodStart,
              current_period_end: currentPeriodEnd,
              stripe_subscription_id: subscriptionId,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id' });

          if (subUpsertError) {
            console.error(`[stripe-webhook] Failed to upsert subscription: ${subUpsertError.message}`);
          }

          // 2. Update organization cache (retrocompat)
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
            processingError = true;
            break;
          }

          // Determine plan from price ID — reject unknown price IDs
          const priceId = subscription.items?.data?.[0]?.price?.id;
          const plan = resolvePlanFromPriceId(priceId);

          // Handle cancellation at period end — always valid regardless of price ID
          const isCanceled = subscription.cancel_at_period_end === true;

          if (!plan && !isCanceled) {
            console.error(`[stripe-webhook] Unknown price ID: ${priceId} for subscription update — skipping`);
            processingError = true;
            break;
          }

          const currentPeriodStart = subscription.current_period_start
            ? new Date(subscription.current_period_start * 1000).toISOString()
            : new Date().toISOString();
          const currentPeriodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;

          const effectiveStatus = isCanceled ? 'cancelled' : 'active';
          const effectivePlan = isCanceled ? 'starter' : plan!;

          // 1. Upsert into subscriptions table
          await adminClient
            .from('subscriptions')
            .upsert({
              organization_id: org.id,
              plan_id: effectivePlan,
              status: effectiveStatus,
              billing_period: 'monthly',
              current_period_start: currentPeriodStart,
              current_period_end: currentPeriodEnd,
              stripe_subscription_id: subscriptionId,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id' });

          // 2. Update organization cache
          await adminClient
            .from('organizations')
            .update({
              subscription_plan: effectivePlan,
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

          if (!org) {
            processingError = true;
            break;
          }

          // 1. Update subscriptions table — mark as cancelled / downgrade to starter
          const { error: subUpdateError } = await adminClient
            .from('subscriptions')
            .update({
              plan_id: 'starter',
              status: 'cancelled',
              stripe_subscription_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq('organization_id', org.id);

          if (subUpdateError) {
            console.error(`[stripe-webhook] Failed to update subscription: ${subUpdateError.message}`);
          }

          // 2. Update organization cache
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
    } catch (processingErr) {
      console.error('[stripe-webhook] Processing error:', (processingErr as Error).message);
      processingError = true;
    }

    // ── Update idempotency status ────────────────────────────────
    if (eventId) {
      let kv: Deno.Kv | null = null;
      try {
        kv = await Deno.openKv();
        if (processingError) {
          // Delete key to allow Stripe retry
          await kv.delete(['stripe_events', eventId]);
          console.warn(`[stripe-webhook] Event ${eventId} failed — removed idempotency key for retry`);
        } else {
          // Mark as succeeded — only after all processing completed successfully
          await kv.set(['stripe_events', eventId], { status: 'succeeded' as EventStatus, type: event.type, processedAt: Date.now() }, { expireIn: 86_400_000 });
        }
      } catch (kvErr) {
        console.warn('[stripe-webhook] KV unavailable for idempotency update:', (kvErr as Error).message);
      } finally {
        kv?.close();
      }
    }

    // Return 200 to Stripe even on processing error — we've already cleared the
    // idempotency key so Stripe will retry. Returning 500 would cause immediate
    // retry which may not help if the issue is transient.
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
