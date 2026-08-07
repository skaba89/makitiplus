import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frBilling from "@/i18n/locales/fr/billing.json";
import enBilling from "@/i18n/locales/en/billing.json";

/**
 * i18n Phase 2 (docs/production/I18N_MIGRATION_PLAN.md) — Billing.tsx,
 * huitième et dernier incrément de la Phase 2. TRADUCTION UNIQUEMENT :
 * aucune logique métier, aucun appel RPC (change_subscription_plan,
 * extend_subscription) et aucun calcul de prix n'a été modifié. Seule
 * exception documentée : la description "abonnement prolongé" utilise
 * désormais t(`durationOptions.${duration}`) au lieu d'un ternaire codé en
 * dur — le texte français produit est strictement identique (refactor à
 * sortie inchangée), voir les tests de non-régression ci-dessous.
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
const billingSrc = readNormalized(path.join(process.cwd(), "src/pages/Billing.tsx"));

describe("Non-régression — aucune logique métier/RPC touchée par la traduction", () => {
  it("le RPC unique de gestion manuelle d'abonnement est toujours appelé avec le même nom (changement de plan et extension)", () => {
    const rpcCalls = billingSrc.match(/\.rpc\(["']admin_update_organization_subscription["']/g) ?? [];
    expect(rpcCalls.length).toBe(2);
  });

  it("les paramètres RPC de changement de plan restent inchangés", () => {
    expect(billingSrc).toMatch(/p_organization_id:\s*orgIdToUse,\s*\n\s*p_plan_id:\s*selectedPlan,\s*\n\s*p_duration:\s*selectedDuration/);
  });

  it("le duration technique brut (selectedDuration) reste passé tel quel dans le toast de changement de plan (pas de traduction)", () => {
    expect(billingSrc).toMatch(
      /description:\s*t\("toasts\.planUpdatedDescription",\s*\{\s*org:\s*targetOrgName,\s*plan:\s*planLabel,\s*duration:\s*selectedDuration,\s*eventType:\s*eventLabel\s*\}\)/
    );
  });

  it("l'extension d'abonnement utilise désormais le libellé traduit de la durée (refactor à sortie inchangée)", () => {
    expect(billingSrc).toMatch(/duration:\s*t\(`durationOptions\.\$\{duration\}`,\s*\{\s*defaultValue:\s*duration\s*\}\)/);
  });
});

describe("i18n Phase 2 — clés t() littérales de Billing.tsx résolues en fr et en", () => {
  // Ces clés sont construites dynamiquement (jamais passées littéralement à
  // t()) — vérifiées séparément ci-dessous plutôt que via le scan générique.
  const DYNAMIC_KEY_PREFIXES = ["statusLabels.", "durationOptions."];
  // superAdmin.storeCount est pluralisé (_one/_other résolus via {count})
  // et n'existe donc pas en tant que clé littérale dans le JSON.
  const PLURALIZED_KEYS = new Set(["superAdmin.storeCount"]);

  const literalKeys = Array.from(
    billingSrc.matchAll(/\bt\(["'`]([a-zA-Z0-9_.]+)["'`]/g)
  )
    .map((m) => m[1])
    .filter((k) => !DYNAMIC_KEY_PREFIXES.some((prefix) => k.startsWith(prefix)))
    .filter((k) => !PLURALIZED_KEYS.has(k));

  it("au moins 60 clés littérales sont utilisées (page volumineuse Stripe/super_admin)", () => {
    expect(literalKeys.length).toBeGreaterThan(60);
  });

  it.each(Array.from(new Set(literalKeys)))("clé '%s' existe en français", (key) => {
    expect(getByPath(frBilling, key), `clé manquante dans fr/billing.json: ${key}`).not.toBeUndefined();
  });

  it.each(Array.from(new Set(literalKeys)))("clé '%s' existe en anglais", (key) => {
    expect(getByPath(enBilling, key), `clé manquante dans en/billing.json: ${key}`).not.toBeUndefined();
  });

  it("les 8 statuts d'abonnement ont un libellé dans statusLabels (fr et en)", () => {
    for (const status of ["active", "trialing", "past_due", "grace_period", "read_only", "cancelled", "expired", "noActivePlan"]) {
      expect(getByPath(frBilling, `statusLabels.${status}`)).toBeTypeOf("string");
      expect(getByPath(enBilling, `statusLabels.${status}`)).toBeTypeOf("string");
    }
  });

  it("les 4 durées ont un libellé dans durationOptions (fr et en)", () => {
    for (const duration of ["1_month", "3_months", "6_months", "1_year"]) {
      expect(getByPath(frBilling, `durationOptions.${duration}`)).toBeTypeOf("string");
      expect(getByPath(enBilling, `durationOptions.${duration}`)).toBeTypeOf("string");
    }
  });

  it("getStatusLabel/DURATION_OPTIONS construisent bien leurs clés à partir du namespace billing", () => {
    expect(billingSrc).toMatch(/const getStatusLabel = \(status: string\) => t\(`statusLabels\.\$\{status\}`, \{ defaultValue: status \}\);/);
    expect(billingSrc).toMatch(/const DURATION_OPTIONS = DURATION_VALUES\.map\(\(value\) => \(\{ value, label: t\(`durationOptions\.\$\{value\}`\) \}\)\);/);
  });
});

describe("i18n Phase 2 — ressources fr/billing.json et en/billing.json alignées", () => {
  it("ont exactement les mêmes clés (pas de dérive de traduction)", () => {
    const frKeys = flattenKeys(frBilling).sort();
    const enKeys = flattenKeys(enBilling).sort();
    expect(enKeys).toEqual(frKeys);
  });

  it("aucune clé n'a de valeur vide", () => {
    for (const [locale, resource] of [
      ["fr", frBilling],
      ["en", enBilling],
    ] as const) {
      for (const key of flattenKeys(resource)) {
        expect(getByPath(resource, key), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("les clés d'interpolation ({{...}}) sont identiques entre fr et en pour chaque paire de clés", () => {
    const extractVars = (s: string) => Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]).sort();
    for (const key of flattenKeys(frBilling)) {
      const frValue = getByPath(frBilling, key);
      const enValue = getByPath(enBilling, key);
      if (typeof frValue === "string" && typeof enValue === "string") {
        expect(extractVars(enValue), `variables d'interpolation différentes pour ${key}`).toEqual(extractVars(frValue));
      }
    }
  });

  it("les clés de pluralisation storeCount (_one/_other) existent dans les deux langues", () => {
    expect(getByPath(frBilling, "superAdmin.storeCount_one")).toBeTypeOf("string");
    expect(getByPath(frBilling, "superAdmin.storeCount_other")).toBeTypeOf("string");
    expect(getByPath(enBilling, "superAdmin.storeCount_one")).toBeTypeOf("string");
    expect(getByPath(enBilling, "superAdmin.storeCount_other")).toBeTypeOf("string");
  });
});

describe("i18n Phase 2 — Billing.tsx", () => {
  it("utilise useTranslation('billing') dans le composant principal et dans UsageBar", () => {
    const matches = billingSrc.match(/const \{ t \} = useTranslation\("billing"\);/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("n'a plus de littéral français codé en dur dans le JSX visible", () => {
    const hardcodedText = billingSrc.match(/>[^<{\n]*[À-ÿ][^<{\n]*</g) ?? [];
    expect(hardcodedText).toEqual([]);
  });

  it("PlanFeatureRow reçoit ses labels déjà traduits via t(), pas de chaîne française codée en dur", () => {
    expect(billingSrc).not.toMatch(/<PlanFeatureRow label="[^{][^"]*[À-ÿ]/);
  });
});
