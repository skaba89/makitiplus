// subscription-lifecycle — Automated subscription lifecycle transitions
//
// Called periodically (pg_cron or external scheduler) to process:
//   1. grace_period → read_only   (when grace_period_ends_at < NOW)
//   2. read_only → expired        (after 14 days in read_only)
//   3. expired → starter (active) (after 30 days expired, auto-downgrade)
//
// Also sends email notifications at each transition via Resend.
//
// Can be triggered:
//   - By pg_cron: SELECT public.process_subscription_lifecycle();
//   - By this Edge Function: POST /functions/v1/subscription-lifecycle
//   - The Edge Function is needed because pg_cron cannot send emails

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);
  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };

  // Only allow POST with a cron secret or service role
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  // Verify authorization: either CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const providedKey = authHeader?.replace('Bearer ', '');
  if (cronSecret && providedKey !== cronSecret && providedKey !== serviceKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const appUrl = Deno.env.get('APP_URL') || 'https://makitiplus.onrender.com';

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.93.3');
    const adminClient = createClient(supabaseUrl, serviceKey);

    const results = {
      grace_to_read_only: 0,
      read_only_to_expired: 0,
      expired_to_starter: 0,
      emails_sent: 0,
      errors: [] as string[],
    };

    // ── Transition 1: grace_period → read_only ─────────────────────
    const { data: gracePeriodSubs, error: gprError } = await adminClient
      .from('subscriptions')
      .select('id, organization_id, plan_id, grace_period_ends_at')
      .eq('status', 'grace_period')
      .lt('grace_period_ends_at', new Date().toISOString());

    if (gprError) {
      results.errors.push(`grace_period query: ${gprError.message}`);
    } else if (gracePeriodSubs && gracePeriodSubs.length > 0) {
      for (const sub of gracePeriodSubs) {
        // Update status
        const { error: updateError } = await adminClient
          .from('subscriptions')
          .update({ status: 'read_only', updated_at: new Date().toISOString() })
          .eq('id', sub.id);

        if (updateError) {
          results.errors.push(`grace→read_only org ${sub.organization_id}: ${updateError.message}`);
          continue;
        }

        // Log event
        await adminClient.from('subscription_events').insert({
          organization_id: sub.organization_id,
          event_type: 'read_only_started',
          to_plan: sub.plan_id,
          metadata: {
            trigger: 'lifecycle_cron',
            previous_status: 'grace_period',
            grace_period_ends_at: sub.grace_period_ends_at,
          },
        });

        // Send email notification
        if (resendApiKey) {
          await sendLifecycleEmail(adminClient, resendApiKey, appUrl, sub.organization_id, 'read_only_started');
          results.emails_sent++;
        }

        results.grace_to_read_only++;
      }
    }

    // ── Transition 2: read_only → expired (after 14 days) ──────────
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: readOnlySubs, error: roError } = await adminClient
      .from('subscriptions')
      .select('id, organization_id, plan_id, updated_at')
      .eq('status', 'read_only')
      .lt('updated_at', fourteenDaysAgo);

    if (roError) {
      results.errors.push(`read_only query: ${roError.message}`);
    } else if (readOnlySubs && readOnlySubs.length > 0) {
      for (const sub of readOnlySubs) {
        const { error: updateError } = await adminClient
          .from('subscriptions')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', sub.id);

        if (updateError) {
          results.errors.push(`read_only→expired org ${sub.organization_id}: ${updateError.message}`);
          continue;
        }

        await adminClient.from('subscription_events').insert({
          organization_id: sub.organization_id,
          event_type: 'expired',
          to_plan: sub.plan_id,
          metadata: {
            trigger: 'lifecycle_cron',
            previous_status: 'read_only',
            days_read_only: 14,
          },
        });

        if (resendApiKey) {
          await sendLifecycleEmail(adminClient, resendApiKey, appUrl, sub.organization_id, 'expired');
          results.emails_sent++;
        }

        results.read_only_to_expired++;
      }
    }

    // ── Transition 3: expired → auto-downgrade to starter (after 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: expiredSubs, error: expError } = await adminClient
      .from('subscriptions')
      .select('id, organization_id, plan_id, updated_at')
      .eq('status', 'expired')
      .neq('plan_id', 'starter')
      .lt('updated_at', thirtyDaysAgo);

    if (expError) {
      results.errors.push(`expired query: ${expError.message}`);
    } else if (expiredSubs && expiredSubs.length > 0) {
      for (const sub of expiredSubs) {
        // Downgrade to starter
        const { error: updateError } = await adminClient
          .from('subscriptions')
          .update({
            plan_id: 'starter',
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            trial_ends_at: null,
            grace_period_ends_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id);

        if (updateError) {
          results.errors.push(`expired→starter org ${sub.organization_id}: ${updateError.message}`);
          continue;
        }

        // Clear Stripe subscription ID
        await adminClient
          .from('stripe_customers')
          .update({ stripe_subscription_id: null, updated_at: new Date().toISOString() })
          .eq('organization_id', sub.organization_id);

        // Log event
        await adminClient.from('subscription_events').insert({
          organization_id: sub.organization_id,
          event_type: 'auto_downgraded',
          from_plan: sub.plan_id,
          to_plan: 'starter',
          metadata: {
            trigger: 'lifecycle_cron',
            previous_status: 'expired',
            days_expired: 30,
          },
        });

        if (resendApiKey) {
          await sendLifecycleEmail(adminClient, resendApiKey, appUrl, sub.organization_id, 'auto_downgraded');
          results.emails_sent++;
        }

        results.expired_to_starter++;
      }
    }

    console.log(`[subscription-lifecycle] Processed: ${results.grace_to_read_only} grace→ro, ${results.read_only_to_expired} ro→expired, ${results.expired_to_starter} expired→starter, ${results.emails_sent} emails sent`);

    return new Response(JSON.stringify({
      success: true,
      processed: results,
      timestamp: new Date().toISOString(),
    }), { status: 200, headers });

  } catch (err) {
    console.error('[subscription-lifecycle] Fatal error:', err);
    return new Response(
      JSON.stringify({ error: 'Lifecycle processing failed', details: String(err) }),
      { status: 500, headers }
    );
  }
});

