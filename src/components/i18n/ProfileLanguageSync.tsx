import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";

/**
 * i18n Phase 2 (docs/production/I18N_MIGRATION_PLAN.md) — persistance de la
 * langue choisie côté profil (profiles.language, colonne déjà existante en
 * base, jamais câblée jusqu'ici). Composant invisible monté une fois sous
 * AuthProvider : synchronise i18n avec profiles.language dès que le profil
 * charge ou change, sans toucher à AuthContext.tsx (fichier critique pour
 * l'auth, hors scope de ce changement).
 *
 * Le français reste la langue par défaut si profiles.language est vide/null
 * (comportement inchangé pour tout utilisateur n'ayant jamais touché au
 * sélecteur) -- voir src/i18n/config.ts, lng: "fr".
 */
export function ProfileLanguageSync() {
  const { profile } = useAuth();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (profile?.language && profile.language !== i18n.language) {
      i18n.changeLanguage(profile.language);
    }
  }, [profile?.language, i18n]);

  return null;
}
