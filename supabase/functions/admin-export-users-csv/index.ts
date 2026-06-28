// Server-side CSV export of users in the admin's boutique.
// STRICT: requires admin role + same organization. Audited with IP.
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
// ── End inlined shared dependencies ───────────────────────────────────

// Rate limit: 5 CSV exports per IP per 5 minutes (heavy)
const limiter = createRateLimiter('admin-export-users-csv', {
  maxRequests: 5,
  windowMs: 300_000,
});

const roleLabels: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  vendeur: 'Vendeur',
  comptable: 'Comptable',
};

function csvCell(v: unknown): string {
  const s = v == null ? '—' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
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
    const orgId = actorProfile.organization_id!;

    // Load profiles + roles strictly scoped to this org
    const { data: profiles, error: profilesErr } = await adminClient
      .from('profiles')
      .select('user_id, owner_name, business_name, phone, is_active, is_test_account, test_expires_at, last_login_at, deactivation_reason, created_at')
      .eq('organization_id', orgId);
    if (profilesErr) throw profilesErr;

    const userIds = (profiles ?? []).map((p) => p.user_id as string);

    const { data: roles } = await adminClient
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const roleMap = new Map<string, string>();
    (roles ?? []).forEach((r) => roleMap.set(r.user_id as string, r.role as string));

    // Fetch emails via auth admin (paginated)
    const emailMap = new Map<string, string>();
    let page = 1;
    const wanted = new Set(userIds);
    while (wanted.size > 0) {
      const { data: list } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      const batch = list?.users ?? [];
      if (batch.length === 0) break;
      for (const u of batch) {
        if (wanted.has(u.id) && u.email) {
          emailMap.set(u.id, u.email);
          wanted.delete(u.id);
        }
      }
      page++;
      if (page > 50) break; // safety
    }

    const header = [
      'Nom', 'Email', 'Téléphone', 'Rôle', 'Boutique',
      'Statut', 'Compte test', 'Expiration test', 'Dernière connexion',
      'Raison désactivation', 'Créé le',
    ];
    const lines: string[] = [header.map(csvCell).join(',')];
    for (const p of profiles ?? []) {
      const r = roleMap.get(p.user_id as string) ?? 'vendeur';
      lines.push([
        p.owner_name,
        emailMap.get(p.user_id as string) ?? '—',
        p.phone ?? '—',
        roleLabels[r] ?? r,
        p.business_name ?? '—',
        p.is_active ? 'Actif' : 'Inactif',
        p.is_test_account ? 'Oui' : 'Non',
        p.test_expires_at ? new Date(p.test_expires_at as string).toLocaleDateString('fr-FR') : '—',
        p.last_login_at ? new Date(p.last_login_at as string).toLocaleString('fr-FR') : 'Jamais',
        p.deactivation_reason ?? '—',
        p.created_at ? new Date(p.created_at as string).toLocaleDateString('fr-FR') : '—',
      ].map(csvCell).join(','));
    }
    const csv = '\uFEFF' + lines.join('\n');

    // Audit
    await adminClient.from('user_audit_log').insert({
      actor_id: user.id,
      actor_name: actorProfile.owner_name ?? 'Admin',
      target_user_id: null,
      target_user_name: `Export CSV (${profiles?.length ?? 0} utilisateurs)`,
      action: 'users_exported_csv',
      details: {
        count: profiles?.length ?? 0,
        organization_id: orgId,
        business_name: actorProfile.business_name,
      },
      ip_address: ipAddress,
    });

    return limiter.addHeaders(
      new Response(csv, {
        status: 200,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="utilisateurs-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      }),
      rateResult,
    );
  } catch (err) {
    console.error("[EdgeFn] Internal error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
