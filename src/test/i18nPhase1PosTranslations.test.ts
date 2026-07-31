import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frPos from "@/i18n/locales/fr/pos.json";
import enPos from "@/i18n/locales/en/pos.json";

/**
 * Phase 1 du plan i18n (docs/production/I18N_MIGRATION_PLAN.md) —
 * POS.tsx (troisième et dernier composant du parcours "connexion →
 * dashboard → caisse") migré vers useTranslation(). Même méthode de
 * vérification que les tests Auth/Dashboard équivalents.
 *
 * Portée volontairement limitée à POS.tsx lui-même : les composants
 * enfants (POSCart, POSPaymentDialog, POSProductGrid/List,
 * MobileCartDrawer, ReceiptActionsDialog, BarcodeScannerDialog) ne sont
 * PAS traduits dans cette passe -- ce sont des unités de travail
 * séparées pour un futur incrément (namespace "pos" déjà en place,
 * prêt à les accueillir).
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

const posSrc = fs.readFileSync(path.join(process.cwd(), "src/pages/POS.tsx"), "utf-8");

describe("i18n Phase 1 — clés t() de POS.tsx résolues en fr et en", () => {
  const usedKeys = Array.from(
    posSrc.matchAll(/\bt\(["']([a-zA-Z0-9_.]+)["']/g)
  ).map((m) => m[1]);

  it("au moins une clé t() est utilisée (la migration a bien eu lieu)", () => {
    expect(usedKeys.length).toBeGreaterThan(15);
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frPos, key), `clé manquante dans fr/pos.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enPos, key), `clé manquante dans en/pos.json: ${key}`).not.toBeUndefined();
  });
});

describe("i18n Phase 1 — ressources fr/pos.json et en/pos.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frPos).sort();
    const enKeys = flattenKeys(enPos).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frPos],
      ["en", enPos],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("les clés d'interpolation ({{...}}) sont identiques entre fr et en pour chaque paire de clés", () => {
    const extractVars = (s: string) => Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]).sort();
    for (const key of flattenKeys(frPos)) {
      const frValue = getByPath(frPos, key);
      const enValue = getByPath(enPos, key);
      if (typeof frValue === "string" && typeof enValue === "string") {
        expect(extractVars(enValue), `variables d'interpolation différentes pour ${key}`).toEqual(extractVars(frValue));
      }
    }
  });
});

describe("i18n Phase 1 — POS.tsx", () => {
  it("utilise useTranslation('pos') dans le composant", () => {
    expect(posSrc).toMatch(/const \{ t \} = useTranslation\("pos"\);/);
  });

  it("les useCallback qui utilisent t(...) l'incluent dans leur tableau de dépendances", () => {
    // Sans ça, addToCart/updateCartQuantity garderaient la traduction figée
    // à la langue active au premier rendu, même après un changement de
    // langue en cours de session (bug de closure React classique).
    const addToCartCallback = posSrc.match(/const addToCart = useCallback\([\s\S]*?\}, \[([^\]]*)\]\);/)?.[1] ?? "";
    expect(addToCartCallback).toMatch(/\bt\b/);

    const updateQtyCallback = posSrc.match(/const updateCartQuantity = useCallback\([\s\S]*?\}, \[([^\]]*)\]\);/)?.[1] ?? "";
    expect(updateQtyCallback).toMatch(/\bt\b/);
  });

  it("n'a plus de littéral français codé en dur dans un aria-label", () => {
    const hardcodedAriaLabels = posSrc.match(/aria-label="[^"{][^"]*[À-ÿ][^"]*"/g) ?? [];
    expect(hardcodedAriaLabels).toEqual([]);
  });
});
