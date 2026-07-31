import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import frCommon from "./locales/fr/common.json";
import enCommon from "./locales/en/common.json";

/**
 * Phase 0 (infrastructure) — docs/production/I18N_MIGRATION_PLAN.md
 *
 * Langue forcée à "fr" : aucun composant n'utilise encore useTranslation(),
 * donc rien ne doit changer visuellement. La ressource "en" existe déjà
 * (prouve que le mécanisme de bascule de langue fonctionne) mais n'est
 * activée par aucun sélecteur pour l'instant — ça viendra en Phase 1.
 * La langue par défaut dérivée de profile.country (comme useCurrency())
 * est prévue en Phase 3, pas avant.
 */
i18n.use(initReactI18next).init({
  resources: {
    fr: { common: frCommon },
    en: { common: enCommon },
  },
  lng: "fr",
  fallbackLng: "fr",
  defaultNS: "common",
  interpolation: {
    escapeValue: false, // React échappe déjà le JSX
  },
});

export default i18n;
