import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frCashClosing from "@/i18n/locales/fr/cashClosing.json";

/**
 * P0.1/P0.2 du plan cash-closing-final-hardening : une session de caisse doit
 * toujours être liée à un magasin explicite en multi-magasin, et les dépenses
 * agrégées dans le résumé de clôture doivent être filtrées par ce magasin.
 * Vérifié par analyse statique du frontend + de la migration SQL.
 */

const root = process.cwd();
const cashClosingTsx = fs.readFileSync(path.join(root, "src/pages/CashClosing.tsx"), "utf-8");
const migrationPath = path.join(root, "supabase/migrations/20260728190000_fix_cash_closing_expense_store_scope.sql");
const migrationSql = fs.readFileSync(migrationPath, "utf-8");

describe("Store scope — session liée au magasin courant (P0.1)", () => {
  it("open_cash_register_session est appelée avec p_store_id: currentStore.id (pas undefined en dur)", () => {
    expect(cashClosingTsx).toMatch(/p_store_id:\s*currentStore\?\.id/);
    expect(cashClosingTsx).not.toMatch(/p_store_id:\s*undefined,\s*\n\s*p_opening_cash/);
  });

  it("l'ouverture est bloquée si l'organisation a des magasins mais qu'aucun n'est sélectionné", () => {
    expect(cashClosingTsx).toMatch(/stores\.length > 0 && !currentStore\?\.id/);
    // i18n Phase 2 : le message est désormais dans fr/cashClosing.json
    // (openSession.mustSelectStoreError) plutôt que codé en dur ici.
    expect(cashClosingTsx).toMatch(/throw new Error\(t\("openSession\.mustSelectStoreError"\)\)/);
    expect(frCashClosing.openSession.mustSelectStoreError).toMatch(/Sélectionnez un magasin avant d'ouvrir la caisse/);
  });

  it("ne bloque pas les organisations mono-magasin (stores.length === 0, ex. Diallo & Frères)", () => {
    // Le garde-fou ne doit JAMAIS être un simple `!currentStore?.id` seul,
    // ce qui bloquerait indéfiniment une organisation sans ligne dans `stores`.
    expect(cashClosingTsx).not.toMatch(/if \(!currentStore\?\.id\) \{\s*\n\s*throw new Error\("Sélectionnez/);
  });

  it("useStore et useOnlineStatus sont importés (contexts existants, pas de nouvelle dépendance)", () => {
    expect(cashClosingTsx).toMatch(/from "@\/contexts\/StoreContext"/);
    expect(cashClosingTsx).toMatch(/from "@\/contexts\/OfflineContext"/);
  });
});

describe("Store scope — dépenses filtrées par magasin dans get_cash_closing_summary (P0.2)", () => {
  it("la migration de correction existe et cible get_cash_closing_summary", () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_closing_summary/);
  });

  it("la requête des dépenses filtre désormais par store_id (comme qualifying_sales)", () => {
    const expensesQueryMatch = migrationSql.match(
      /FROM public\.expenses\s+WHERE organization_id = v_session\.organization_id\s+AND \(v_session\.store_id IS NULL OR store_id = v_session\.store_id\)/
    );
    expect(expensesQueryMatch).not.toBeNull();
  });

  it("ne modifie jamais les tables sales ou expenses (lecture seule)", () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.expenses\b/i);
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+public\.expenses\b/i);
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.sales\b/i);
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+public\.sales\b/i);
  });

  it("n'utilise aucune instruction destructive (TRUNCATE, DROP non gardé)", () => {
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/DROP\s+TABLE\s+(?!IF\s+NOT)/i);
  });

  it("la fonction reste SECURITY DEFINER avec search_path fixé", () => {
    expect(migrationSql).toMatch(/SECURITY DEFINER/);
    expect(migrationSql).toMatch(/SET search_path TO 'public'/);
  });

  it("expected_cash = opening_cash + cash_sales - cash_expenses (formule inchangée)", () => {
    expect(migrationSql).toMatch(
      /expected_cash['"]?,\s*v_session\.opening_cash\s*\+\s*COALESCE\(\(v_sales->>'cash_sales'\)::numeric,\s*0\)\s*-\s*v_expenses_cash/
    );
  });
});
