-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX : Ajouter la RLS policy DELETE pour les organisations (super_admin only)
-- Le super_admin ne pouvait pas supprimer les magasins car aucune policy DELETE
-- n'existait sur la table organizations.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Policy : seul le super_admin peut supprimer une organisation
CREATE POLICY "super_admin_can_delete_org" ON public.organizations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- Vérification : lister toutes les policies sur organizations
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'organizations'
ORDER BY policyname;
