import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frDashboard from "@/i18n/locales/fr/dashboard.json";
import enDashboard from "@/i18n/locales/en/dashboard.json";

/**
 * Phase 1 du plan i18n (docs/production/I18N_MIGRATION_PLAN.md) —
 * Dashboard.tsx (deuxième composant du parcours, après Auth.tsx) migré
 * vers useTranslation(). Même méthode de vérification que
 * i18nPhase1AuthTranslations.test.ts : chaque clé t() référencée dans le
 * fichier source doit résoudre en fr ET en, sans dérive entre les deux
 * ressources.
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

const dashboardSrc = fs.readFileSync(path.join(process.cwd(), "src/pages/Dashboard.tsx"), "utf-8");

describe("i18n Phase 1 — clés t() de Dashboard.tsx résolues en fr et en", () => {
  const usedKeys = Array.from(
    dashboardSrc.matchAll(/\bt\(["']([a-zA-Z0-9_.]+)["']/g)
  ).map((m) => m[1]);

  it("au moins une clé t() est utilisée (la migration a bien eu lieu)", () => {
    expect(usedKeys.length).toBeGreaterThan(20);
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frDashboard, key), `clé manquante dans fr/dashboard.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enDashboard, key), `clé manquante dans en/dashboard.json: ${key}`).not.toBeUndefined();
  });
});

describe("i18n Phase 1 — ressources fr/dashboard.json et en/dashboard.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frDashboard).sort();
    const enKeys = flattenKeys(enDashboard).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frDashboard],
      ["en", enDashboard],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("les clés d'interpolation ({{...}}) sont identiques entre fr et en pour chaque paire de clés", () => {
    const extractVars = (s: string) => Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]).sort();
    for (const key of flattenKeys(frDashboard)) {
      const frValue = getByPath(frDashboard, key);
      const enValue = getByPath(enDashboard, key);
      if (typeof frValue === "string" && typeof enValue === "string") {
        expect(extractVars(enValue), `variables d'interpolation différentes pour ${key}`).toEqual(extractVars(frValue));
      }
    }
  });
});

describe("i18n Phase 1 — Dashboard.tsx", () => {
  it("utilise useTranslation('dashboard') dans le composant", () => {
    expect(dashboardSrc).toMatch(/const \{ t \} = useTranslation\("dashboard"\);/);
  });

  it("le message WhatsApp est entièrement construit via t(\"whatsapp....\") (pas de gabarit français figé)", () => {
    expect(dashboardSrc).toMatch(/t\("whatsapp\.title"/);
    expect(dashboardSrc).toMatch(/t\("whatsapp\.salesToday"/);
    expect(dashboardSrc).toMatch(/t\("whatsapp\.footer"\)/);
    expect(dashboardSrc).not.toMatch(/Rapport MakitiPlus —/);
  });

  it("n'a plus de littéral français codé en dur dans un aria-label", () => {
    const hardcodedAriaLabels = dashboardSrc.match(/aria-label="[^"{][^"]*[À-ÿ][^"]*"/g) ?? [];
    expect(hardcodedAriaLabels).toEqual([]);
  });
});