// ─── Email Helper ────────────────────────────────────────────────────────

async function sendLifecycleEmail(
  adminClient: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2.93.3').createClient>,
  resendApiKey: string,
  appUrl: string,
  orgId: string,
  eventType: string,
): Promise<void> {
  try {
    // Get org admin email
    const { data: profile } = await adminClient
      .from('profiles')
      .select('email, owner_name, business_name, organization_id')
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle();

    if (!profile?.email) {
      console.warn(`[subscription-lifecycle] No email found for org ${orgId}`);
      return;
    }

    const subject = getSubject(eventType, profile.business_name);
    const html = getHtmlBody(eventType, profile.business_name || profile.owner_name || 'Utilisateur', appUrl);

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MakitiPlus <noreply@makitiplus.com>',
        to: profile.email,
        subject,
        html,
      }),
    });
  } catch (err) {
    console.error(`[subscription-lifecycle] Email failed for org ${orgId}:`, err);
  }
}

function getSubject(eventType: string, businessName: string | null): string {
  const name = businessName || 'votre compte';
  switch (eventType) {
    case 'read_only_started':
      return `⚠️ MakitiPlus — Accès restreint pour ${name}`;
    case 'expired':
      return `🔴 MakitiPlus — Abonnement expiré pour ${name}`;
    case 'auto_downgraded':
      return `MakitiPlus — Votre plan a été réinitialisé`;
    default:
      return `MakitiPlus — Mise à jour de votre abonnement`;
  }
}

function getHtmlBody(eventType: string, name: string, appUrl: string): string {
  const billingUrl = `${appUrl}/dashboard/billing`;

  switch (eventType) {
    case 'read_only_started':
      return `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d97706;">⚠️ Votre accès est maintenant restreint</h2>
          <p>Bonjour ${name},</p>
          <p>Votre période de grâce est terminée. Votre compte MakitiPlus est maintenant en <strong>mode lecture seule</strong>.</p>
          <p>Vous pouvez toujours consulter vos données, mais vous ne pouvez plus effectuer de ventes, ajouter des produits ou modifier des informations.</p>
          <p>Pour retrouver l'accès complet, veuillez mettre à jour votre méthode de paiement :</p>
          <a href="${billingUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
            Mettre à jour le paiement
          </a>
          <p style="color: #6b7280; font-size: 14px;">Si vous ne mettez pas à jour votre paiement dans les 14 prochains jours, votre abonnement sera annulé.</p>
        </div>`;

    case 'expired':
      return `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #dc2626;">🔴 Votre abonnement a expiré</h2>
          <p>Bonjour ${name},</p>
          <p>Votre abonnement MakitiPlus a expiré après 14 jours en accès restreint.</p>
          <p>Vos données sont conservées, mais votre compte sera automatiquement réinitialisé au plan Starter dans 30 jours si aucune action n'est entreprise.</p>
          <a href="${billingUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
            Réactiver mon abonnement
          </a>
          <p style="color: #6b7280; font-size: 14px;">Toutes vos données seront préservées si vous réactivez avant le passage au plan Starter.</p>
        </div>`;

    case 'auto_downgraded':
      return `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Plan réinitialisé au Starter</h2>
          <p>Bonjour ${name},</p>
          <p>Votre abonnement MakitiPlus a été automatiquement réinitialisé au plan <strong>Starter (gratuit)</strong> après expiration.</p>
          <p>Vous pouvez continuer à utiliser les fonctionnalités de base. Si vous souhaitez retrouver les fonctionnalités avancées :</p>
          <a href="${billingUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
            Voir les plans disponibles
          </a>
          <p style="color: #6b7280; font-size: 14px;">Nous espérons vous revoir bientôt ! L'équipe MakitiPlus.</p>
        </div>`;

    default:
      return `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Mise à jour de votre abonnement</h2>
          <p>Bonjour ${name},</p>
          <p>Le statut de votre abonnement MakitiPlus a été mis à jour.</p>
          <a href="${billingUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
            Voir mon abonnement
          </a>
        </div>`;
  }
}
