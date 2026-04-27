import { validatePasswordServer } from '../_shared/passwordPolicy.ts';
import { requireAdminContext } from '../_shared/orgScope.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await requireAdminContext(req);
    if (!ctx.ok) {
      return new Response(JSON.stringify({ error: ctx.error }), {
        status: ctx.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { user, adminClient, actorProfile } = ctx;

    const body = await req.json();
    const { email, password, ownerName, phone, role, requireEmailVerification } = body;

    if (!email || !password || !ownerName || !role) {
      return new Response(JSON.stringify({ error: 'Champs requis manquants' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const policyCheck = validatePasswordServer(password);
    if (!policyCheck.ok) {
      return new Response(JSON.stringify({ error: policyCheck.error }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (role === 'admin') {
      return new Response(JSON.stringify({ error: 'Impossible de créer un autre administrateur' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: !requireEmailVerification,
    });

    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? 'Création échouée' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newUserId = created.user.id;

    const { error: profileError } = await adminClient.from('profiles').insert({
      user_id: newUserId,
      business_name: actorProfile?.business_name ?? 'Boutique',
      owner_name: ownerName,
      phone: phone ?? null,
      is_active: true,
      organization_id: actorProfile?.organization_id ?? null,
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: roleError } = await adminClient.from('user_roles').insert({
      user_id: newUserId, role,
    });

    if (roleError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: roleError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Audit log
    await adminClient.from('user_audit_log').insert({
      actor_id: user.id,
      actor_name: actorProfile?.owner_name ?? 'Admin',
      target_user_id: newUserId,
      target_user_name: ownerName,
      action: 'user_created',
      details: { role, email, requireEmailVerification: !!requireEmailVerification },
    });

    return new Response(JSON.stringify({
      success: true,
      userId: newUserId,
      requiresVerification: !!requireEmailVerification,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
