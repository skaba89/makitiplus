import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import frCommon from "./locales/fr/common.json";
import enCommon from "./locales/en/common.json";
import frAuth from "./locales/fr/auth.json";
import enAuth from "./locales/en/auth.json";
import frDashboard from "./locales/fr/dashboard.json";
import enDashboard from "./locales/en/dashboard.json";
import frPos from "./locales/fr/pos.json";
import enPos from "./locales/en/pos.json";
import frPricing from "./locales/fr/pricing.json";
import enPricing from "./locales/en/pricing.json";
import frReports from "./locales/fr/reports.json";
import enReports from "./locales/en/reports.json";
import frProducts from "./locales/fr/products.json";
import enProducts from "./locales/en/products.json";
import frCategories from "./locales/fr/categories.json";
import enCategories from "./locales/en/categories.json";

/**
 * Phase 1 (premier parcours traduit) — docs/production/I18N_MIGRATION_PLAN.md
 *
 * Langue par défaut toujours forcée à "fr" (comportement actuel inchangé
 * pour l'utilisateur qui ne touche jamais au sélecteur de langue). Le
 * sélecteur (Settings) permet de basculer vers "en" à la volée. La langue
 * par défaut dérivée de profile.country (comme useCurrency()) reste prévue
 * en Phase 3, pas avant.
 */
i18n.use(initReactI18next).init({
  resources: {
    fr: { common: frCommon, auth: frAuth, dashboard: frDashboard, pos: frPos, pricing: frPricing, reports: frReports, products: frProducts, categories: frCategories },
    en: { common: enCommon, auth: enAuth, dashboard: enDashboard, pos: enPos, pricing: enPricing, reports: enReports, products: enProducts, categories: enCategories },
  },
  lng: "fr",
  fallbackLng: "fr",
  defaultNS: "common",
  interpolation: {
    escapeValue: false, // React échappe déjà le JSX
  },
});

export default i18n;
