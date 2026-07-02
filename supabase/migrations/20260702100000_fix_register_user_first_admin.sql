-- ============================================================
-- P1 Fix: register_user — Handle "first admin" case
-- Date: 2026-07-02
--
-- PROBLEM: When a first admin signs up, the frontend:
--   1. Creates the organization (owner_user_id = auth.uid())
--   2. Calls register_user with p_organization_id
--
-- But register_user verifies is_member_of_organization() + admin role,
-- which fails because the user has no profile or role yet.
--
-- FIX: If p_organization_id is provided and the caller is the
-- owner of that organization (owner_user_id = auth.uid()), allow
-- the registration even without existing membership/role.
-- This handles the "first admin" case atomically.
--
-- For existing admins inviting users, the normal verification
-- still applies.
-- ============================================================

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'register_user' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.register_user(
  p_business_name TEXT,
  p_owner_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'vendeur',
  p_organization_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_first_admin BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- If p_organization_id is provided, verify authorization
  IF p_organization_id IS NOT NULL THEN
    -- CASE 1: First admin — user just created the org and is the owner
    -- This happens during signup: frontend creates org first, then calls register_user
    IF EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = p_organization_id AND owner_user_id = v_user_id
    ) THEN
      -- Verify the user does NOT already have a profile (prevents re-registration)
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE user_id = v_user_id
      ) THEN
        v_is_first_admin := TRUE;
      END IF;
    END IF;

    -- CASE 2: Existing admin inviting a new user to their org
    IF NOT v_is_first_admin THEN
      IF NOT public.is_member_of_organization(p_organization_id) THEN
        RAISE EXCEPTION 'Accès refusé : vous n''êtes pas membre de cette organisation';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')
      ) THEN
        RAISE EXCEPTION 'Accès refusé : seul un admin peut inscrire un utilisateur dans une organisation';
      END IF;
    END IF;
  END IF;
  -- If p_organization_id is NULL, this is a self-registration without org

  -- Insert profile
  INSERT INTO profiles (user_id, business_name, owner_name, phone, organization_id)
  VALUES (v_user_id, p_business_name, p_owner_name, p_phone, p_organization_id);

  -- Insert role
  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, p_role::app_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
