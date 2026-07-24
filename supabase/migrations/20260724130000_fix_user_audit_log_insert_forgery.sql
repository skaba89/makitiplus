-- ════════════════════════════════════════════════════════════════
-- Fix SÉCURITÉ : policy INSERT sur user_audit_log permettait de
-- forger des entrees attribuees a n'importe quel acteur
-- Date: 2026-07-24 -- trouve en audit RLS (P4, gap-closing)
--
-- Bug : "admins_insert_audit_log" (WITH CHECK) n'exige que
-- has_role(admin) OR is_super_admin() -- aucune contrainte sur
-- actor_id. Un admin pouvait donc inserer une ligne avec
-- actor_id = <uuid d'un admin d'une autre organisation>, visible ensuite
-- par cette organisation via "admins_view_audit_log" (qui scope par
-- actor_id/target_user_id dans profiles de son organisation) --
-- falsification du journal d'audit d'une organisation tierce.
--
-- Verifie live : le seul appel INSERT cote client
-- (src/components/users/AuditLogPanel.tsx) utilise toujours
-- actor_id: userData.user?.id (l'utilisateur courant) -- aucun flux
-- legitime n'insere pour un autre actor_id. Le fix n'affecte donc aucun
-- comportement applicatif existant.
--
-- Fix : exiger actor_id = auth.uid() en plus du role admin.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admins_insert_audit_log" ON public.user_audit_log;
CREATE POLICY "admins_insert_audit_log" ON public.user_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin())
    AND actor_id = auth.uid()
  );
