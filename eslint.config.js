import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  { ignores: ["dist", "savana-flow/**", "skills/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off", // HMR-only, not production-critical
      "@typescript-eslint/no-unused-vars": "off",
      // Accessibilité — règles essentielles pour un POS africain
      "jsx-a11y/anchor-is-valid": "off", // Landing page uses # anchors — not production-critical
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "off",
      // Ajoutées audit produit 2026-08-10 — durcissement a11y permanent.
      // jsx-a11y/heading-has-content délibérément exclue : bruit systématique
      // sur les primitives shadcn/ui génériques (AlertTitle, CardTitle...) où
      // le contenu vient de {...props}/children injectés dynamiquement, pas
      // visible statiquement par le linter -- faux positif structurel, pas un
      // vrai gap d'accessibilité (ces composants ne sont jamais rendus sans
      // contenu en pratique).
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/tabindex-no-positive": "warn",
      "jsx-a11y/aria-role": "warn",
    },
  },
);
