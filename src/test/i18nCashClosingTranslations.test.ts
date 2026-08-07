import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frCashClosing from "@/i18n/locales/fr/cashClosing.json";
import enCashClosing from "@/i18n/locales/en/cashClosing.json";

/**
 * i18n Phase 2 (docs/production/I18N_MIGRATION_PLAN.md) — CashClosing.tsx,
 * septième incrément (le plus critique -- voir P0.5 de l'audit 2026-08-01).
 *
 * TRADUCTION UNIQUEMENT : ce commit n'a touché aucune logique métier, aucun
 * appel RPC, aucun calcul financier. Toutes les mutations continuent
 * d'appeler exactement les mêmes RPC avec les mêmes paramètres (vérifié
 * ci-dessous). Le fix de sécurité super_admin/RLS du 2026-08-01 (PR #59,
 * `roleByUserId.get(p.user_id)` sans fallback "vendeur") est également
 * vérifié intact.
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
const cashClosingSrc = readNormalized(path.join(process.cwd(), "src/pages/CashClosing.tsx"));

describe("Non-régression P0.5 — aucune logique métier touchée par la traduction", () => {
  it("les 6 RPC critiques sont toujours appelées avec les mêmes noms", () => {
    for (const rpc of [
      "get_cash_register_sessions",
      "get_cash_closing_summary",
      "open_cash_register_session",
      "close_cash_register_session",
      "approve_cash_register_session",
      "reject_cash_register_session",
    ]) {
      expect(cashClosingSrc).toMatch(new RegExp(`rpc\\(["']${rpc}["']`));
    }
  });

  it("le filtre Vendeur exclut toujours explicitement les rôles hors admin/manager/vendeur (fix PR #59 intact)", () => {
    expect(cashClosingSrc).toMatch(/role === "admin" \|\| role === "manager" \|\| role === "vendeur"/);
    expect(cashClosingSrc).not.toMatch(/roleByUserId\.get\([^)]*\)\s*\?\?\s*["']vendeur["']/);
  });

  it("les RPC de clôture ne sont jamais appelées avec des paramètres modifiés (p_session_id, p_actual_cash, p_manager_notes, p_rejection_reason préservés)", () => {
    expect(cashClosingSrc).toMatch(/p_session_id:\s*mySession\.id/);
    expect(cashClosingSrc).toMatch(/p_actual_cash:\s*parseFloat\(actualCash\)/);
    expect(cashClosingSrc).toMatch(/p_manager_notes:\s*managerNotesBySession\[sessionId\]/);
    expect(cashClosingSrc).toMatch(/p_rejection_reason:\s*reason/);
  });
});

describe("i18n Phase 2 — clés t()/i18nKey de CashClosing.tsx résolues en fr et en", () => {
  // counting.offlineWarning est appelée sans suffixe -- i18next résout
  // _one/_other lui-même via {count}. Vérifiée séparément ci-dessous.
  const PLURALIZED_KEYS = new Set(["counting.offlineWarning"]);
  const literalKeys = Array.from(
    cashClosingSrc.matchAll(/\bt\(["'`]([a-zA-Z0-9_.]+)["'`]/g)
  ).map((m) => m[1]).filter((k) => !PLURALIZED_KEYS.has(k));
  const transKeys = Array.from(
    cashClosingSrc.matchAll(/i18nKey="([a-zA-Z0-9_.]+)"/g)
  ).map((m) => m[1]);
  // getPaymentLabel(m) construit dynamiquement "paymentLabels.${method}" --
  // vérifié séparément ci-dessous via les 8 méthodes connues.
  const usedKeys = [...literalKeys, ...transKeys];

  it("au moins 50 clés littérales sont utilisées (page volumineuse et critique)", () => {
    expect(literalKeys.length).toBeGreaterThan(50);
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frCashClosing, key), `clé manquante dans fr/cashClosing.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(usedKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enCashClosing, key), `clé manquante dans en/cashClosing.json: ${key}`).not.toBeUndefined();
  });

  it("les 8 méthodes de paiement ont un libellé dans paymentLabels (fr et en)", () => {
    for (const method of ["cash", "wave", "orange_money", "mtn_money", "moov_money", "mpesa", "card", "credit"]) {
      expect(getByPath(frCashClosing, `paymentLabels.${method}`)).toBeTypeOf("string");
      expect(getByPath(enCashClosing, `paymentLabels.${method}`)).toBeTypeOf("string");
    }
  });

  it("getPaymentLabel construit bien la clé à partir du namespace cashClosing (pas reports)", () => {
    expect(cashClosingSrc).toMatch(/const getPaymentLabel = \(method: string\) => t\(`paymentLabels\.\$\{method\}`\);/);
  });
});

describe("i18n Phase 2 — ressources fr/cashClosing.json et en/cashClosing.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frCashClosing).sort();
    const enKeys = flattenKeys(enCashClosing).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frCashClosing],
      ["en", enCashClosing],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("les clés d'interpolation ({{...}}) sont identiques entre fr et en pour chaque paire de clés", () => {
    const extractVars = (s: string) => Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]).sort();
    for (const key of flattenKeys(frCashClosing)) {
      const frValue = getByPath(frCashClosing, key);
      const enValue = getByPath(enCashClosing, key);
      if (typeof frValue === "string" && typeof enValue === "string") {
        expect(extractVars(enValue), `variables d'interpolation différentes pour ${key}`).toEqual(extractVars(frValue));
      }
    }
  });

  it("les clés de pluralisation offlineWarning (_one/_other) existent dans les deux langues", () => {
    expect(getByPath(frCashClosing, "counting.offlineWarning_one")).toBeTypeOf("string");
    expect(getByPath(frCashClosing, "counting.offlineWarning_other")).toBeTypeOf("string");
    expect(getByPath(enCashClosing, "counting.offlineWarning_one")).toBeTypeOf("string");
    expect(getByPath(enCashClosing, "counting.offlineWarning_other")).toBeTypeOf("string");
  });
});

describe("i18n Phase 2 — CashClosing.tsx", () => {
  it("utilise useTranslation('cashClosing')", () => {
    expect(cashClosingSrc).toMatch(/const \{ t \} = useTranslation\("cashClosing"\);/);
  });

  it("n'a plus de littéral français codé en dur dans le JSX visible", () => {
    const hardcodedText = cashClosingSrc.match(/>[^<{\n]*[À-ÿ][^<{\n]*</g) ?? [];
    expect(hardcodedText).toEqual([]);
  });

  it("les en-têtes du CSV exporté sont traduits sans changer la structure des colonnes (9 colonnes)", () => {
    const headerRow = cashClosingSrc.match(/\[t\("csvExport\.seller"\)[\s\S]*?t\("csvExport\.notes"\)\]/)?.[0] ?? "";
    const columnCount = (headerRow.match(/t\("csvExport\./g) ?? []).length;
    expect(columnCount).toBe(9);
  });

  it("le reçu imprimé (handlePrint) et le message WhatsApp restent générés dynamiquement via t(), sans casser la structure HTML/template", () => {
    expect(cashClosingSrc).toMatch(/<title>\$\{t\("print\.title"\)\}<\/title>/);
    expect(cashClosingSrc).toMatch(/t\("whatsapp\.titleLine", \{ business: profile\?\.business_name \|\| "" \}\)/);
  });
});
