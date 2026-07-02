// stripe-webhook — Handle Stripe webhook events
// Syncs subscription status, payment events, and customer data
// Sends transactional emails via Resend on key events
// Must be configured with STRIPE_WEBHOOK_SECRET env var

import { getCorsHeaders } from '../_shared/cors.ts';
import { sendEmail, paymentSuccessEmail, paymentFailedEmail, subscriptionCancelledEmail, planUpgradeEmail } from '../_shared/email-templates.ts';

Deno.serve(async (req) => {
  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const appUrl = Deno.env.get('APP_URL') || 'https://makitiplus.onrender.com';

  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set');
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 500, headers });
  }

  try {
    // ── Verify webhook signature ──────────────────────────────────
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400, headers });
    }

    // ── Verify webhook signature (HMAC-SHA256) ─────────────────────
    const sigParts = parseSignature(signature);
    if (!sigParts.t || !sigParts.v1) {
      console.warn('[stripe-webhook] Malformed signature header');
      return new Response(JSON.stringify({ error: 'Malformed signature' }), { status: 400, headers });
    }

    // Reject replays older than 5 minutes (300 seconds)
    const timestamp = parseInt(sigParts.t, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (isNaN(timestamp) || Math.abs(currentTime - timestamp) > 300) {
      console.warn('[stripe-webhook] Signature timestamp outside tolerance');
      return new Response(JSON.stringify({ error: 'Timestamp outside tolerance' }), { status: 400, headers });
    }

    const expectedSig = await computeSignature(webhookSecret, body, sigParts.t);

    if (sigParts.v1 !== expectedSig) {
      console.warn('[stripe-webhook] Invalid signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400, headers });
    }

    const event = JSON.parse(body);

    // ── Process event ─────────────────────────────────────────────
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.93.3');
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Helper: get org admin profile for email notifications
    const getOrgProfile = async (orgId: string) => {
      const { data } = await adminClient
        .from('profiles')
        .select('email, owner_name, business_name')
        .eq('organization_id', orgId)
        .limit(1)
        .maybeSingle();
      return data;
    };

    // Helper: get plan name
    const getPlanName = async (planId: string) => {
      const { data } = await adminClient
        .from('plans')
        .select('name')
        .eq('id', planId)
        .maybeSingle();
      return data?.name || planId;
    };

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orgId = session.metadata?.organization_id;
        const planId = session.metadata?.plan_id;
        const subscriptionId = session.subscription;

        if (orgId && planId && subscriptionId) {
          // Get subscription details from Stripe
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${stripeSecretKey}` },
          });
          const subData = await subRes.json();

          // Update subscription in DB
          await adminClient.rpc('handle_subscription_change', {
            p_org_id: orgId,
            p_plan_id: planId,
            p_stripe_subscription_id: subscriptionId,
            p_status: subData.status || 'active',
            p_period_start: subData.current_period_start ? new Date(subData.current_period_start * 1000).toISOString() : null,
            p_period_end: subData.current_period_end ? new Date(subData.current_period_end * 1000).toISOString() : null,
            p_event_type: 'upgraded',
          });

          // Update stripe_customers
          await adminClient
            .from('stripe_customers')
            .update({ stripe_subscription_id: subscriptionId, updated_at: new Date().toISOString() })
            .eq('organization_id', orgId);

          // Send upgrade confirmation email
          if (resendApiKey) {
            const profile = await getOrgProfile(orgId);
            if (profile?.email) {
              const planName = await getPlanName(planId);
              await sendEmail({
                resendApiKey,
                to: profile.email,
                subject: `🚀 MakitiPlus — Bienvenue dans le plan ${planName} !`,
                html: planUpgradeEmail({
                  name: profile.business_name || profile.owner_name || 'Utilisateur',
                  fromPlan: 'Starter',
                  toPlan: planName,
                  newFeatures: planId === 'croissance'
                    ? ['3 boutiques', '10 utilisateurs', 'Rapports avancés', 'Fournisseurs & commandes', 'WhatsApp Business', 'Branding personnalisé']
                    : ['Boutiques & utilisateurs illimités', 'API externe', 'Assistant IA', 'Support prioritaire', 'Programme fidélité'],
                  billingUrl: `${appUrl}/dashboard/billing`,
                }),
              });
            }
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const orgId = subscription.metadata?.organization_id;
        const planId = subscription.metadata?.plan_id;

        if (orgId) {
          const status = subscription.status;
          const eventType = status === 'canceled' ? 'cancelled' :
                            status === 'past_due' ? 'payment_failed' :
                            planId ? 'upgraded' : 'renewed';

          await adminClient.rpc('handle_subscription_change', {
            p_org_id: orgId,
            p_plan_id: planId || 'starter',
            p_stripe_subscription_id: subscription.id,
            p_status: status,
            p_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
            p_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
            p_event_type: eventType,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const orgId = subscription.metadata?.organization_id;

        if (orgId) {
          // Downgrade to starter
          await adminClient.rpc('handle_subscription_change', {
            p_org_id: orgId,
            p_plan_id: 'starter',
            p_stripe_subscription_id: subscription.id,
            p_status: 'cancelled',
            p_event_type: 'cancelled',
          });

          // Clear subscription ID
          await adminClient
            .from('stripe_customers')
            .update({ stripe_subscription_id: null, updated_at: new Date().toISOString() })
            .eq('organization_id', orgId);

          // Send cancellation email
          if (resendApiKey) {
            const profile = await getOrgProfile(orgId);
            if (profile?.email) {
              // Get current period end from subscription
              const periodEnd = subscription.current_period_end
                ? new Date(subscription.current_period_end * 1000).toLocaleDateString('fr-FR')
                : 'immédiatement';
              await sendEmail({
                resendApiKey,
                to: profile.email,
                subject: 'MakitiPlus — Abonnement annulé',
                html: subscriptionCancelledEmail({
                  name: profile.business_name || profile.owner_name || 'Utilisateur',
                  planName: await getPlanName('croissance'), // was on a paid plan
                  endDate: periodEnd,
                  billingUrl: `${appUrl}/dashboard/billing`,
                }),
              });
            }
          }
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        // Find org by customer ID
        const { data: customer } = await adminClient
          .from('stripe_customers')
          .select('organization_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (customer?.organization_id) {
          await adminClient.from('stripe_payments').insert({
            organization_id: customer.organization_id,
            stripe_customer_id: customerId,
            stripe_subscription_id: invoice.subscription || null,
            stripe_invoice_id: invoice.id,
            stripe_payment_intent_id: invoice.payment_intent || null,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: 'paid',
            plan_id: invoice.metadata?.plan_id || null,
            period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
            period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
            invoice_url: invoice.hosted_invoice_url || null,
            invoice_pdf: invoice.invoice_pdf || null,
          });

          // Log payment event
          await adminClient.from('subscription_events').insert({
            organization_id: customer.organization_id,
            event_type: 'payment_received',
            metadata: {
              invoice_id: invoice.id,
              amount: invoice.amount_paid,
              currency: invoice.currency,
            },
          });

          // Send payment confirmation email
          if (resendApiKey) {
            const profile = await getOrgProfile(customer.organization_id);
            if (profile?.email) {
              const planId = invoice.metadata?.plan_id || invoice.lines?.data?.[0]?.plan?.id;
              const planName = planId ? await getPlanName(planId) : 'Abonnement';
              const amount = `${(invoice.amount_paid / 100).toFixed(2)} ${(invoice.currency || 'usd').toUpperCase()}`;
              const periodEnd = invoice.period_end
                ? new Date(invoice.period_end * 1000).toLocaleDateString('fr-FR')
                : '—';
              await sendEmail({
                resendApiKey,
                to: profile.email,
                subject: `✅ MakitiPlus — Paiement reçu (${amount})`,
                html: paymentSuccessEmail({
                  name: profile.business_name || profile.owner_name || 'Utilisateur',
                  planName,
                  amount,
                  period: invoice.lines?.data?.[0]?.plan?.interval === 'year' ? 'Annuel' : 'Mensuel',
                  nextBillingDate: periodEnd,
                  billingUrl: `${appUrl}/dashboard/billing`,
                }),
              });
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const { data: customer } = await adminClient
          .from('stripe_customers')
          .select('organization_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (customer?.organization_id) {
          await adminClient.from('stripe_payments').insert({
            organization_id: customer.organization_id,
            stripe_customer_id: customerId,
            stripe_subscription_id: invoice.subscription || null,
            stripe_invoice_id: invoice.id,
            amount: invoice.amount_due,
            currency: invoice.currency,
            status: 'failed',
          });

          // Start grace period
          await adminClient
            .from('subscriptions')
            .update({
              status: 'grace_period',
              grace_period_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .eq('organization_id', customer.organization_id);

          await adminClient.from('subscription_events').insert({
            organization_id: customer.organization_id,
            event_type: 'payment_failed',
            metadata: { invoice_id: invoice.id, attempt: invoice.attempt_count },
          });

          // Send payment failure email
          if (resendApiKey) {
            const profile = await getOrgProfile(customer.organization_id);
            if (profile?.email) {
              const amount = `${(invoice.amount_due / 100).toFixed(2)} ${(invoice.currency || 'usd').toUpperCase()}`;
              const retryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR');
              await sendEmail({
                resendApiKey,
                to: profile.email,
                subject: `⚠️ MakitiPlus — Échec du paiement`,
                html: paymentFailedEmail({
                  name: profile.business_name || profile.owner_name || 'Utilisateur',
                  planName: 'votre abonnement',
                  amount,
                  retryDate,
                  billingUrl: `${appUrl}/dashboard/billing`,
                }),
              });
            }
          }
        }
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers });
  } catch (err) {
    console.error('[stripe-webhook] Error:', err);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed' }),
      { status: 500, headers }
    );
  }
});

// ── Signature verification helpers ────────────────────────────────────

function parseSignature(sig: string): { t: string; v1: string } {
  const parts: Record<string, string> = {};
  sig.split(',').forEach((part) => {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const key = part.substring(0, eqIdx).trim();
      const value = part.substring(eqIdx + 1).trim();
      parts[key] = value;
    }
  });
  return { t: parts['t'] || '', v1: parts['v1'] || '' };
}

/**
 * Compute Stripe webhook signature using HMAC-SHA256.
 * Stripe signs with: HMAC-SHA256(webhook_secret, timestamp + "." + payload)
 * The signature header format is: t=<timestamp>,v1=<signature>
 */
async function computeSignature(secret: string, payload: string, timestamp: string): Promise<string> {
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
