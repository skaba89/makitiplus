import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Hash a token using SHA-256 (Web Crypto)
async function hashToken(token: string): Promise<string> {
  const buffer = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSecureToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sendSmsViaTwilio(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
  const TWILIO_FROM = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_FROM) {
    return { ok: false, error: 'Twilio non configuré (connectez Twilio dans Connecteurs et ajoutez TWILIO_FROM_NUMBER)' };
  }

  const response = await fetch('https://connector-gateway.lovable.dev/twilio/Messages.json', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': TWILIO_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `Twilio ${response.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from('user_roles').select('role')
      .eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { userId, channel, redirectTo } = body;

    if (!userId || !channel) {
      return new Response(JSON.stringify({ error: 'userId et channel requis' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!['email', 'sms'].includes(channel)) {
      return new Response(JSON.stringify({ error: 'channel doit être email ou sms' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (userId === user.id) {
      return new Response(JSON.stringify({ error: 'Utilisez la fonction publique pour votre propre mot de passe' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Block on other admins
    const { data: targetRole } = await adminClient
      .from('user_roles').select('role')
      .eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (targetRole) {
      return new Response(JSON.stringify({ error: 'Impossible de cibler un autre administrateur' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch target user
    const { data: targetAuth, error: authErr } = await adminClient.auth.admin.getUserById(userId);
    if (authErr || !targetAuth.user) {
      return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: targetProfile } = await adminClient
      .from('profiles').select('owner_name, phone, organization_id').eq('user_id', userId).maybeSingle();

    const { data: actorProfile } = await adminClient
      .from('profiles').select('owner_name').eq('user_id', user.id).maybeSingle();

    // EMAIL channel: use Supabase native recovery link (zero-config)
    if (channel === 'email') {
      const email = targetAuth.user.email;
      if (!email) {
        return new Response(JSON.stringify({ error: 'Cet utilisateur n\'a pas d\'email' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: redirectTo ?? undefined },
      });
      if (linkErr) throw linkErr;

      // Audit
      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile?.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile?.owner_name ?? '—',
        action: 'user_password_reset_link_sent',
        details: { channel: 'email', email },
      });

      return new Response(JSON.stringify({
        success: true,
        channel: 'email',
        message: `Lien de réinitialisation envoyé à ${email}`,
        // actionLink only returned for admin display (recovery link is also sent by Supabase)
        actionLink: linkData.properties?.action_link,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // SMS channel: generate token, store hash, send via Twilio
    const phone = targetProfile?.phone;
    if (!phone) {
      return new Response(JSON.stringify({ error: 'Cet utilisateur n\'a pas de téléphone enregistré' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = generateSecureToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    const { error: insertErr } = await adminClient.from('password_reset_tokens').insert({
      user_id: userId,
      token_hash: tokenHash,
      channel: 'sms',
      destination: phone,
      created_by: user.id,
      expires_at: expiresAt,
      organization_id: targetProfile?.organization_id ?? null,
    });
    if (insertErr) throw insertErr;

    const origin = req.headers.get('origin') ?? redirectTo ?? '';
    const link = `${origin}/auth?reset_token=${token}`;
    const sms = await sendSmsViaTwilio(
      phone,
      `Réinitialisez votre mot de passe SahelPOS (valide 30min) : ${link}`
    );

    if (!sms.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: sms.error,
        // Return link so admin can deliver it manually if SMS infra is down
        manualLink: link,
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await adminClient.from('user_audit_log').insert({
      actor_id: user.id, actor_name: actorProfile?.owner_name ?? 'Admin',
      target_user_id: userId, target_user_name: targetProfile?.owner_name ?? '—',
      action: 'user_password_reset_link_sent',
      details: { channel: 'sms', phone },
    });

    return new Response(JSON.stringify({
      success: true,
      channel: 'sms',
      message: `SMS envoyé à ${phone}`,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
