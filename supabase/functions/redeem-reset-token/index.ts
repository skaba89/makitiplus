import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';
import { validatePasswordServer } from '../_shared/passwordPolicy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashToken(token: string): Promise<string> {
  const buffer = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function extractClientIp(req: Request): string | null {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for'),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const first = raw.split(',')[0]?.trim();
    if (first && first.length <= 64) return first;
  }
  return null;
}

// Public endpoint: user redeems a one-time token (from SMS) to set a new password.
// No JWT required.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const ipAddress = extractClientIp(req);

    const { token, newPassword } = await req.json();
    if (!token || !newPassword) {
      return new Response(JSON.stringify({ error: 'token et newPassword requis' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const policy = validatePasswordServer(newPassword);
    if (!policy.ok) {
      return new Response(JSON.stringify({ error: policy.error }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenHash = await hashToken(token);
    const { data: tokenRow, error: tokenErr } = await adminClient
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: 'Lien invalide' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (tokenRow.used_at) {
      return new Response(JSON.stringify({ error: 'Lien déjà utilisé' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Lien expiré' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
