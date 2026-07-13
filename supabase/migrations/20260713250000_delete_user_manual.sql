-- ============================================================
-- Script : Supprimer un utilisateur directement en SQL
-- Date: 2026-07-13
-- ============================================================
-- Remplacez l'email par celui de l'utilisateur à supprimer.
-- ============================================================

DO $$
DECLARE
  v_target_email TEXT := 'vendeur@test.com'; -- ⚠️ REMPLACEZ par l'email à supprimer
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_target_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur % non trouvé', v_target_email;
  END IF;

  -- Supprimer user_roles
  DELETE FROM public.user_roles WHERE user_id = v_user_id;

  -- Supprimer profiles
  DELETE FROM public.profiles WHERE user_id = v_user_id;

  -- Supprimer auth.users (cascade vers identities, sessions, etc.)
  DELETE FROM auth.users WHERE id = v_user_id;

  RAISE NOTICE '✅ Utilisateur % supprimé définitivement', v_target_email;
END $$;
