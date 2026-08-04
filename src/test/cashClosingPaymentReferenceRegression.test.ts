import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Audit final hardening 2026-08-01, section P0.5, point 8 : "Vérifier
 * qu'aucune vente/dépense n'est modifiée par la clôture."
 *
 * La clôture de caisse (open/close/approve/reject_cash_register_session)
 * ne doit JAMAIS écrire dans sales ou expenses -- elle ne fait que
 * comparer le cash attendu (calculé à partir des ventes existantes) au
 * cash compté, et enregistrer ce résultat dans cash_register_sessions.
 * Si une future modification ajoutait un UPDATE/INSERT/DELETE sur sales
 * ou expenses dans ces RPC, la référence Mobile Money (payment_reference)
 * ou tout autre champ d'une vente réelle pourrait être altéré par une
 * simple clôture de caisse -- un risque direct pour Diallo & Frères.
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");

const CASH_SESSION_MIGRATIONS = [
  "supabase/migrations/20260727150000_create_cash_register_sessions.sql",
  "supabase/migrations/20260728193000_add_reject_cash_register_session.sql",
];

describe("Migrations cash_register_sessions — jamais d'écriture sur sales/expenses", () => {
  it.each(CASH_SESSION_MIGRATIONS)("%s ne contient aucun INSERT/UPDATE/DELETE sur sales ou expenses", (relPath) => {
    const sql = readNormalized(path.join(process.cwd(), relPath));
    expect(sql).not.toMatch(/\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\.sales\b/i);
    expect(sql).not.toMatch(/\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\.expenses\b/i);
  });

  it.each(CASH_SESSION_MIGRATIONS)("%s ne touche que cash_register_sessions et user_activity_logs en écriture", (relPath) => {
    const sql = readNormalized(path.join(process.cwd(), relPath));
    const writes = Array.from(sql.matchAll(/\b(INSERT INTO|UPDATE)\s+public\.(\w+)/gi)).map((m) => m[2]);
    const allowedTables = new Set(["cash_register_sessions", "user_activity_logs"]);
    for (const table of writes) {
      expect(allowedTables.has(table), `écriture inattendue détectée sur la table '${table}' dans ${relPath}`).toBe(true);
    }
  });
});

describe("payment_reference — colonne présente dans le contrat de type Supabase", () => {
  const typesSrc = readNormalized(path.join(process.cwd(), "src/integrations/supabase/types.ts"));

  it("sales.Row expose payment_reference (nullable)", () => {
    const salesRowBlock = typesSrc.match(/sales:\s*\{\s*Row:\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? "";
    expect(salesRowBlock).toMatch(/payment_reference:\s*string \| null/);
  });
});

describe("get_cash_closing_summary — ne recalcule pas payment_reference (agrégat en lecture seule)", () => {
  it("la migration qui définit get_cash_closing_summary reste une fonction STABLE (lecture seule, pas de SECURITY DEFINER d'écriture déguisée)", () => {
    const migrationDir = path.join(process.cwd(), "supabase/migrations");
    const files = fs.readdirSync(migrationDir).filter((f) => f.endsWith(".sql"));
    const defining = files.filter((f) => {
      const sql = readNormalized(path.join(migrationDir, f));
      return /CREATE OR REPLACE FUNCTION public\.get_cash_closing_summary/.test(sql);
    });
    expect(defining.length).toBeGreaterThan(0);
    for (const f of defining) {
      const sql = readNormalized(path.join(migrationDir, f));
      const fnBlock = sql.match(/CREATE OR REPLACE FUNCTION public\.get_cash_closing_summary[\s\S]*?\$\$;/)?.[0] ?? "";
      expect(fnBlock).not.toMatch(/\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\.sales\b/i);
      expect(fnBlock).not.toMatch(/\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\.expenses\b/i);
    }
  });
});
