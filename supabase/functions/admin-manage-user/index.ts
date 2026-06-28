// admin-manage-user — Deactivate/reactivate/reset-password/delete user
// Uses _shared/ imports (deploy via Supabase CLI)

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { requireMethod } from '../_shared/httpMethodGuard.ts';
import { validatePasswordServer } from '../_shared/passwordPolicy.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';
import { requireAdminContext, loadTargetInSameOrg } from '../_shared/orgScope.ts';

const limiter = createRateLimiter('admin-manage-user', { maxRequests: 15, windowMs: 60_000 });

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
