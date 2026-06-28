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
// ── End inlined shared dependencies ───────────────────────────────────

// Rate limit: 10 requests per IP per 5 minutes (generous for cron, blocks manual abuse)
const rateLimiter = createRateLimiter('rotate-test-accounts', {
  maxRequests: 10,
  windowMs: 5 * 60_000,
});

// Cron job: deactivate test accounts whose test_expires_at is past.
// Invoked by pg_cron (no JWT). Uses service role.
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
