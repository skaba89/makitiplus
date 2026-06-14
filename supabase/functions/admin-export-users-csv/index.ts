// Server-side CSV export of users in the admin's boutique.
// STRICT: requires admin role + same organization. Audited with IP.
import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { requireAdminContext } from '../_shared/orgScope.ts';
import { requireMethod } from '../_shared/httpMethodGuard.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';

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
