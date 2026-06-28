// rotate-test-accounts — Cron job: deactivate expired test accounts
// Uses _shared/ imports (deploy via Supabase CLI)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';
import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { requireMethod } from '../_shared/httpMethodGuard.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';

const rateLimiter = createRateLimiter('rotate-test-accounts', { maxRequests: 10, windowMs: 5 * 60_000 });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);
  const methodErr = requireMethod(req, 'POST');
  if (methodErr) return methodErr;

  try {
    // Verify shared cron secret — only pg_cron or authorized callers can invoke this
    const cronSecret = Deno.env.get('CRON_SECRET');
    const requestSecret = req.headers.get('X-Cron-Secret');
    if (cronSecret && requestSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Accès non autorisé' }), {
        status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Rate limit check
    const rlResult = await rateLimiter.check(req);
    if (!rlResult.allowed) {
      return rateLimiter.addHeaders(
        new Response(JSON.stringify({ error: rlResult.error }), {
          status: 429,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rlResult,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();

    // Find expired active test accounts
    const { data: expired, error: selectErr } = await adminClient
      .from('profiles')
      .select('user_id, owner_name, test_expires_at')
      .eq('is_test_account', true)
      .eq('is_active', true)
      .lt('test_expires_at', now);

    if (selectErr) throw selectErr;
    if (!expired || expired.length === 0) {
      return rateLimiter.addHeaders(
        new Response(JSON.stringify({ success: true, deactivated: 0 }), {
          status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rlResult,
      );
    }

    let deactivated = 0;
    for (const profile of expired) {
      const { error } = await adminClient.from('profiles').update({
        is_active: false,
        deactivated_at: now,
        deactivation_reason: 'Compte de test expiré (rotation automatique)',
      }).eq('user_id', profile.user_id);

      if (!error) {
        deactivated++;
        // Sign out all sessions
        await adminClient.auth.admin.signOut(profile.user_id, 'global').catch(() => {});
        // Audit
        await adminClient.from('user_audit_log').insert({
          actor_id: null,
          actor_name: 'Système (rotation auto)',
          target_user_id: profile.user_id,
          target_user_name: profile.owner_name,
          action: 'user_deactivated',
          details: { reason: 'Test account expired', expired_at: profile.test_expires_at },
        });
      }
    }

    return rateLimiter.addHeaders(
      new Response(JSON.stringify({ success: true, deactivated, total: expired.length }), {
        status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }),
      rlResult,
    );
  } catch (err) {
    console.error("[EdgeFn] Internal error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
