import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frPricing from "@/i18n/locales/fr/pricing.json";
import enPricing from "@/i18n/locales/en/pricing.json";

/**
 * i18n Phase 2 (docs/production/I18N_MIGRATION_PLAN.md) — Pricing.tsx,
 * premier incrément de la Phase 2 (page publique, sans authentification,
 * choisie en premier car la plus petite et la plus isolée des 8 pages
 * listées). Même méthode de vérification que les tests Phase 1
 * (Auth/Dashboard/POS).
 */

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, fullKey);
    }
    return [fullKey];
  });
}

function getByPath(obj: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

const pricingSrc = fs.readFileSync(path.join(process.cwd(), "src/pages/Pricing.tsx"), "utf-8");

describe("i18n Phase 2 — clés t() de Pricing.tsx résolues en fr et en", () => {
  const usedKeys = Array.from(
    pricingSrc.matchAll(/\bt\(["']([a-zA-Z0-9_.]+)["']/g)
  ).map((m) => m[1]);
  // Les clés dynamiques (PLAN_HIGHLIGHT_KEYS[...], FEATURE_LABEL_KEYS[...]) ne
  // sont pas capturées par la regex ci-dessus -- vérifiées séparément.
  const dynamicKeys = [
    ...Object.values({
      "planHighlights.croissance": 1, "planHighlights.enterprise": 1,
    }),
  ];

  it("au moins une clé t() littérale est utilisée (la migration a bien eu lieu)", () => {
    expect(usedKeys.length).toBeGreaterThan(5);
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frPricing, key), `clé manquante dans fr/pricing.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enPricing, key), `clé manquante dans en/pricing.json: ${key}`).not.toBeUndefined();
  });

  it("les clés dynamiques (planHighlights.*, features.*) référencées dans le code existent bien dans les deux langues", () => {
    const dynamicKeyPaths = [
      "planHighlights.croissance",
      "planHighlights.enterprise",
      "features.has_advanced_reports",
      "features.has_exports",
      "features.has_supplier_management",
      "features.has_offline_advanced",
      "features.has_custom_branding",
      "features.has_multi_currency",
      "features.has_api_access",
      "features.has_priority_support",
      "features.has_ai_assistant",
      "features.has_loyalty_program",
    ];
    for (const key of dynamicKeyPaths) {
      expect(getByPath(frPricing, key), `fr manque: ${key}`).not.toBeUndefined();
      expect(getByPath(enPricing, key), `en manque: ${key}`).not.toBeUndefined();
    }
  });
});

describe("i18n Phase 2 — ressources fr/pricing.json et en/pricing.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frPricing).sort();
    const enKeys = flattenKeys(enPricing).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frPricing],
      ["en", enPricing],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("les clés d'interpolation ({{...}}) sont identiques entre fr et en pour chaque paire de clés", () => {
    const extractVars = (s: string) => Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]).sort();
    for (const key of flattenKeys(frPricing)) {
      const frValue = getByPath(frPricing, key);
      const enValue = getByPath(enPricing, key);
      if (typeof frValue === "string" && typeof enValue === "string") {
        expect(extractVars(enValue), `variables d'interpolation différentes pour ${key}`).toEqual(extractVars(frValue));
      }
    }
  });
});

describe("i18n Phase 2 — Pricing.tsx", () => {
  it("utilise useTranslation('pricing') dans le composant principal et dans PlanCard", () => {
    const usages = pricingSrc.match(/const \{ t \} = useTranslation\("pricing"\);/g) ?? [];
    expect(usages.length).toBeGreaterThanOrEqual(2);
  });

  it("n'a plus de littéral français codé en dur dans les libellés visibles (Populaire/Premium/Gratuit/Plan actuel)", () => {
    expect(pricingSrc).not.toMatch(/>\s*Populaire\s*</);
    expect(pricingSrc).not.toMatch(/>\s*Premium\s*</);
    expect(pricingSrc).not.toMatch(/>\s*Gratuit\s*</);
    expect(pricingSrc).not.toMatch(/>\s*Plan actuel\s*</);
  });
});
