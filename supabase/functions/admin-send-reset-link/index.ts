// ── Inlined shared dependencies (no ../_shared/ imports) ──────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';

const ALLOWED_ORIGINS = [
  Deno.env.get("CORS_ORIGIN") ?? "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
  "https://makitiplus.onrender.com",
];
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Max-Age": "86400" };
}
function corsOptionsResponse(req: Request): Response {
  return new Response(null, { status: 204, headers: getCorsHeaders(req) });
}

function requireMethod(req: Request, allowed: string | string[]): Response | null {
  const methods = Array.isArray(allowed) ? allowed : [allowed];
  if (req.method === 'OPTIONS') return null;
  if (methods.includes(req.method)) return null;
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', Allow: methods.join(', ') } });
}

const memoryStore = new Map<string, { count: number; resetAt: number }>();
function extractClientId(req: Request): string {
  for (const raw of [req.headers.get("cf-connecting-ip"), req.headers.get("x-real-ip"), req.headers.get("x-forwarded-for")]) {
    if (!raw) continue; const first = raw.split(",")[0]?.trim(); if (first && first.length <= 64) return first;
  }
  return `ua:${(req.headers.get("user-agent") || "unknown").slice(0, 64)}`;
}
function createRateLimiter(endpoint: string, config: { maxRequests: number; windowMs: number }) {
  const keyPrefix = `rl:${endpoint}:`;
  return {
    async check(req: Request) {
      const clientId = extractClientId(req); const key = `${keyPrefix}${clientId}`; const now = Date.now(); const resetAt = now + config.windowMs;
      try {
        const kv = await Deno.openKv(); const entry = await kv.get<{ count: number; resetAt: number }>([key]);
        if (!entry.value || entry.value.resetAt <= now) { await kv.set([key], { count: 1, resetAt }); kv.close(); return { allowed: true, remaining: config.maxRequests - 1, resetAt }; }
        const count = entry.value.count + 1;
        if (count > config.maxRequests) { kv.close(); return { allowed: false, remaining: 0, resetAt: entry.value.resetAt, error: `Trop de requêtes. Réessayez dans ${Math.ceil((entry.value.resetAt - now) / 1000)}s.` }; }
        await kv.set([key], { count, resetAt: entry.value.resetAt }); kv.close(); return { allowed: true, remaining: config.maxRequests - count, resetAt: entry.value.resetAt };
      } catch {
        const entry = memoryStore.get(key);
        if (!entry || entry.resetAt <= now) { memoryStore.set(key, { count: 1, resetAt }); return { allowed: true, remaining: config.maxRequests - 1, resetAt }; }
        const count = entry.count + 1;
        if (count > config.maxRequests) return { allowed: false, remaining: 0, resetAt: entry.resetAt, error: `Trop de requêtes. Réessayez dans ${Math.ceil((entry.resetAt - now) / 1000)}s.` };
        memoryStore.set(key, { count, resetAt: entry.resetAt }); return { allowed: true, remaining: config.maxRequests - count, resetAt: entry.resetAt };
      }
    },
    addHeaders(response: Response, result: { remaining: number; resetAt: number; allowed: boolean }): Response {
      const headers = new Headers(response.headers); headers.set("X-RateLimit-Remaining", String(result.remaining)); headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
      if (!result.allowed) headers.set("Retry-After", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
  };
}

interface AdminCtxOk { ok: true; user: { id: string; email?: string | null }; adminClient: ReturnType<typeof createClient>; actorProfile: { owner_name: string | null; business_name: string | null; organization_id: string | null }; isSuperAdmin: boolean; ipAddress: string | null; }
interface AdminCtxErr { ok: false; error: string; status: number }

function extractClientIp(req: Request): string | null {
  for (const raw of [req.headers.get('cf-connecting-ip'), req.headers.get('x-real-ip'), req.headers.get('x-forwarded-for'), req.headers.get('forwarded')]) {
    if (!raw) continue; const first = raw.split(',')[0]?.trim(); if (first && first.length <= 64) return first;
  }
  return null;
}

async function requireAdminContext(req: Request): Promise<AdminCtxOk | AdminCtxErr> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { ok: false, error: 'Missing authorization', status: 401 };
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!; const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!; const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return { ok: false, error: 'Invalid session', status: 401 };
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'super_admin']).maybeSingle();
  if (!roleData) return { ok: false, error: 'Forbidden: admin or super_admin only', status: 403 };
  const isSuperAdmin = roleData.role === 'super_admin';
  const { data: actorProfile } = await adminClient.from('profiles').select('owner_name, business_name, organization_id, is_active').eq('user_id', user.id).maybeSingle();
  if (!actorProfile) return { ok: false, error: 'Profil admin introuvable', status: 403 };
  if (actorProfile.is_active === false) return { ok: false, error: 'Compte admin désactivé', status: 403 };
  if (!actorProfile.organization_id && !isSuperAdmin) return { ok: false, error: 'Admin sans boutique associée', status: 403 };
  return { ok: true, user: { id: user.id, email: user.email }, adminClient, actorProfile: { owner_name: actorProfile.owner_name ?? null, business_name: actorProfile.business_name ?? null, organization_id: actorProfile.organization_id }, isSuperAdmin, ipAddress: extractClientIp(req) };
}

