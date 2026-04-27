import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';
import { validatePasswordServer } from '../_shared/passwordPolicy.ts';
import { requireAdminContext, loadTargetInSameOrg } from '../_shared/orgScope.ts';

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
        status: ctx.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { user, adminClient, actorProfile } = ctx;

    const { userId, action, reason, newPassword } = await req.json();
    if (!userId || !action) {
      return new Response(JSON.stringify({ error: 'Missing userId or action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (userId === user.id) {
      return new Response(JSON.stringify({ error: 'Vous ne pouvez pas modifier votre propre compte' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Reject actions on other admins
    const { data: targetRole } = await adminClient
      .from('user_roles').select('role')
      .eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (targetRole) {
      return new Response(JSON.stringify({ error: 'Impossible de modifier un administrateur' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // STRICT ORG SCOPE: target must belong to actor's organization
    const scope = await loadTargetInSameOrg(adminClient, userId, actorProfile.organization_id!);
    if (!scope.ok) {
      return new Response(JSON.stringify({ error: scope.error }), {
        status: scope.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reset_password') {
      const policyCheck = validatePasswordServer(newPassword);
      if (!policyCheck.ok) {
        return new Response(JSON.stringify({ error: policyCheck.error }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) throw error;

      await adminClient.auth.admin.signOut(userId, 'global').catch(() => {});

      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile.owner_name ?? '—',
        action: 'user_password_reset', details: {},
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile.owner_name ?? '—',
        action: 'user_deleted_permanently', details: { reason: reason ?? null },
      });

      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Action inconnue' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
