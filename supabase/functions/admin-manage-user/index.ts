import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';
import { validatePasswordServer } from '../_shared/passwordPolicy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from('user_roles').select('role')
      .eq('user_id', user.id).eq('role', 'admin').maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const { data: targetProfile } = await adminClient
      .from('profiles').select('owner_name')
      .eq('user_id', userId).maybeSingle();

    const { data: actorProfile } = await adminClient
      .from('profiles').select('owner_name')
      .eq('user_id', user.id).maybeSingle();

    if (action === 'deactivate') {
      const { error } = await adminClient.from('profiles').update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: reason ?? null,
      }).eq('user_id', userId);
      if (error) throw error;

      // Sign out all sessions
      await adminClient.auth.admin.signOut(userId, 'global').catch(() => {});

      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile?.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile?.owner_name ?? '—',
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
        actor_id: user.id, actor_name: actorProfile?.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile?.owner_name ?? '—',
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

      // Invalidate all sessions to force re-login with new password
      await adminClient.auth.admin.signOut(userId, 'global').catch(() => {});

      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile?.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile?.owner_name ?? '—',
        action: 'user_password_reset', details: {},
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      // Audit BEFORE deletion (target row will be gone)
      await adminClient.from('user_audit_log').insert({
        actor_id: user.id, actor_name: actorProfile?.owner_name ?? 'Admin',
        target_user_id: userId, target_user_name: targetProfile?.owner_name ?? '—',
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
