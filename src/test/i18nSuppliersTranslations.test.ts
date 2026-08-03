import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frSuppliers from "@/i18n/locales/fr/suppliers.json";
import enSuppliers from "@/i18n/locales/en/suppliers.json";

/**
 * i18n Phase 2 (docs/production/I18N_MIGRATION_PLAN.md) — Suppliers.tsx,
 * sixième incrément de la Phase 2. Composant enfant (SupplierDetailDialog)
 * hors périmètre. blockMutation() (DemoContext.tsx, toast "Mode démo")
 * reste également hors périmètre -- fichier partagé, voir
 * I18N_PHASE_2_REPORT.md.
 *
 * Le placeholder par défaut "Guinée"/"country: 'Guinée'" dans formData
 * n'est volontairement PAS traduit : c'est une valeur de donnée métier
 * stockée telle quelle en base pour le champ country d'un fournisseur,
 * pas du texte d'interface -- la traduire créerait une incohérence de
 * données entre fournisseurs créés dans des langues d'interface
 * différentes (même principe que les codes de devise, jamais traduits).
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
const suppliersSrc = readNormalized(path.join(process.cwd(), "src/pages/Suppliers.tsx"));

describe("i18n Phase 2 — clés t() de Suppliers.tsx résolues en fr et en", () => {
  const usedKeys = Array.from(
    suppliersSrc.matchAll(/\bt\(["'`]([a-zA-Z0-9_.]+)["'`]/g)
  ).map((m) => m[1]);

  it("au moins 30 clés littérales sont utilisées", () => {
    expect(usedKeys.length).toBeGreaterThan(30);
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frSuppliers, key), `clé manquante dans fr/suppliers.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enSuppliers, key), `clé manquante dans en/suppliers.json: ${key}`).not.toBeUndefined();
  });
});

describe("i18n Phase 2 — ressources fr/suppliers.json et en/suppliers.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frSuppliers).sort();
    const enKeys = flattenKeys(enSuppliers).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frSuppliers],
      ["en", enSuppliers],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });
});

describe("i18n Phase 2 — Suppliers.tsx", () => {
  it("utilise useTranslation('suppliers')", () => {
    expect(suppliersSrc).toMatch(/const \{ t \} = useTranslation\("suppliers"\);/);
  });

  it("n'a plus de littéral français codé en dur dans le JSX visible ni dans les aria-label", () => {
    const hardcodedText = suppliersSrc.match(/>[^<{\n]*[À-ÿ][^<{\n]*</g) ?? [];
    expect(hardcodedText).toEqual([]);
    const hardcodedAria = suppliersSrc.match(/aria-label="[^{][^"]*"/g) ?? [];
    expect(hardcodedAria).toEqual([]);
  });

  it("le dialogue de suppression compose bien préfixe + nom + suffixe autour de <strong>", () => {
    expect(suppliersSrc).toMatch(/\{t\("deleteDialog\.descriptionPrefix"\)\}\{" "\}/);
    expect(suppliersSrc).toMatch(/<strong>\{selectedSupplier\?\.name\}<\/strong> \{t\("deleteDialog\.descriptionSuffix"\)\}/);
  });

  it("le pays par défaut 'Guinée' reste une donnée métier non traduite (valeur stockée en base)", () => {
    expect(suppliersSrc).toMatch(/country: "Guinée"/);
  });
});
