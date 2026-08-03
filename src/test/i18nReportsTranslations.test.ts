import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frReports from "@/i18n/locales/fr/reports.json";
import enReports from "@/i18n/locales/en/reports.json";

/**
 * i18n Phase 2 (docs/production/I18N_MIGRATION_PLAN.md) — Reports.tsx,
 * deuxième incrément de la Phase 2. Seule la page Reports.tsx elle-même
 * est migrée -- ses composants enfants (ProductKpisCard, CategoryKpisCard,
 * SellerKpisCard, EnhancedDashboardStats) restent hors périmètre, même
 * principe que POS.tsx/Phase 1.5.
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
const reportsSrc = readNormalized(path.join(process.cwd(), "src/pages/Reports.tsx"));

describe("i18n Phase 2 — clés t()/i18nKey de Reports.tsx résolues en fr et en", () => {
  const literalKeys = Array.from(
    reportsSrc.matchAll(/\bt\(["'`]([a-zA-Z0-9_.]+)["'`]/g)
  ).map((m) => m[1]);
  const transKeys = Array.from(
    reportsSrc.matchAll(/i18nKey="([a-zA-Z0-9_.]+)"/g)
  ).map((m) => m[1]);
  const usedKeys = [...literalKeys, ...transKeys];

  it("au moins 30 clés littérales sont utilisées (la migration a bien eu lieu, page volumineuse)", () => {
    expect(literalKeys.length).toBeGreaterThan(30);
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frReports, key), `clé manquante dans fr/reports.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enReports, key), `clé manquante dans en/reports.json: ${key}`).not.toBeUndefined();
  });

  it("les clés dynamiques du mapping paymentLabels (PAYMENT_METHOD_KEYS) existent bien dans les deux langues", () => {
    const methods = ["cash", "wave", "orange_money", "mtn_money", "moov_money", "mpesa", "card", "credit"];
    for (const method of methods) {
      expect(getByPath(frReports, `paymentLabels.${method}`), `fr manque paymentLabels.${method}`).not.toBeUndefined();
      expect(getByPath(enReports, `paymentLabels.${method}`), `en manque paymentLabels.${method}`).not.toBeUndefined();
    }
  });
});

describe("i18n Phase 2 — ressources fr/reports.json et en/reports.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frReports).sort();
    const enKeys = flattenKeys(enReports).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frReports],
      ["en", enReports],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("les clés d'interpolation ({{...}}) sont identiques entre fr et en pour chaque paire de clés", () => {
    const extractVars = (s: string) => Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]).sort();
    for (const key of flattenKeys(frReports)) {
      const frValue = getByPath(frReports, key);
      const enValue = getByPath(enReports, key);
      if (typeof frValue === "string" && typeof enValue === "string") {
        expect(extractVars(enValue), `variables d'interpolation différentes pour ${key}`).toEqual(extractVars(frValue));
      }
    }
  });
});

describe("i18n Phase 2 — Reports.tsx", () => {
  it("utilise useTranslation('reports')", () => {
    expect(reportsSrc).toMatch(/const \{ t \} = useTranslation\("reports"\);/);
  });

  it("le graphique fournisseurs utilise des clés techniques stables (purchaseValue/saleValue), pas les libellés traduits comme dataKey", () => {
    // Sinon changer de langue casserait le graphique (dataKey/CSS var
    // dérivés du libellé affiché) -- voir historique de ce fichier.
    expect(reportsSrc).toMatch(/purchaseValue: s\.stock_value_at_cost/);
    expect(reportsSrc).toMatch(/saleValue: s\.stock_value_at_price/);
    expect(reportsSrc).toMatch(/dataKey="purchaseValue" fill="var\(--color-purchaseValue\)"/);
    expect(reportsSrc).toMatch(/dataKey="saleValue" fill="var\(--color-saleValue\)"/);
  });

  it("n'a plus de littéral français codé en dur dans le JSX visible", () => {
    const hardcodedText = reportsSrc.match(/>[^<{]*[À-ÿ][^<{]*</g) ?? [];
    expect(hardcodedText).toEqual([]);
  });
});
