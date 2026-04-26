import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cron job: deactivate test accounts whose test_expires_at is past.
// Invoked by pg_cron (no JWT). Uses service role.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();

    // Find expired active test accounts
    const { data: expired, error: selectErr } = await adminClient
      .from('profiles')
      .select('user_id, owner_name, test_expires_at')
      .eq('is_test_account', true)
      .eq('is_active', true)
      .lt('test_expires_at', now);

    if (selectErr) throw selectErr;
    if (!expired || expired.length === 0) {
      return new Response(JSON.stringify({ success: true, deactivated: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let deactivated = 0;
    for (const profile of expired) {
      const { error } = await adminClient.from('profiles').update({
        is_active: false,
        deactivated_at: now,
        deactivation_reason: 'Compte de test expiré (rotation automatique)',
      }).eq('user_id', profile.user_id);

      if (!error) {
        deactivated++;
        // Sign out all sessions
        await adminClient.auth.admin.signOut(profile.user_id, 'global').catch(() => {});
        // Audit
        await adminClient.from('user_audit_log').insert({
          actor_id: null,
          actor_name: 'Système (rotation auto)',
          target_user_id: profile.user_id,
          target_user_name: profile.owner_name,
          action: 'user_deactivated',
          details: { reason: 'Test account expired', expired_at: profile.test_expires_at },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, deactivated, total: expired.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
