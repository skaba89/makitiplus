import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * public.plans.pilot_national a tous ses has_X = TRUE, mais
 * check_feature_access() consulte feature_flags.allowed_plans (une table
 * séparée) qui ne contenait 'pilot_national' pour aucune fonctionnalité --
 * un organisme mis sur ce plan se serait vu refuser tout ce que le plan est
 * censé accorder. Trouvé lors de l'audit stratégique (docs/production/
 * STRATEGIC_AUDIT_AFRICA_WORLD_LEADER.md, section 3.5), corrigé par une
 * migration additive et idempotente. Aucune organisation réelle n'était sur
 * ce plan au moment du fix (vérifié en lecture seule) -- impact préventif,
 * pas correctif d'un incident vécu.
 */

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260731010000_add_pilot_national_to_feature_flags.sql"
);
const sql = fs.readFileSync(migrationPath, "utf-8");

describe("Migration pilot_national → feature_flags.allowed_plans", () => {
  it("le fichier existe et cible feature_flags", () => {
    expect(sql).toMatch(/UPDATE public\.feature_flags/);
  });

  it("ajoute 'pilot_national' via array_append (additif, pas de réécriture du tableau)", () => {
    expect(sql).toMatch(/array_append\(allowed_plans,\s*'pilot_national'\)/);
  });

  it("est idempotent : ne touche que les lignes où pilot_national est absent", () => {
    expect(sql).toMatch(/WHERE NOT \('pilot_national' = ANY\(allowed_plans\)\)/);
  });

  it("ne modifie aucune autre table que feature_flags", () => {
    const updateStatements = sql.match(/UPDATE\s+public\.\w+/g) ?? [];
    for (const stmt of updateStatements) {
      expect(stmt).toBe("UPDATE public.feature_flags");
    }
  });

  it("ne contient aucune instruction destructive", () => {
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });
});