async function loadTargetInSameOrg(adminClient: ReturnType<typeof createClient>, targetUserId: string, actorOrgId: string) {
  const { data: targetProfile } = await adminClient.from('profiles').select('user_id, owner_name, phone, organization_id, is_active').eq('user_id', targetUserId).maybeSingle();
  if (!targetProfile) return { ok: false as const, error: 'Utilisateur introuvable', status: 404 };
  if (targetProfile.organization_id !== actorOrgId) return { ok: false as const, error: 'Utilisateur hors de votre boutique', status: 403 };
  return { ok: true as const, targetProfile };
}
// ── End inlined shared dependencies ───────────────────────────────────

// Rate limit: 5 reset link sends per IP per 60 seconds (sensitive)
const limiter = createRateLimiter('admin-send-reset-link', {
  maxRequests: 5,
  windowMs: 60_000,
});

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
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendSmsViaTwilio(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
  const TWILIO_FROM = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_FROM) {
    return {
      ok: false,
      error: 'Twilio non configuré. Connectez Twilio dans Connecteurs et ajoutez le secret TWILIO_FROM_NUMBER.',
    };
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
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);
  const methodErr = requireMethod(req, 'POST');
  if (methodErr) return methodErr;

  const rateResult = await limiter.check(req);
  if (!rateResult.allowed) {
    return limiter.addHeaders(
      new Response(JSON.stringify({ error: rateResult.error }), {
        status: 429,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }),
      rateResult,
    );
  }

  try {
    const ctx = await requireAdminContext(req);
    if (!ctx.ok) {
      return new Response(JSON.stringify({ error: ctx.error }), {
        status: ctx.status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const { user, adminClient, actorProfile, ipAddress } = ctx;

    const body = await req.json();
    const { userId, channel, redirectTo } = body;

    if (!userId || !channel) {
      return new Response(JSON.stringify({ error: 'userId et channel requis' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (!['email', 'sms'].includes(channel)) {
      return new Response(JSON.stringify({ error: 'channel doit être email ou sms' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (userId === user.id) {
      return new Response(JSON.stringify({ error: 'Utilisez la fonction publique pour votre propre mot de passe' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Block targeting other admins
    const { data: targetRole } = await adminClient
      .from('user_roles').select('role')
      .eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (targetRole) {
      return new Response(JSON.stringify({ error: 'Impossible de cibler un autre administrateur' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // STRICT ORG SCOPE
    const scope = await loadTargetInSameOrg(adminClient, userId, actorProfile.organization_id!);
    if (!scope.ok) {
      return new Response(JSON.stringify({ error: scope.error }), {
        status: scope.status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const targetProfile = scope.targetProfile;

    // Fetch target auth (for email)
    const { data: targetAuth, error: authErr } = await adminClient.auth.admin.getUserById(userId);
    if (authErr || !targetAuth.user) {
      return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), {
        status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // EMAIL channel
    if (channel === 'email') {
      const email = targetAuth.user.email;
      if (!email) {
        return new Response(JSON.stringify({ error: 'Cet utilisateur n\'a pas d\'email' }), {
          status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: redirectTo ?? undefined },
      });
      if (linkErr) throw linkErr;

      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile.owner_name ?? '—',
        action: 'user_password_reset_link_sent',
        details: { channel: 'email', email, organization_id: actorProfile.organization_id },
        ip_address: ipAddress,
      });

      return limiter.addHeaders(
        new Response(JSON.stringify({
          success: true,
          channel: 'email',
          message: `Lien de réinitialisation envoyé à ${email}`,
        }), { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }),
        rateResult,
      );
    }

    // SMS channel
    const phone = targetProfile.phone;
    if (!phone) {
      return new Response(JSON.stringify({ error: 'Cet utilisateur n\'a pas de téléphone enregistré' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const token = generateSecureToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { error: insertErr } = await adminClient.from('password_reset_tokens').insert({
      user_id: userId,
      token_hash: tokenHash,
      channel: 'sms',
      destination: phone,
      created_by: user.id,
      expires_at: expiresAt,
      organization_id: actorProfile.organization_id,
    });
    if (insertErr) throw insertErr;

    const origin = req.headers.get('origin') ?? redirectTo ?? '';
    const link = `${origin}/auth?reset_token=${token}`;
    const sms = await sendSmsViaTwilio(
      phone,
      `Réinitialisez votre mot de passe MakitiPlus (valide 30min) : ${link}`
    );

    if (!sms.ok) {
      // Audit even when delivery failed (admin still has the manual link)
      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile.owner_name ?? '—',
        action: 'user_password_reset_link_sent',
        details: { channel: 'sms', phone, delivery: 'manual_fallback', error: sms.error, organization_id: actorProfile.organization_id },
        ip_address: ipAddress,
      });
      return limiter.addHeaders(
        new Response(JSON.stringify({
          success: false,
          error: sms.error,
          message: 'SMS non envoyé. Contactez l\'utilisateur par un autre canal.',
        }), { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }),
        rateResult,
      );
    }

    await adminClient.from('user_audit_log').insert({
      actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
      target_user_id: userId, target_user_name: targetProfile.owner_name ?? '—',
      action: 'user_password_reset_link_sent',
      details: { channel: 'sms', phone, delivery: 'sms', organization_id: actorProfile.organization_id },
      ip_address: ipAddress,
    });

    return limiter.addHeaders(
      new Response(JSON.stringify({
        success: true,
        channel: 'sms',
        message: `SMS envoyé à ${phone}`,
      }), { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }),
      rateResult,
    );
  } catch (err) {
    console.error("[EdgeFn] Internal error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
