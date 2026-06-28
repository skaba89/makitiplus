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

function validatePasswordServer(password: string): { ok: boolean; error?: string } {
  if (!password || typeof password !== "string") return { ok: false, error: "Mot de passe requis" };
  if (password.length < 8) return { ok: false, error: "Au moins 8 caractères requis" };
  if (password.length > 72) return { ok: false, error: "Maximum 72 caractères" };
  if (!/[a-z]/.test(password)) return { ok: false, error: "Une lettre minuscule requise" };
  if (!/[A-Z]/.test(password)) return { ok: false, error: "Une lettre majuscule requise" };
  if (!/[0-9]/.test(password)) return { ok: false, error: "Un chiffre requis" };
  if (!/[^a-zA-Z0-9]/.test(password)) return { ok: false, error: "Un caractère spécial requis" };
  const weak = ["password", "motdepasse", "azerty", "qwerty", "12345678", "test1234", "admin123"];
  if (weak.some((w) => password.toLowerCase().includes(w))) return { ok: false, error: "Mot de passe trop courant" };
  if (/^(.)\1+$/.test(password)) return { ok: false, error: "Caractères répétés interdits" };
  return { ok: true };
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
// ── End inlined shared dependencies ───────────────────────────────────

// Rate limit: 5 password reset redemptions per IP per 60 seconds
const rateLimiter = createRateLimiter('redeem-reset-token', {
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
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);
  const methodErr = requireMethod(req, 'POST');
  if (methodErr) return methodErr;

  try {
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
