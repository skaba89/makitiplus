-- ════════════════════════════════════════════════════════════════
-- Migration: fix_super_admin_can_read_all_stores
-- Date: 2026-07-15
-- Objectif: Le super_admin doit pouvoir voir les stores de TOUTES les
--           organisations, pas seulement celle de son profil.
--           
--           Bug: La policy stores_select_org_member filtre par
--           profiles.organization_id du user. Le super_admin a son
--           organization_id pointant vers son org principale, donc
--           il ne voyait pas les stores des nouvelles orgs créées.
-- ════════════════════════════════════════════════════════════════

-- 1. Recréer la policy SELECT sur stores pour inclure is_super_admin()
DROP POLICY IF EXISTS "stores_select_org_member" ON public.stores;

CREATE POLICY "stores_select_org_member"
  ON public.stores FOR SELECT
  TO authenticated
  USING (
    -- Le super_admin peut voir TOUS les stores
    public.is_super_admin()
    -- Sinon, seulement les stores de son organisation
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

-- 2. Vérification
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Policy stores_select_org_member mise à jour.';
  RAISE NOTICE 'Le super_admin peut maintenant voir TOUS les stores.';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
