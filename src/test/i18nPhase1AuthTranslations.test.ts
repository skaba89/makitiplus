import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frAuth from "@/i18n/locales/fr/auth.json";
import enAuth from "@/i18n/locales/en/auth.json";

/**
 * Phase 1 du plan i18n (docs/production/I18N_MIGRATION_PLAN.md) —
 * Auth.tsx est le premier composant migré vers useTranslation(). Ce test
 * vérifie que chaque clé t("...") référencée dans le fichier existe
 * réellement dans les deux ressources (fr/en), pour éviter qu'un futur
 * commit ajoute un t() sans la clé correspondante (silencieusement rendu
 * comme la clé brute par i18next en prod).
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

const authSrc = fs.readFileSync(path.join(process.cwd(), "src/pages/Auth.tsx"), "utf-8");

describe("i18n Phase 1 — clés t() de Auth.tsx résolues en fr et en", () => {
  const usedKeys = Array.from(
    authSrc.matchAll(/\bt\(["']([a-zA-Z0-9_.]+)["']/g)
  ).map((m) => m[1]);

  it("au moins une clé t() est utilisée (la migration a bien eu lieu)", () => {
    expect(usedKeys.length).toBeGreaterThan(10);
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frAuth, key), `clé manquante dans fr/auth.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enAuth, key), `clé manquante dans en/auth.json: ${key}`).not.toBeUndefined();
  });
});

describe("i18n Phase 1 — ressources fr/auth.json et en/auth.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frAuth).sort();
    const enKeys = flattenKeys(enAuth).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frAuth],
      ["en", enAuth],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });
});

describe("i18n Phase 1 — Auth.tsx", () => {
  it("utilise useTranslation('auth') dans le composant", () => {
    expect(authSrc).toMatch(/const \{ t \} = useTranslation\("auth"\);/);
  });

  it("les schémas zod construisent le message à l'appel (pas au chargement du module)", () => {
    // Un schéma zod figé au chargement du module bake la langue active à
    // ce moment-là (toujours "fr" au démarrage) et ne suivrait jamais un
    // changement de langue ultérieur -- d'où buildLoginSchema()/
    // buildSignupSchema() plutôt que des constantes loginSchema/signupSchema.
    expect(authSrc).toMatch(/const buildLoginSchema = \(\) =>/);
    expect(authSrc).toMatch(/const buildSignupSchema = \(\) =>/);
    expect(authSrc).toMatch(/buildLoginSchema\(\)\.safeParse/);
    expect(authSrc).toMatch(/buildSignupSchema\(\)\.safeParse/);
  });

  it("n'a plus de littéraux français codés en dur dans les toasts (title:)", () => {
    // Les titres de toast doivent tous passer par t(...) désormais.
    const toastTitleLiterals = authSrc.match(/title:\s*"[^"]*[À-ÿ][^"]*"/g) ?? [];
    expect(toastTitleLiterals).toEqual([]);
  });
});
