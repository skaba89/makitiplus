// Shared helper to enforce strict admin + organization scope on edge functions.
// Returns context with adminClient + actorProfile (incl. organization_id).
// Used by admin-* functions to ensure an admin can only act on users from
// their own boutique (organization).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.93.3';

export interface AdminCtxOk {
  ok: true;
  user: { id: string; email?: string | null };
  adminClient: SupabaseClient;
  actorProfile: {
    owner_name: string | null;
    business_name: string | null;
    organization_id: string | null;
  };
}

export interface AdminCtxErr {
  ok: false;
  error: string;
  status: number;
}

export async function requireAdminContext(req: Request): Promise<AdminCtxOk | AdminCtxErr> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { ok: false, error: 'Missing authorization', status: 401 };

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return { ok: false, error: 'Invalid session', status: 401 };

  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: roleData } = await adminClient
    .from('user_roles').select('role')
    .eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!roleData) return { ok: false, error: 'Forbidden: admin only', status: 403 };

  const { data: actorProfile } = await adminClient
    .from('profiles')
    .select('owner_name, business_name, organization_id, is_active')
    .eq('user_id', user.id).maybeSingle();

  if (!actorProfile) {
    return { ok: false, error: 'Profil admin introuvable', status: 403 };
  }
  if (actorProfile.is_active === false) {
    return { ok: false, error: 'Compte admin désactivé', status: 403 };
  }
  if (!actorProfile.organization_id) {
    return { ok: false, error: 'Admin sans boutique associée', status: 403 };
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email },
    adminClient,
    actorProfile: {
      owner_name: actorProfile.owner_name ?? null,
      business_name: actorProfile.business_name ?? null,
      organization_id: actorProfile.organization_id,
    },
  };
}

/**
 * Loads target user profile and asserts it belongs to the same organization
 * as the admin actor. Returns null if not found or out of scope.
 */
export async function loadTargetInSameOrg(
  adminClient: SupabaseClient,
  targetUserId: string,
  actorOrgId: string,
) {
  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('user_id, owner_name, phone, organization_id, is_active')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!targetProfile) return { ok: false as const, error: 'Utilisateur introuvable', status: 404 };
  if (targetProfile.organization_id !== actorOrgId) {
    return { ok: false as const, error: 'Utilisateur hors de votre boutique', status: 403 };
  }
  return { ok: true as const, targetProfile };
}
