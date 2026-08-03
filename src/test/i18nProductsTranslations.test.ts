import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frProducts from "@/i18n/locales/fr/products.json";
import enProducts from "@/i18n/locales/en/products.json";

/**
 * i18n Phase 2 (docs/production/I18N_MIGRATION_PLAN.md) — Products.tsx,
 * troisième incrément de la Phase 2. Composants enfants (ProductList,
 * ProductForm, StockAdjustDialog, ProductImportDialog, StockMovementHistory)
 * hors périmètre, même principe que POS.tsx/Phase 1.5.
 *
 * Note : blockMutation() (mode démo, src/contexts/DemoContext.tsx) affiche
 * aussi un toast en français ("Mode démo", "n'est pas disponible en mode
 * démo"...) mais c'est un fichier PARTAGÉ par toutes les pages de l'app,
 * pas propre à Products.tsx -- traité hors périmètre volontairement, comme
 * documenté dans docs/production/I18N_PHASE_2_REPORT.md.
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
const productsSrc = readNormalized(path.join(process.cwd(), "src/pages/Products.tsx"));

describe("i18n Phase 2 — clés t() de Products.tsx résolues en fr et en", () => {
  // stockAlerts.outOfStock/lowStock sont appelées sans suffixe -- i18next
  // résout _one/_other lui-même via {count}. Vérifiées séparément ci-dessous.
  const PLURALIZED_KEYS = new Set(["stockAlerts.outOfStock", "stockAlerts.lowStock"]);
  const usedKeys = Array.from(
    productsSrc.matchAll(/\bt\(["'`]([a-zA-Z0-9_.]+)["'`]/g)
  ).map((m) => m[1]).filter((k) => !PLURALIZED_KEYS.has(k));

  it("au moins 20 clés littérales sont utilisées", () => {
    expect(usedKeys.length).toBeGreaterThan(20);
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frProducts, key), `clé manquante dans fr/products.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enProducts, key), `clé manquante dans en/products.json: ${key}`).not.toBeUndefined();
  });
});

describe("i18n Phase 2 — ressources fr/products.json et en/products.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frProducts).sort();
    const enKeys = flattenKeys(enProducts).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frProducts],
      ["en", enProducts],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("les clés d'interpolation ({{...}}) sont identiques entre fr et en pour chaque paire de clés", () => {
    const extractVars = (s: string) => Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]).sort();
    for (const key of flattenKeys(frProducts)) {
      const frValue = getByPath(frProducts, key);
      const enValue = getByPath(enProducts, key);
      if (typeof frValue === "string" && typeof enValue === "string") {
        expect(extractVars(enValue), `variables d'interpolation différentes pour ${key}`).toEqual(extractVars(frValue));
      }
    }
  });

  it("les clés de pluralisation (_one/_other) utilisées par le code existent dans les deux langues", () => {
    for (const base of ["stockAlerts.outOfStock", "stockAlerts.lowStock"]) {
      expect(getByPath(frProducts, `${base}_one`)).toBeTypeOf("string");
      expect(getByPath(frProducts, `${base}_other`)).toBeTypeOf("string");
      expect(getByPath(enProducts, `${base}_one`)).toBeTypeOf("string");
      expect(getByPath(enProducts, `${base}_other`)).toBeTypeOf("string");
    }
  });
});

describe("i18n Phase 2 — Products.tsx", () => {
  it("utilise useTranslation('products')", () => {
    expect(productsSrc).toMatch(/const \{ t \} = useTranslation\("products"\);/);
  });

  it("n'a plus de littéral français codé en dur dans le JSX visible (hors séparateur '·', faux positif d'encodage sur l'octet UTF-8 initial)", () => {
    // [^<{\n] borne le match à une seule ligne -- sans ça, un générique
    // TypeScript comme `useState<Product | null>` fournit un ">" qui fait
    // dériver le match jusqu'au prochain "<" bien plus loin dans le fichier,
    // engloutissant du code et des commentaires accentués sans rapport.
    const hardcodedText = (productsSrc.match(/>[^<{\n]*[À-ÿ][^<{\n]*</g) ?? [])
      .filter((s) => !/^>\s*·\s*<$/.test(s));
    expect(hardcodedText).toEqual([]);
  });
});
