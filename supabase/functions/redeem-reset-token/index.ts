// redeem-reset-token — Public endpoint: redeem a one-time token to set a new password
// Uses _shared/ imports (deploy via Supabase CLI)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';
import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { requireMethod } from '../_shared/httpMethodGuard.ts';
import { validatePasswordServer } from '../_shared/passwordPolicy.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';
import { extractClientIp } from '../_shared/orgScope.ts';

const rateLimiter = createRateLimiter('redeem-reset-token', { maxRequests: 5, windowMs: 60_000 });

async function hashToken(token: string): Promise<string> {
  const buffer = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);
  const methodErr = requireMethod(req, 'POST');
  if (methodErr) return methodErr;

  try {
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
    const ipAddress = extractClientIp(req);

    const { token, newPassword } = await req.json();
    if (!token || !newPassword) {
      return rateLimiter.addHeaders(
        new Response(JSON.stringify({ error: 'token et newPassword requis' }), {
          status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rlResult,
      );
    }

    const policy = validatePasswordServer(newPassword);
    if (!policy.ok) {
      return rateLimiter.addHeaders(
        new Response(JSON.stringify({ error: policy.error }), {
          status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rlResult,
      );
    }

    const tokenHash = await hashToken(token);
    const { data: tokenRow, error: tokenErr } = await adminClient
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return rateLimiter.addHeaders(
        new Response(JSON.stringify({ error: 'Lien invalide' }), {
          status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rlResult,
      );
    }
    if (tokenRow.used_at) {
      return rateLimiter.addHeaders(
        new Response(JSON.stringify({ error: 'Lien déjà utilisé' }), {
          status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rlResult,
      );
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return rateLimiter.addHeaders(
        new Response(JSON.stringify({ error: 'Lien expiré' }), {
          status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rlResult,
      );
    }

    // Update password
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      tokenRow.user_id,
      { password: newPassword }
    );
    if (updateErr) throw updateErr;

    // Mark token used
    await adminClient
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);

    // Force re-login on all sessions
    await adminClient.auth.admin.signOut(tokenRow.user_id, 'global').catch(() => {});

    // Audit
    await adminClient.from('user_audit_log').insert({
      actor_id: null,
      actor_name: 'Auto (lien magique)',
      target_user_id: tokenRow.user_id,
      target_user_name: '—',
      action: 'user_password_reset_completed',
      details: { token_id: tokenRow.id },
      ip_address: ipAddress,
    });

    return rateLimiter.addHeaders(
      new Response(JSON.stringify({ success: true }), {
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
