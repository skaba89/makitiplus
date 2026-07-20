-- ════════════════════════════════════════════════════════════════
-- Réaffirmer : les admins (non-super_admin) ne voient pas les actions
-- du super_admin dans l'historique d'audit (Gestion utilisateur > Historique)
-- Date: 2026-07-20
--
-- Cette policy existe déjà dans 20260715200000_CONSOLIDATED_ALL_FIXES.sql.
-- On la réapplique ici de façon idempotente (DROP + CREATE, même définition)
-- au cas où elle n'aurait pas été appliquée ou aurait été écrasée depuis —
-- aucune donnée n'est modifiée, uniquement la policy RLS.
--
-- src/pages/Users.tsx loadAudit() interroge user_audit_log SANS filtre
-- côté client (contrairement à loadUsers() juste au-dessus, qui exclut
-- explicitement les super_admins en plus de la RLS) — cette table dépend
-- donc entièrement de la RLS pour l'isolation tenant + le masquage du
-- super_admin.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admins_view_audit_log" ON public.user_audit_log;

CREATE POLICY "admins_view_audit_log"
  ON public.user_audit_log FOR SELECT TO authenticated
  USING (
    -- Le super_admin voit tout l'audit
    public.is_super_admin()
    -- Les admins voient l'audit de leur org seulement, hors actions du super_admin
    OR (
      public.has_role(auth.uid(), 'admin')
      AND (
        actor_id IN (
          SELECT p.user_id FROM public.profiles p
          WHERE p.organization_id = public.get_user_organization_id()
        )
        OR target_user_id IN (
          SELECT p.user_id FROM public.profiles p
          WHERE p.organization_id = public.get_user_organization_id()
        )
      )
      AND actor_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
      )
    )
  );
