import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frCommon from "@/i18n/locales/fr/common.json";
import enCommon from "@/i18n/locales/en/common.json";

/**
 * i18n — tâche transversale "mode démo" (feat/i18n-demo-mode-cross-cutting).
 *
 * DemoContext.tsx (blockMutation) et useDemoMutation.ts sont des fichiers
 * PARTAGÉS par toutes les pages de l'app -- documentés comme écart connu et
 * volontairement hors périmètre dans plusieurs phases précédentes (voir
 * I18N_PHASE_2_REPORT.md et les commentaires historiques dans
 * i18nCategoriesTranslations.test.ts / i18nProductsTranslations.test.ts /
 * i18nSuppliersTranslations.test.ts). Ce test verrouille le traitement
 * complet de cet écart : plus aucun appel blockMutation('...') codé en dur
 * nulle part dans src/, et toutes les clés demo.* utilisées résolvent en
 * français et en anglais.
 */

function getByPath(obj: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx?|ts)$/.test(entry.name) && !full.includes(`${path.sep}test${path.sep}`)) {
      out.push(full);
    }
  }
  return out;
}

const srcDir = path.join(process.cwd(), "src");
const sourceFiles = walk(srcDir);

describe("i18n — mode démo (blockMutation) entièrement traduit", () => {
  it("aucun appel blockMutation('...') codé en dur ne subsiste dans src/", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf-8");
      if (/blockMutation\(\s*['"`]/.test(content)) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }
    expect(offenders, `blockMutation() avec chaîne codée en dur trouvé dans : ${offenders.join(", ")}`).toEqual([]);
  });

  it("DemoContext.tsx et useDemoMutation.ts utilisent useTranslation (plus de texte français en dur dans le code, hors commentaires/JSDoc)", () => {
    for (const rel of ["src/contexts/DemoContext.tsx", "src/hooks/useDemoMutation.ts"]) {
      const raw = fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
      // Retire les commentaires /** ... */ et // ... pour ne juger que le code exécutable.
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(raw, rel).toMatch(/useTranslation/);
      expect(code, `${rel} : toast.warning("Mode démo" codé en dur dans le code`).not.toMatch(/toast\.warning\(\s*["'`]Mode démo/);
      expect(code, `${rel} : label "Créer mon compte" codé en dur dans le code`).not.toMatch(/label:\s*["'`]Créer mon compte/);
    }
  });

  const usedKeys = new Set<string>();
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, "utf-8");
    for (const m of content.matchAll(/t\(\s*["'`](demo\.[a-zA-Z0-9_.]+)["'`]/g)) {
      usedKeys.add(m[1]);
    }
  }
  const keys = Array.from(usedKeys).sort();

  it("au moins 45 clés demo.* distinctes sont utilisées dans le code", () => {
    expect(keys.length).toBeGreaterThanOrEqual(45);
  });

  it.each(keys)("clé '%s' existe en français", (key) => {
    expect(getByPath(frCommon, key), `clé manquante dans fr/common.json: ${key}`).toBeTypeOf("string");
  });

  it.each(keys)("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enCommon, key), `clé manquante dans en/common.json: ${key}`).toBeTypeOf("string");
  });
});
