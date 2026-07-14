-- ════════════════════════════════════════════════════════════════
-- Migration: fix_super_admin_roles_consistency
-- Date: 2026-07-15
-- Objectif: 
--   1. Synchroniser user_roles avec profiles.role pour les super_admins
--   2. Rendre is_super_admin() robuste (vérifie user_roles ET profiles.role)
--   3. Corriger le bug où la nouvelle organisation n'apparaît pas dans la liste
--   4. Corriger le bug où l'Edge Function admin-create-user retourne 403
-- ════════════════════════════════════════════════════════════════

-- 1. Insérer les entrées user_roles manquantes pour les super_admins
--    (profiles.role = 'super_admin' mais pas d'entrée dans user_roles)
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'super_admin'
FROM public.profiles p
WHERE p.role = 'super_admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id AND ur.role = 'super_admin'
  )
ON CONFLICT DO NOTHING;

-- 2. Idem pour les admins
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'admin'
FROM public.profiles p
WHERE p.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id AND ur.role = 'admin'
  )
ON CONFLICT DO NOTHING;

-- 3. Idem pour les managers, vendeurs, comptables
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, p.role
FROM public.profiles p
WHERE p.role IN ('manager', 'vendeur', 'comptable')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.user_id AND ur.role = p.role::text
  )
ON CONFLICT DO NOTHING;

-- 4. Rendre is_super_admin() robuste : vérifier user_roles ET profiles.role
--    (en cas de désynchronisation future)
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
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

-- 5. Rendre has_role() robuste aussi
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = _role
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role = _role::public.user_role
  );
$$;

-- 6. Vérification : combien de super_admins ont été synchronisés
DO $$
DECLARE
  v_super_admin_count INTEGER;
  v_super_admin_with_role INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_super_admin_count
  FROM public.profiles WHERE role = 'super_admin';
  
  SELECT COUNT(*) INTO v_super_admin_with_role
  FROM public.user_roles WHERE role = 'super_admin';
  
  RAISE NOTICE 'Super admins dans profiles: %', v_super_admin_count;
  RAISE NOTICE 'Super admins dans user_roles: %', v_super_admin_with_role;
  RAISE NOTICE 'Synchronisation terminée. Les deux valeurs devraient être égales maintenant.';
END $$;

-- 7. Commentaire
COMMENT ON FUNCTION public.is_super_admin IS 
'Vérifie si l utilisateur courant est super_admin. Contrôle user_roles ET profiles.role pour la robustesse (les deux tables doivent rester synchronisées).';

COMMENT ON FUNCTION public.has_role IS 
'Vérifie si un utilisateur a un rôle donné. Contrôle user_roles ET profiles.role pour la robustesse.';
