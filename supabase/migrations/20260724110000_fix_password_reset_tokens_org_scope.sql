-- ════════════════════════════════════════════════════════════════
-- Fix defense-en-profondeur : policies INSERT/UPDATE de
-- password_reset_tokens non scopees par organisation
-- Date: 2026-07-24 -- trouve en audit RLS (P4, gap-closing), suite au
-- meme audit qui a produit 20260724100000_fix_organizations_update_cross_tenant.sql
--
-- Bug : "admins_insert_reset_tokens" (WITH CHECK) et
-- "admins_update_reset_tokens" (USING) n'imposent aucune comparaison
-- avec organization_id -- has_role(auth.uid(),'admin') suffit, sans
-- egard a l'organisation ciblee par la ligne. Contrairement au cas
-- organizations (deja corrige), ce n'est PAS neutralise pour toutes les
-- lignes : la policy SELECT "admins_view_reset_tokens" autorise aussi
-- les lignes organization_id IS NULL pour n'importe quel admin, donc
-- toute ligne avec organization_id NULL serait visible ET modifiable/
-- creable par un admin d'une autre organisation.
--
-- Verifie : la table est actuellement vide (aucune ligne NULL en
-- prod), donc pas d'exploitation constatee, mais la table est
-- accessible en lecture directe depuis le client (ResetTokensPanel.tsx
-- via supabase.from('password_reset_tokens')), donc exposee a
-- PostgREST avec un JWT authentifie standard -- une requete directe
-- (hors UI) pourrait exploiter la brèche si une ligne NULL apparaissait
-- un jour (bug ailleurs, insertion manuelle, etc.).
--
-- Les deux Edge Functions qui ecrivent sur cette table
-- (admin-send-reset-link, redeem-reset-token) utilisent le
-- service_role (adminClient), qui contourne RLS -- ce fix n'affecte
-- donc aucun flux applicatif existant.
--
-- Fix : exiger organization_id = get_user_organization_id() pour
-- INSERT/UPDATE (comme le fait deja la policy SELECT pour les lignes
-- non-NULL), en plus du role admin. is_super_admin() reste inchange.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admins_insert_reset_tokens" ON public.password_reset_tokens;
CREATE POLICY "admins_insert_reset_tokens" ON public.password_reset_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (organization_id = public.get_user_organization_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  );

DROP POLICY IF EXISTS "admins_update_reset_tokens" ON public.password_reset_tokens;
CREATE POLICY "admins_update_reset_tokens" ON public.password_reset_tokens
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (organization_id = public.get_user_organization_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  );
