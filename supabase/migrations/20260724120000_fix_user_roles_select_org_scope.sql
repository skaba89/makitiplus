-- ════════════════════════════════════════════════════════════════
-- Fix SÉCURITÉ : policy SELECT sur user_roles sans scoping organisation
-- Date: 2026-07-24 -- trouve en audit RLS (P4, gap-closing)
--
-- Bug : "user_roles_select_scoped" autorise un admin a voir TOUTES les
-- lignes (user_id, role) de TOUTES les organisations (sauf role
-- super_admin) -- aucune comparaison d'organisation. user_roles n'a pas
-- de colonne organization_id propre ; l'appartenance passe par
-- profiles.organization_id.
--
-- Verifie live : src/pages/Users.tsx interroge
-- supabase.from("user_roles").select("user_id, role, created_at") SANS
-- filtre cote client, en s'appuyant entierement sur RLS pour restreindre
-- aux utilisateurs de sa propre organisation. Avec la policy actuelle,
-- la reponse reseau brute contient deja les (user_id, role) de TOUTES
-- les organisations -- fuite de donnees inter-tenant reelle et
-- exploitable via l'UI existante (pas seulement via appel direct
-- PostgREST), meme si l'UI ne les affiche pas ensuite (le join ulterieur
-- avec profiles, lui correctement scope, filtre l'affichage mais pas la
-- reponse reseau).
--
-- Fix : n'autoriser la branche admin qu'aux lignes dont le user_id
-- appartient a un profil de la meme organisation que l'appelant.
--
-- Note technique : un EXISTS(SELECT ... FROM profiles ...) directement
-- dans cette policy provoque une recursion infinie (42P17), car la
-- policy SELECT de profiles ("profiles_select_scoped") interroge elle-
-- meme user_roles. On passe donc par une fonction SECURITY DEFINER
-- (meme mecanisme que get_user_organization_id()), qui contourne RLS
-- sur profiles et casse le cycle.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_organization_id_of_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

DROP POLICY IF EXISTS "user_roles_select_scoped" ON public.user_roles;
CREATE POLICY "user_roles_select_scoped" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid())
    OR public.is_super_admin()
    OR (
      public.has_role(auth.uid(), 'admin'::text)
      AND role <> 'super_admin'::app_role
      AND public.get_organization_id_of_user(user_roles.user_id) = public.get_user_organization_id()
    )
  );
