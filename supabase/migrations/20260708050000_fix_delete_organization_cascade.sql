-- ============================================================
-- Fix delete_organization — gérer la cascade des profils et stores
-- Date: 2026-07-08
-- Référence: AUDIT-2026-007 (post-pilote)
--
-- Problème :
--   Le RPC delete_organization faisait un DELETE FROM organizations direct,
--   mais la FK profiles_organization_id_fkey bloque la suppression car des
--   profils référencent encore l'org. Erreur 409 (Conflict) :
--   "update or delete on table organizations violates foreign key constraint
--    profiles_organization_id_fkey on table profiles"
--
-- Fix :
--   1. Détacher les profils (organization_id = NULL) avant suppression
--   2. Supprimer les stores liés
--   3. Logger l'action dans subscription_events et user_audit_log
--   4. Supprimer l'organisation (CASCADE gère subscriptions, etc.)
--
-- Les utilisateurs ne sont PAS supprimés — ils sont juste détachés de
-- l'org et peuvent rejoindre une autre organisation ou en créer une nouvelle.
--
-- Sécurité :
--   - Seul super_admin peut appeler ce RPC (vérification is_super_admin)
--   - Audit log complet avant suppression
--   - Aucune suppression d'utilisateur (juste détachement)
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

DROP FUNCTION IF EXISTS public.delete_organization(UUID);

CREATE OR REPLACE FUNCTION public.delete_organization(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name TEXT;
  v_owner_user_id UUID;
  v_store_count INTEGER := 0;
  v_user_count INTEGER := 0;
  v_subscription_plan TEXT;
  v_detach_count INTEGER := 0;
BEGIN
  -- 1. Vérifier que l'org existe
  SELECT name, owner_user_id INTO v_org_name, v_owner_user_id
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable : %', p_organization_id;
  END IF;

  -- 2. Seul super_admin peut supprimer
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : seul un super administrateur peut supprimer une organisation.';
  END IF;

  -- 3. Compter les stores
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stores'
  ) THEN
    SELECT COUNT(*) INTO v_store_count
    FROM public.stores
    WHERE organization_id = p_organization_id;
  END IF;

  -- 4. Compter les profils
  SELECT COUNT(*) INTO v_user_count
  FROM public.profiles
  WHERE organization_id = p_organization_id;

  -- 5. Récupérer le plan
  SELECT subscription_plan INTO v_subscription_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  -- 6. Logger AVANT suppression dans subscription_events si la table existe
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscription_events'
  ) THEN
    INSERT INTO public.subscription_events (
      organization_id, event_type, from_plan, to_plan, performed_by, metadata
    ) VALUES (
      p_organization_id,
      'organization_deleted',
      v_subscription_plan, NULL,
      auth.uid(),
      jsonb_build_object(
        'organization_id', p_organization_id,
        'organization_name', v_org_name,
        'owner_user_id', v_owner_user_id,
        'store_count', v_store_count,
        'user_count', v_user_count,
        'deleted_by', 'super_admin'
      )
    );
  END IF;

  -- 7. Logger dans user_audit_log si la table existe
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_audit_log'
  ) THEN
    INSERT INTO public.user_audit_log (actor_id, action, details)
    VALUES (
      auth.uid(),
      'delete_organization',
      jsonb_build_object(
        'organization_id', p_organization_id,
        'organization_name', v_org_name,
        'store_count', v_store_count,
        'user_count', v_user_count
      )
    );
  END IF;

  -- 8. Détacher les profils (mettre organization_id = NULL)
  -- Les utilisateurs ne sont PAS supprimés, juste détachés de l'org
  UPDATE public.profiles
  SET organization_id = NULL, updated_at = now()
  WHERE organization_id = p_organization_id;
  GET DIAGNOSTICS v_detach_count = ROW_COUNT;

  -- 9. Supprimer les stores liés
  IF v_store_count > 0 THEN
    DELETE FROM public.stores WHERE organization_id = p_organization_id;
  END IF;

  -- 10. Supprimer l'organisation (CASCADE gère subscriptions, etc.)
  DELETE FROM public.organizations WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'organization_id', p_organization_id,
    'organization_name', v_org_name,
    'deleted_stores', v_store_count,
    'detached_users', v_detach_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_organization(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- Vérification
-- ════════════════════════════════════════════════════════════════
-- SELECT proname, prosrc IS NOT NULL AS defined
-- FROM pg_proc
-- WHERE proname = 'delete_organization'
--   AND pronamespace = 'public'::regnamespace;
