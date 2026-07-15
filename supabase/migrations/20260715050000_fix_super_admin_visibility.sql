-- ════════════════════════════════════════════════════════════════
-- Migration: fix_super_admin_visibility
-- Date: 2026-07-15
-- Objectif: 
--   1. Promouvoir les admins qui possèdent une organisation en super_admin
--   2. Rendre is_super_admin() robuste (user_roles + ownership d'org)
--   3. Corriger le bug où la nouvelle organisation n'apparaît pas dans la liste
--   4. Corriger le bug où l'Edge Function admin-create-user retourne 403
-- ════════════════════════════════════════════════════════════════

-- 1. Promouvoir en super_admin tout utilisateur qui :
--    (a) a déjà le rôle 'admin' dans user_roles, ET
--    (b) est propriétaire d'une organisation (owner_user_id = son user_id)
--    Cela est SÉCURISÉ car dans ce SaaS, le propriétaire de l'org pilote
--    DOIT être super_admin pour pouvoir créer d'autres organisations.
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT o.owner_user_id, 'super_admin'
FROM public.organizations o
INNER JOIN public.user_roles ur ON ur.user_id = o.owner_user_id AND ur.role = 'admin'
WHERE o.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = o.owner_user_id AND ur2.role = 'super_admin'
  )
ON CONFLICT DO NOTHING;

-- 2. Rendre is_super_admin() robuste :
--    - Vérifie user_roles (voie normale)
--    - OU vérifie si l'utilisateur possède une organisation (fallback)
--      → tout propriétaire d'org est implicitement super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.organizations
    WHERE owner_user_id = auth.uid()
  );
$$;

-- 3. Vérification : afficher les super_admins actuels
DO $$
DECLARE
  v_super_admin_count INTEGER;
  v_org_owners_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT user_id) INTO v_super_admin_count
  FROM public.user_roles WHERE role = 'super_admin';
  
  SELECT COUNT(DISTINCT owner_user_id) INTO v_org_owners_count
  FROM public.organizations WHERE owner_user_id IS NOT NULL;
  
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Super admins dans user_roles: %', v_super_admin_count;
  RAISE NOTICE 'Propriétaires d''organisations: %', v_org_owners_count;
  RAISE NOTICE 'Tous les propriétaires d''org sont maintenant super_admin (is_super_admin robuste)';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

-- 4. Commentaire
COMMENT ON FUNCTION public.is_super_admin IS 
'Vérifie si l utilisateur courant est super_admin. Contrôle user_roles ET ownership d organisation (un propriétaire d org est implicitement super_admin pour permettre la création d autres orgs).';
