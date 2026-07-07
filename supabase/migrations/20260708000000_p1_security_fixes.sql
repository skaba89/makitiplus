-- ============================================================
-- P1 Security Fixes — Migration correctrice
-- Date: 2026-07-08
-- Référence audit: AUDIT-2026-007
--
-- Corrige les 4 findings de sévérité critique/élevée du palier 1 :
--   • CRIT-1  : Self-grant super_admin via register_user "first admin" exception
--   • HIGH-1  : register_user avec p_organization_id IS NULL accepte n'importe quel rôle
--   • HIGH-3  : stripe_events policy USING(true) WITH CHECK(true) sans clause TO
--   • HIGH-4  : is_org_admin() référencée par 7 RLS policies mais jamais définie
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- CRIT-1 + HIGH-1 — Patch register_user
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   1. Le chemin "first admin" ne vérifie pas admin_exists(). N'importe quel
--      utilisateur authentifié peut créer une org, puis s'auto-attribuer
--      super_admin via register_user — même si d'autres super_admins existent.
--   2. Quand p_organization_id IS NULL, aucune vérification n'est faite sur
--      p_role. Un utilisateur peut appeler register_user(p_role='super_admin',
--      p_organization_id=NULL) et obtenir super_admin sans org.
--
-- Fix :
--   1. Ajouter IF public.admin_exists() AND v_is_first_admin THEN RAISE.
--   2. Quand p_organization_id IS NULL (self-registration sans org), restreindre
--      p_role aux valeurs non-admin (vendeur, manager, comptable).
--   3. Quand v_is_first_admin (organisation nouvellement créée), vérifier que
--      p_role est admin ou super_admin (sinon la valeur n'a pas de sens pour
--      un premier admin).
-- ============================================================

-- Drop existing function (idempotent via pg_proc)
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
  v_role app_role;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Valider que p_role est un app_role valide (sinon le cast lèvera une exception)
  v_role := p_role::app_role;

  -- ─── HIGH-1 fix : si p_organization_id IS NULL, c'est une self-registration
  -- sans org. Aucun chemin ne devrait permettre à l'utilisateur de s'attribuer
  -- un rôle admin dans ce cas — seuls vendeur/manager/comptable sont autorisés.
  IF p_organization_id IS NULL THEN
    IF v_role IN ('admin', 'super_admin') THEN
      RAISE EXCEPTION 'Rôle non autorisé pour une auto-inscription sans organisation. Utilisez admin-create-user.';
    END IF;
  ELSE
    -- ─── CAS 1 : Premier admin — user vient de créer l'org et en est owner
    IF EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = p_organization_id AND owner_user_id = v_user_id
    ) THEN
      -- Vérifier que l'utilisateur n'a pas déjà un profil (anti re-registration)
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE user_id = v_user_id
      ) THEN
        v_is_first_admin := TRUE;
      END IF;
    END IF;

    -- ─── CAS 2 : Admin existant invitant un nouvel utilisateur dans son org
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
      -- Un admin non-super_admin ne peut pas créer un super_admin
      IF v_role = 'super_admin' AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accès refusé : seul un super_admin peut créer un autre super_admin';
      END IF;
    END IF;
  END IF;

  -- ─── CRIT-1 fix : si on est sur le chemin "first admin", vérifier que
  -- aucun admin n'existe déjà sur la plateforme. Sinon, le chemin est fermé.
  IF v_is_first_admin THEN
    IF public.admin_exists() THEN
      RAISE EXCEPTION 'Un admin existe déjà sur la plateforme. Le chemin "first admin" est fermé. Utilisez admin-create-user.';
    END IF;
    -- Le premier admin doit avoir un rôle admin ou super_admin
    IF v_role NOT IN ('admin', 'super_admin') THEN
      RAISE EXCEPTION 'Le premier admin doit avoir le rôle "admin" ou "super_admin"';
    END IF;
  END IF;

  -- Insert profile (idempotent : si le profil existe déjà, on ne fait rien)
  INSERT INTO profiles (user_id, business_name, owner_name, phone, organization_id)
  VALUES (v_user_id, p_business_name, p_owner_name, p_phone, p_organization_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Insert role (idempotent)
  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, v_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- HIGH-3 — stripe_events policy : ajouter TO service_role
-- ════════════════════════════════════════════════════════════════
-- Problème : la politique stripe_events_service_role n'avait pas de clause TO,
-- donc s'appliquait à TO public (tous les rôles). Pour INSERT/UPDATE/DELETE,
-- seule cette politique permissive s'appliquait, permettant à n'importe quel
-- utilisateur authentifié d'écrire dans stripe_events.
--
-- Fix : recréer la politique avec TO service_role explicite.
-- ============================================================

DROP POLICY IF EXISTS stripe_events_service_role ON public.stripe_events;

CREATE POLICY stripe_events_service_role ON public.stripe_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Note: la politique stripe_events_select_authenticated (existant) reste active
-- pour les SELECT des utilisateurs authentifiés, avec filtre organization_id.

-- ════════════════════════════════════════════════════════════════
-- HIGH-4 — Créer la fonction is_org_admin() manquante
-- ════════════════════════════════════════════════════════════════
-- Problème : 7 politiques RLS (backups INSERT/UPDATE/DELETE,
-- support_tickets UPDATE/DELETE + SELECT admin view) appellent
-- public.is_org_admin() qui n'a jamais été définie. Toutes ces
-- opérations échouent en production avec "function does not exist".
--
-- Fix : créer la fonction is_org_admin() avec la même signature que les
-- autres helpers (is_super_admin, is_member_of_organization) — utilise
-- auth.uid() côté serveur, STABLE, SECURITY DEFINER.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- Vérification post-migration (à exécuter manuellement pour valider)
-- ════════════════════════════════════════════════════════════════
-- Ces requêtes ne modifient rien, elles permettent de vérifier que la
-- migration a bien été appliquée et que les fonctions existent.
--
-- SELECT proname, prosrc IS NOT NULL AS defined
--   FROM pg_proc
--   WHERE proname IN ('register_user', 'is_org_admin', 'is_super_admin', 'admin_exists')
--     AND pronamespace = 'public'::regnamespace;
--
-- SELECT polname, polrelid::regclass AS table_name, polroles::text[] AS roles
--   FROM pg_policy
--   WHERE polname = 'stripe_events_service_role';
--
-- -- Test que is_org_admin() est callable sans erreur
-- SELECT public.is_org_admin() AS current_user_is_org_admin;
-- ============================================================
