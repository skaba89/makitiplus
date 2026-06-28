-- ═══════════════════════════════════════════════════════════════
-- MAKITIPLUS — Ajout du rôle super_admin
-- Le super_admin peut créer des magasins (organizations) et 
-- des admins pour chaque magasin.
-- ═══════════════════════════════════════════════════════════════

-- 1. Ajouter super_admin à l'enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin' AFTER 'admin';

-- 2. Supprimer l'ancien index unique sur admin (un seul admin)
DROP INDEX IF EXISTS public.idx_single_admin;

-- 3. Fonction pour vérifier si l'utilisateur est super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

-- 4. Mettre à jour la fonction admin_exists pour vérifier super_admin aussi
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE role IN ('admin', 'super_admin')
  );
$$;

-- 5. Autoriser is_super_admin() pour les utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- 6. RLS : super_admin peut voir TOUTES les organisations
DROP POLICY IF EXISTS "members_can_view_org" ON public.organizations;
CREATE POLICY "members_can_view_org" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() 
    OR public.is_member_of_organization(id)
  );

-- super_admin peut créer des organisations
DROP POLICY IF EXISTS "admin_can_create_org" ON public.organizations;
CREATE POLICY "admin_can_create_org" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() 
    OR owner_user_id = auth.uid()
  );

-- super_admin peut modifier toute organisation
DROP POLICY IF EXISTS "admin_can_update_org" ON public.organizations;
CREATE POLICY "admin_can_update_org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR owner_user_id = auth.uid() 
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.is_super_admin()
    OR owner_user_id = auth.uid() 
    OR public.has_role(auth.uid(), 'admin')
  );

-- 7. RLS : super_admin peut voir tous les profils (pour gérer les admins)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid() 
    OR organization_id = public.get_user_organization_id()
  );

-- 8. RLS : super_admin peut voir tous les rôles
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid() 
    OR public.has_role(auth.uid(), 'admin')
  );

-- 9. RLS : super_admin peut insérer des rôles pour n'importe quel utilisateur
DROP POLICY IF EXISTS "Users can create their own role" ON public.user_roles;
CREATE POLICY "Users can create their own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR user_id = auth.uid()
  );

-- 10. RLS : super_admin peut voir les utilisateurs de toutes les orgs
-- (needed for the admin management page)
DROP POLICY IF EXISTS "admins_view_audit_log" ON public.user_audit_log;
CREATE POLICY "admins_view_audit_log" ON public.user_audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin')
  );

-- ✅ Migration terminée !
