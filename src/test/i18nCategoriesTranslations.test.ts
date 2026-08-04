import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frCategories from "@/i18n/locales/fr/categories.json";
import enCategories from "@/i18n/locales/en/categories.json";

/**
 * i18n Phase 2 (docs/production/I18N_MIGRATION_PLAN.md) — Categories.tsx,
 * quatrième incrément de la Phase 2. Réutilise card.productCount pour le
 * total de produits dans l'en-tête (évite une clé dupliquée pour le même
 * texte pluralisé "N produit(s)").
 *
 * Écart connu, hors périmètre (fichier partagé, voir I18N_PHASE_2_REPORT.md) :
 * blockMutation() reste en français codé en dur.
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

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
const categoriesSrc = readNormalized(path.join(process.cwd(), "src/pages/Categories.tsx"));

describe("i18n Phase 2 — clés t() de Categories.tsx résolues en fr et en", () => {
  const PLURALIZED_KEYS = new Set(["categoryCount", "card.productCount"]);
  const usedKeys = Array.from(
    categoriesSrc.matchAll(/\bt\(["'`]([a-zA-Z0-9_.]+)["'`]/g)
  ).map((m) => m[1]).filter((k) => !PLURALIZED_KEYS.has(k));

  it("au moins 20 clés littérales sont utilisées", () => {
    expect(usedKeys.length).toBeGreaterThan(20);
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frCategories, key), `clé manquante dans fr/categories.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enCategories, key), `clé manquante dans en/categories.json: ${key}`).not.toBeUndefined();
  });

  it("les clés de pluralisation (_one/_other) utilisées par le code existent dans les deux langues", () => {
    for (const base of ["categoryCount", "card.productCount"]) {
      expect(getByPath(frCategories, `${base}_one`)).toBeTypeOf("string");
      expect(getByPath(frCategories, `${base}_other`)).toBeTypeOf("string");
      expect(getByPath(enCategories, `${base}_one`)).toBeTypeOf("string");
      expect(getByPath(enCategories, `${base}_other`)).toBeTypeOf("string");
    }
  });
});

describe("i18n Phase 2 — ressources fr/categories.json et en/categories.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frCategories).sort();
    const enKeys = flattenKeys(enCategories).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frCategories],
      ["en", enCategories],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });
});

describe("i18n Phase 2 — Categories.tsx", () => {
  it("utilise useTranslation('categories')", () => {
    expect(categoriesSrc).toMatch(/const \{ t \} = useTranslation\("categories"\);/);
  });

  it("réutilise card.productCount pour le total de produits dans l'en-tête (pas de clé dupliquée)", () => {
    expect(categoriesSrc).toMatch(/t\("categoryCount", \{ count: categories\.length \}\)/);
    expect(categoriesSrc).toMatch(/t\("card\.productCount", \{ count: totalProducts \}\)/);
  });

  it("n'a plus de littéral français codé en dur dans le JSX visible", () => {
    const hardcodedText = categoriesSrc.match(/>[^<{\n]*[À-ÿ][^<{\n]*</g) ?? [];
    expect(hardcodedText).toEqual([]);
  });

  it("PRESET_ICONS reste intact (icônes de catégorie, sans rapport avec l'i18n -- voir PR #61)", () => {
    expect(categoriesSrc).toMatch(/const PRESET_ICONS = \[/);
    const iconMatches = categoriesSrc.match(/"(\w+)"/g) ?? [];
    expect(iconMatches.length).toBeGreaterThan(30);
  });
});
