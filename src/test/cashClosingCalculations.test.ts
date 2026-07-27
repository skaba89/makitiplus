import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Vérifie (par analyse statique du SQL) que les formules de calcul de la
 * clôture de caisse sont correctes. Tout le calcul se fait côté serveur
 * (RPC SECURITY DEFINER) -- il n'y a pas de logique de calcul équivalente
 * côté client à tester unitairement, donc ce test lit directement la
 * migration plutôt que du code TypeScript.
 */

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260727150000_create_cash_register_sessions.sql"
);
const sql = fs.readFileSync(migrationPath, "utf-8");

describe("Formules de calcul — cash_register_sessions", () => {
  it("le fichier de migration existe et est lisible", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("expected_cash = opening_cash + cash_sales - cash_expenses", () => {
    expect(sql).toMatch(/expected_cash['"]?,\s*v_session\.opening_cash\s*\+\s*COALESCE\(\(v_sales->>'cash_sales'\)::numeric,\s*0\)\s*-\s*v_expenses_cash/);
  });

  it("cash_difference = actual_cash - expected_cash", () => {
    expect(sql).toMatch(/cash_difference\s*=\s*p_actual_cash\s*-\s*v_expected/);
  });

  it("le montant réel en caisse ne peut pas être négatif (validation serveur)", () => {
    expect(sql).toMatch(/p_actual_cash\s*<\s*0\s*THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it("le fond de caisse initial ne peut pas être négatif (validation serveur)", () => {
    expect(sql).toMatch(/p_opening_cash\s*<\s*0\s*THEN[\s\S]*?RAISE EXCEPTION/);
  });

  it("les ventes sont filtrées sur la plage horaire de la session (opened_at -> closed_at/now)", () => {
    expect(sql).toMatch(/created_at\s*>=\s*v_session\.opened_at/);
    expect(sql).toMatch(/created_at\s*<=\s*v_period_end/);
  });

  it("les 8 moyens de paiement réels (payment_method) sont tous agrégés", () => {
    for (const method of ["cash", "wave", "orange_money", "mtn_money", "moov_money", "mpesa", "card", "credit"]) {
      expect(sql).toMatch(new RegExp(`payment_method = '${method}'`));
    }
  });

  it("les produits vendus sont comptés depuis sale_items.quantity, pas depuis sales", () => {
    expect(sql).toMatch(/SUM\(si\.quantity\)\s*FROM\s+public\.sale_items\s+si/i);
  });
});
