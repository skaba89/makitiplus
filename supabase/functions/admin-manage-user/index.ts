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
    const { user, adminClient, actorProfile, ipAddress, isSuperAdmin } = ctx;

    const { userId, action, reason, newPassword } = await req.json();
    // Sanitize reason: strip HTML tags to prevent stored XSS
    const safeReason = typeof reason === 'string'
      ? reason.replace(/<[^>]*>/g, '').slice(0, 500)
      : null;
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

    // Vérifier le rôle de la cible
    const { data: targetRoleData } = await adminClient
      .from('user_roles').select('role')
      .eq('user_id', userId).maybeSingle();
    const targetRole = targetRoleData?.role;

    // Sécurité :
    // - Un admin simple ne peut PAS modifier un autre admin (ni super_admin)
    // - Le super_admin PEUT modifier les admins (mais pas les autres super_admins)
    if (targetRole === 'super_admin') {
      return new Response(JSON.stringify({ error: 'Impossible de modifier un super administrateur' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (targetRole === 'admin' && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Impossible de modifier un administrateur (réservé au super admin)' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // ORG SCOPE :
    // - Le super_admin peut modifier n'importe quel user de n'importe quelle org
    // - Un admin simple ne peut modifier que les users de SA propre org
    let targetProfile: { user_id: string; owner_name: string | null; phone: string | null; organization_id: string | null; is_active: boolean | null };
    if (isSuperAdmin) {
      // Super admin : charger le profil cible directement (pas de restriction d'org)
      const { data: targetProfileData, error: targetError } = await adminClient
        .from('profiles')
        .select('user_id, owner_name, phone, organization_id, is_active')
        .eq('user_id', userId)
        .maybeSingle();
      if (targetError || !targetProfileData) {
        return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), {
          status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      targetProfile = targetProfileData;
    } else {
      // Admin simple : vérifier que la cible est dans la même org
      if (!actorProfile.organization_id) {
        return new Response(JSON.stringify({ error: 'Admin sans boutique associée' }), {
          status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      const scope = await loadTargetInSameOrg(adminClient, userId, actorProfile.organization_id);
      if (!scope.ok) {
        return new Response(JSON.stringify({ error: scope.error }), {
          status: scope.status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      targetProfile = scope.targetProfile;
    }

    if (action === 'deactivate') {
      const { error } = await adminClient.from('profiles').update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: safeReason,
      }).eq('user_id', userId);
      if (error) throw error;

      await adminClient.auth.admin.signOut(userId, 'global').catch(() => {});

      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile.owner_name ?? '—',
        action: 'user_deactivated', details: { reason: safeReason },
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
        action: 'user_deleted_permanently', details: { reason: safeReason },
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
