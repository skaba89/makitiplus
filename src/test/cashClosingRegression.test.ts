import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260727150000_create_cash_register_sessions.sql"
);
const sql = fs.readFileSync(migrationPath, "utf-8");

const stripComments = (s: string) =>
  s.split("\n").map((line) => (line.trimStart().startsWith("--") ? "" : line.split("--", 1)[0])).join("\n");
const code = stripComments(sql);

describe("Régression sécurité — cash_register_sessions (P6 du plan)", () => {
  it("ne modifie jamais la table sales (ni UPDATE ni DELETE)", () => {
    expect(code).not.toMatch(/UPDATE\s+public\.sales\b/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+public\.sales\b/i);
  });

  it("ne modifie jamais la table expenses (ni UPDATE ni DELETE)", () => {
    expect(code).not.toMatch(/UPDATE\s+public\.expenses\b/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+public\.expenses\b/i);
  });

  it("ne contient aucun TRUNCATE ni DROP TABLE destructif", () => {
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/DROP\s+TABLE\s+(?!IF\s+NOT)/i);
  });

  it("n'utilise CREATE TABLE qu'avec IF NOT EXISTS (idempotent, jamais destructif au replay)", () => {
    const createTableMatches = code.match(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi);
    expect(createTableMatches).toBeNull();
  });

  it("toutes les fonctions sont SECURITY DEFINER avec SET search_path (pas d'injection de search_path)", () => {
    const functionBlocks = code.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g) ?? [];
    expect(functionBlocks.length).toBeGreaterThanOrEqual(6); // 5 RPC + 1 trigger
    for (const block of functionBlocks) {
      const isTrigger = /RETURNS TRIGGER/i.test(block);
      if (isTrigger) continue; // le trigger updated_at n'a pas besoin d'être SECURITY DEFINER
      expect(block).toMatch(/SECURITY DEFINER/i);
      expect(block).toMatch(/SET search_path TO 'public'/i);
    }
  });

  it("aucun GRANT INSERT/UPDATE/DELETE brut sur la table pour authenticated (écriture RPC uniquement)", () => {
    expect(code).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE)[\s\S]{0,80}ON\s+public\.cash_register_sessions[\s\S]{0,40}TO\s+authenticated/i);
    expect(code).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.cash_register_sessions\s+FROM\s+authenticated/i);
  });

  it("RLS est activée ET forcée sur la table", () => {
    expect(code).toMatch(/ALTER TABLE public\.cash_register_sessions ENABLE ROW LEVEL SECURITY/i);
    expect(code).toMatch(/ALTER TABLE public\.cash_register_sessions FORCE ROW LEVEL SECURITY/i);
  });

  it("une contrainte UNIQUE empêche plusieurs sessions ouvertes par vendeur+magasin", () => {
    expect(code).toMatch(/CREATE UNIQUE INDEX[\s\S]*?uniq_open_cash_session_per_user_store/i);
  });

  it("la policy SELECT filtre par organisation (pas de fuite cross-tenant)", () => {
    expect(code).toMatch(/organization_id = public\.get_user_organization_id\(\)/);
  });

  it("close_cash_register_session refuse de clôturer une session déjà fermée", () => {
    expect(code).toMatch(/status NOT IN \('open'\)[\s\S]*?RAISE EXCEPTION/);
  });

  it("close_cash_register_session vérifie que l'appelant est le propriétaire de la session ou un manager/admin", () => {
    expect(code).toMatch(/opened_by\s*<>\s*auth\.uid\(\)\s+AND\s+NOT\s*\(/);
  });

  it("approve_cash_register_session est réservé admin/manager (jamais vendeur/comptable)", () => {
    expect(code).toMatch(
      /Seul un manager ou un admin peut approuver[\s\S]*?RAISE EXCEPTION|NOT \(public\.has_role\(auth\.uid\(\), 'admin'::app_role\) OR public\.has_role\(auth\.uid\(\), 'manager'::app_role\)\) THEN\s*\n\s*RAISE EXCEPTION 'Seul un manager ou un admin/
    );
  });

  it("get_cash_register_sessions limite les résultats (pas de scan illimité)", () => {
    expect(code).toMatch(/LIMIT\s+\d+/);
  });
});
