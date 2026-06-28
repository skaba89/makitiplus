// admin-create-user — Creates a user (admin/super_admin only)
// Uses _shared/ imports (deploy via Supabase CLI)

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { requireMethod } from '../_shared/httpMethodGuard.ts';
import { validatePasswordServer } from '../_shared/passwordPolicy.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';
import { requireAdminContext } from '../_shared/orgScope.ts';

const limiter = createRateLimiter('admin-create-user', { maxRequests: 10, windowMs: 60_000 });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);
  const methodErr = requireMethod(req, 'POST');
  if (methodErr) return methodErr;

  const rateResult = await limiter.check(req);
  if (!rateResult.allowed) {
    return limiter.addHeaders(
      new Response(JSON.stringify({ error: rateResult.error }), { status: 429, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }),
      rateResult,
    );
  }

  try {
    const ctx = await requireAdminContext(req);
    if (!ctx.ok) {
      return new Response(JSON.stringify({ error: ctx.error }), { status: ctx.status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }
    const { user, adminClient, actorProfile, isSuperAdmin } = ctx;

    const body = await req.json();
    const { email, password, ownerName, phone, role, requireEmailVerification, targetOrganizationId, targetBusinessName } = body;

    if (!email || !password || !ownerName || !role) {
      return new Response(JSON.stringify({ error: 'Champs requis manquants' }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    const policyCheck = validatePasswordServer(password);
    if (!policyCheck.ok) {
      return new Response(JSON.stringify({ error: policyCheck.error }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // Only super_admin can create admin users
    if (role === 'admin' && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Impossible de créer un autre administrateur' }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // Super admin creating admin must specify the target organization
    if (role === 'admin' && isSuperAdmin && !targetOrganizationId) {
      return new Response(JSON.stringify({ error: 'Organization cible requise pour créer un admin' }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    const userOrgId = isSuperAdmin && targetOrganizationId ? targetOrganizationId : actorProfile.organization_id;
    const userBusinessName = isSuperAdmin && targetBusinessName ? targetBusinessName : (actorProfile.business_name ?? 'Boutique');

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: !requireEmailVerification });
    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? 'Création échouée' }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    const newUserId = created.user.id;

    const { error: profileError } = await adminClient.from('profiles').insert({
      user_id: newUserId, business_name: userBusinessName, owner_name: ownerName,
      phone: phone ?? null, is_active: true, organization_id: userOrgId,
    });
    if (profileError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    const { error: roleError } = await adminClient.from('user_roles').insert({ user_id: newUserId, role });
    if (roleError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: roleError.message }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // Audit log
    await adminClient.from('user_audit_log').insert({
      actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
      target_user_id: newUserId, target_user_name: ownerName,
      action: 'user_created', details: { role, email, requireEmailVerification: !!requireEmailVerification, targetOrganizationId: userOrgId },
    });

    return limiter.addHeaders(
      new Response(JSON.stringify({ success: true, userId: newUserId, requiresVerification: !!requireEmailVerification }), { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }),
      rateResult,
    );
  } catch (err) {
    console.error("[EdgeFn] Internal error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
  }
});
