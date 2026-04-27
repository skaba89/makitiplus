import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';
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
        status: ctx.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { adminClient, actorProfile } = ctx;

    const { userIds } = await req.json();
    if (!Array.isArray(userIds)) {
      return new Response(JSON.stringify({ error: 'userIds must be an array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // STRICT ORG SCOPE: only return emails for users in admin's organization
    const { data: orgProfiles } = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('organization_id', actorProfile.organization_id!)
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);

    const allowed = new Set((orgProfiles ?? []).map((p) => p.user_id as string));
    const filtered = userIds.filter((id: string) => allowed.has(id));

    const emails: Record<string, string> = {};
    let page = 1;
    let hasMore = true;
    const wanted = new Set(filtered);

    while (hasMore && wanted.size > 0) {
      const { data: list } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      const users = list?.users ?? [];
      if (users.length === 0) {
        hasMore = false;
      } else {
        for (const u of users) {
          if (wanted.has(u.id) && u.email) {
            emails[u.id] = u.email;
            wanted.delete(u.id);
          }
        }
        page++;
      }
    }

    return new Response(JSON.stringify({ emails }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
