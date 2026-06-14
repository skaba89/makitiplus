import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { validatePasswordServer } from '../_shared/passwordPolicy.ts';
import { requireAdminContext } from '../_shared/orgScope.ts';
import { requireMethod } from '../_shared/httpMethodGuard.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';

// Rate limit: 10 user creations per IP per 60 seconds
const limiter = createRateLimiter('admin-create-user', {
  maxRequests: 10,
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
        status: ctx.status,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const { user, adminClient, actorProfile } = ctx;

    const body = await req.json();
    const { email, password, ownerName, phone, role, requireEmailVerification } = body;

    if (!email || !password || !ownerName || !role) {
      return new Response(JSON.stringify({ error: 'Champs requis manquants' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const policyCheck = validatePasswordServer(password);
    if (!policyCheck.ok) {
      return new Response(JSON.stringify({ error: policyCheck.error }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (role === 'admin') {
      return new Response(JSON.stringify({ error: 'Impossible de créer un autre administrateur' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: !requireEmailVerification,
    });

    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? 'Création échouée' }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const newUserId = created.user.id;

    const { error: profileError } = await adminClient.from('profiles').insert({
      user_id: newUserId,
      business_name: actorProfile.business_name ?? 'Boutique',
      owner_name: ownerName,
      phone: phone ?? null,
      is_active: true,
      organization_id: actorProfile.organization_id, // strict scope
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { error: roleError } = await adminClient.from('user_roles').insert({
      user_id: newUserId, role,
    });

    if (roleError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Audit log
    await adminClient.from('user_audit_log').insert({
      actor_id: user.id,
      actor_name: actorProfile.owner_name ?? 'Admin',
      target_user_id: newUserId,
      target_user_name: ownerName,
      action: 'user_created',
      details: { role, email, requireEmailVerification: !!requireEmailVerification },
    });

    return limiter.addHeaders(
      new Response(JSON.stringify({
        success: true,
        userId: newUserId,
        requiresVerification: !!requireEmailVerification,
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
