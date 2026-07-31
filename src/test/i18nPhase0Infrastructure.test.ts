import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frCommon from "@/i18n/locales/fr/common.json";
import enCommon from "@/i18n/locales/en/common.json";

/**
 * Phase 0 du plan i18n (docs/production/I18N_MIGRATION_PLAN.md) —
 * infrastructure react-i18next posée, langue forcée à "fr", zéro
 * changement visible (aucun composant n'utilise encore useTranslation()).
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

describe("i18n Phase 0 — infrastructure", () => {
  it("le config force la langue à 'fr' (aucun changement visible pour l'instant)", () => {
    const configSrc = fs.readFileSync(
      path.join(process.cwd(), "src/i18n/config.ts"),
      "utf-8"
    );
    expect(configSrc).toMatch(/lng:\s*"fr"/);
    expect(configSrc).toMatch(/fallbackLng:\s*"fr"/);
  });

  it("main.tsx importe la config i18n (initialisation avant le rendu)", () => {
    const mainSrc = fs.readFileSync(path.join(process.cwd(), "src/main.tsx"), "utf-8");
    expect(mainSrc).toMatch(/import\s+["']\.\/i18n\/config["']/);
  });

  it("les ressources fr et en ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frCommon).sort();
    const enKeys = flattenKeys(enCommon).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé de traduction n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frCommon],
      ["en", enCommon],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        const value = key.split(".").reduce<unknown>(
          (acc, part) => (acc as Record<string, unknown>)[part],
          resource
        );
        expect(value, `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("resolveJsonModule est activé (nécessaire pour importer les fichiers de traduction)", () => {
    const tsconfig = fs.readFileSync(
      path.join(process.cwd(), "tsconfig.app.json"),
      "utf-8"
    );
    expect(tsconfig).toMatch(/"resolveJsonModule":\s*true/);
  });
});
