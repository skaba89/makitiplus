import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { reportError } from "@/lib/sentry";
import { ENGLISH_SPEAKING_COUNTRY_CODES, resolveCountry } from "@/utils/currencies";

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
 *
 * Audit produit du 2026-08-10 : la détection automatique de langue à partir
 * du pays de l'organisation (documentée comme "Phase 3" dans le commentaire
 * ci-dessus à l'origine) est ajoutée ici -- UNE SEULE FOIS, à la première
 * détection d'un profil sans langue explicite. Le résultat est immédiatement
 * persisté dans profiles.language (même pattern que language-selector.tsx),
 * de sorte que :
 *  - un profil Guinéen (GN, hors ENGLISH_SPEAKING_COUNTRY_CODES) continue de
 *    démarrer en français, sans aucun changement de comportement ;
 *  - un profil dans un pays anglophone démarre en anglais par défaut, mais
 *    UNE FOIS ce choix persisté, l'utilisateur qui le change manuellement via
 *    le sélecteur (Settings) n'est plus jamais réécrasé par cette inférence.
 */
export function ProfileLanguageSync() {
  const { profile, user } = useAuth();
  const { i18n } = useTranslation();
  const inferenceAttempted = useRef(false);

  useEffect(() => {
    if (profile?.language && profile.language !== i18n.language) {
      i18n.changeLanguage(profile.language);
      return;
    }

    // Inférence unique : profil chargé, aucune langue explicite enregistrée.
    if (
      !inferenceAttempted.current &&
      profile &&
      !profile.language &&
      profile.country &&
      user
    ) {
      inferenceAttempted.current = true;
      const resolvedCountry = resolveCountry(profile.country);
      if (resolvedCountry && ENGLISH_SPEAKING_COUNTRY_CODES.has(resolvedCountry.code)) {
        i18n.changeLanguage("en");
        supabase
          .from("profiles")
          .update({ language: "en" })
          .eq("user_id", user.id)
          .then(({ error }) => {
            // Non bloquant : si la persistance échoue (offline, RLS), la
            // langue reste "en" à l'écran pour cette session ; la prochaine
            // détection retentera au prochain montage (inferenceAttempted
            // est un ref local au composant, pas persisté).
            if (error) reportError(error);
          });
      }
    }
  }, [profile, user, i18n]);

  return null;
}
