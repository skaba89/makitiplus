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

// Rate limit: 15 manage-user actions per IP per 60 seconds
const limiter = createRateLimiter('admin-manage-user', {
  maxRequests: 15,
  windowMs: 60_000,
});

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

    const { userId, action, reason, newPassword } = await req.json();
    if (!userId || !action) {
      return new Response(JSON.stringify({ error: 'Missing userId or action' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (userId === user.id) {
      return new Response(JSON.stringify({ error: 'Vous ne pouvez pas modifier votre propre compte' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Reject actions on other admins
    const { data: targetRole } = await adminClient
      .from('user_roles').select('role')
      .eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (targetRole) {
      return new Response(JSON.stringify({ error: 'Impossible de modifier un administrateur' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // STRICT ORG SCOPE: target must belong to actor's organization
    const scope = await loadTargetInSameOrg(adminClient, userId, actorProfile.organization_id!);
    if (!scope.ok) {
      return new Response(JSON.stringify({ error: scope.error }), {
        status: scope.status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const targetProfile = scope.targetProfile;

    if (action === 'deactivate') {
      const { error } = await adminClient.from('profiles').update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: reason ?? null,
      }).eq('user_id', userId);
      if (error) throw error;

      await adminClient.auth.admin.signOut(userId, 'global').catch(() => {});

      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile.owner_name ?? '—',
        action: 'user_deactivated', details: { reason: reason ?? null },
      });

      return limiter.addHeaders(
        new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rateResult,
      );
    }

    if (action === 'reactivate') {
      const { error } = await adminClient.from('profiles').update({
        is_active: true, deactivated_at: null, deactivation_reason: null,
      }).eq('user_id', userId);
      if (error) throw error;

      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile.owner_name ?? '—',
        action: 'user_reactivated', details: {},
      });

      return limiter.addHeaders(
        new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rateResult,
      );
    }

    if (action === 'reset_password') {
      const policyCheck = validatePasswordServer(newPassword);
      if (!policyCheck.ok) {
        return new Response(JSON.stringify({ error: policyCheck.error }), {
          status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) throw error;

      await adminClient.auth.admin.signOut(userId, 'global').catch(() => {});

      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile.owner_name ?? '—',
        action: 'user_password_reset', details: { mode: 'manual', organization_id: actorProfile.organization_id },
        ip_address: ipAddress,
      });

      return limiter.addHeaders(
        new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rateResult,
      );
    }

    if (action === 'delete') {
      // Perform deletion FIRST, then log — avoids ghost audit entries if delete fails
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;

      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile.owner_name ?? '—',
        action: 'user_deleted_permanently', details: { reason: reason ?? null },
      });

      return limiter.addHeaders(
        new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }),
        rateResult,
      );
    }

    return new Response(JSON.stringify({ error: 'Action inconnue' }), {
      status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error("[EdgeFn] Internal error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
