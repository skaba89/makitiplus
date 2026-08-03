import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frCustomers from "@/i18n/locales/fr/customers.json";
import enCustomers from "@/i18n/locales/en/customers.json";

/**
 * i18n Phase 2 (docs/production/I18N_MIGRATION_PLAN.md) — Customers.tsx,
 * cinquième incrément de la Phase 2. Composants enfants (CustomerDetailDialog,
 * CreditPaymentDialog) hors périmètre, même principe que les pages
 * précédentes. formatErrors(validation.errors) (src/lib/schemas.ts) reste
 * également hors périmètre -- ce n'est pas une chaîne littérale mais un
 * message composé par la librairie de validation.
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
const customersSrc = readNormalized(path.join(process.cwd(), "src/pages/Customers.tsx"));

describe("i18n Phase 2 — clés t() de Customers.tsx résolues en fr et en", () => {
  const usedKeys = Array.from(
    customersSrc.matchAll(/\bt\(["'`]([a-zA-Z0-9_.]+)["'`]/g)
  ).map((m) => m[1]);

  it("au moins 25 clés littérales sont utilisées", () => {
    expect(usedKeys.length).toBeGreaterThan(25);
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frCustomers, key), `clé manquante dans fr/customers.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enCustomers, key), `clé manquante dans en/customers.json: ${key}`).not.toBeUndefined();
  });
});

describe("i18n Phase 2 — ressources fr/customers.json et en/customers.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frCustomers).sort();
    const enKeys = flattenKeys(enCustomers).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frCustomers],
      ["en", enCustomers],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("les clés d'interpolation ({{...}}) sont identiques entre fr et en pour chaque paire de clés", () => {
    const extractVars = (s: string) => Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]).sort();
    for (const key of flattenKeys(frCustomers)) {
      const frValue = getByPath(frCustomers, key);
      const enValue = getByPath(enCustomers, key);
      if (typeof frValue === "string" && typeof enValue === "string") {
        expect(extractVars(enValue), `variables d'interpolation différentes pour ${key}`).toEqual(extractVars(frValue));
      }
    }
  });
});

describe("i18n Phase 2 — Customers.tsx", () => {
  it("utilise useTranslation('customers')", () => {
    expect(customersSrc).toMatch(/const \{ t \} = useTranslation\("customers"\);/);
  });

  it("n'a plus de littéral français codé en dur dans le JSX visible ni dans les aria-label", () => {
    const hardcodedText = customersSrc.match(/>[^<{\n]*[À-ÿ][^<{\n]*</g) ?? [];
    expect(hardcodedText).toEqual([]);
    const hardcodedAria = customersSrc.match(/aria-label="[^{][^"]*"/g) ?? [];
    expect(hardcodedAria).toEqual([]);
  });
});
