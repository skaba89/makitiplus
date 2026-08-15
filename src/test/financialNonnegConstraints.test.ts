import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Audit fonctionnel/métier + code du 2026-08-14. Seule products.stock_quantity
 * avait une contrainte CHECK en base parmi les tables financières
 * (products_stock_quantity_nonneg, migration 20260719100000) -- sales,
 * sale_items, expenses n'avaient aucun garde-fou au niveau base contre un
 * montant ou une quantité négative, la validation reposant entièrement sur
 * le code applicatif (client + RPC), sans filet de sécurité en cas de bug
 * futur ou d'appel RPC direct malformé.
 *
 * Vérifié en lecture seule avant application (0 ligne existante ne
 * violait ces contraintes), puis testé en transaction BEGIN/ROLLBACK
 * contre les vraies données Diallo & Frères (contrainte + rejet d'un
 * INSERT négatif confirmés), puis appliqué pour de vrai via
 * `supabase db query --linked`. Documenté dans le commit, non
 * reproductible ici sans connexion DB -- ce test vérifie le contenu
 * statique de la migration.
 */

const migrationSql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260814010000_add_financial_nonneg_constraints.sql"),
  "utf-8"
);

describe("Migration financial-nonneg-constraints — contraintes CHECK ajoutées", () => {
  const expectedConstraints: { table: string; name: string; def: RegExp }[] = [
    { table: "sales", name: "sales_total_amount_nonneg", def: /CHECK \(total_amount >= 0\)/ },
    { table: "sales", name: "sales_subtotal_nonneg", def: /CHECK \(subtotal >= 0\)/ },
    { table: "sales", name: "sales_amount_paid_nonneg", def: /CHECK \(amount_paid >= 0\)/ },
    { table: "sales", name: "sales_discount_amount_nonneg", def: /CHECK \(discount_amount IS NULL OR discount_amount >= 0\)/ },
    { table: "sales", name: "sales_change_amount_nonneg", def: /CHECK \(change_amount IS NULL OR change_amount >= 0\)/ },
    { table: "sales", name: "sales_tax_amount_nonneg", def: /CHECK \(tax_amount IS NULL OR tax_amount >= 0\)/ },
    { table: "sale_items", name: "sale_items_quantity_positive", def: /CHECK \(quantity > 0\)/ },
    { table: "sale_items", name: "sale_items_unit_price_nonneg", def: /CHECK \(unit_price >= 0\)/ },
    { table: "sale_items", name: "sale_items_total_price_nonneg", def: /CHECK \(total_price >= 0\)/ },
    { table: "sale_items", name: "sale_items_cost_price_nonneg", def: /CHECK \(cost_price IS NULL OR cost_price >= 0\)/ },
    { table: "expenses", name: "expenses_amount_positive", def: /CHECK \(amount > 0\)/ },
    { table: "products", name: "products_price_nonneg", def: /CHECK \(price >= 0\)/ },
    { table: "products", name: "products_cost_price_nonneg", def: /CHECK \(cost_price IS NULL OR cost_price >= 0\)/ },
  ];

  it.each(expectedConstraints)("$name existe sur $table avec la bonne définition", ({ name, def }) => {
    const block = migrationSql.match(new RegExp(`ALTER TABLE public\\.\\w+ ADD CONSTRAINT ${name}[\\s\\S]{0,80}`))?.[0] ?? "";
    expect(block, `contrainte ${name} introuvable`).not.toBe("");
    expect(block).toMatch(def);
  });

  it("chaque contrainte est ajoutée de façon idempotente (vérifiée avant ajout, jamais un simple ADD CONSTRAINT nu)", () => {
    for (const { name } of expectedConstraints) {
      const guardBlock = migrationSql.match(
        new RegExp(`IF NOT EXISTS \\([\\s\\S]{0,150}constraint_name = '${name}'[\\s\\S]{0,200}ADD CONSTRAINT ${name}`)
      );
      expect(guardBlock, `${name} n'est pas protégée par une vérification d'existence`).not.toBeNull();
    }
  });

  it("total_amount et amount_paid restent >= 0 (pas > 0) : une vente 100% remisée ou une vente à crédit (amount_paid = 0) doivent rester valides", () => {
    // Cohérence avec le fix PR #74 (plafond de remise à 100%) : une remise
    // de 100% produit légitimement total_amount = 0. Une vente à crédit
    // envoie explicitement amount_paid: 0 (POSPaymentDialog.tsx). Ni l'un
    // ni l'autre ne doit être rejeté par ces contraintes.
    expect(migrationSql).toMatch(/CHECK \(total_amount >= 0\)/);
    expect(migrationSql).toMatch(/CHECK \(amount_paid >= 0\)/);
    expect(migrationSql).not.toMatch(/CHECK \(total_amount > 0\)/);
    expect(migrationSql).not.toMatch(/CHECK \(amount_paid > 0\)/);
  });

  it("ne contient aucune instruction destructive, et documente la vérification préalable en lecture seule", () => {
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migrationSql).not.toMatch(/DROP\s+TABLE/i);
    expect(migrationSql).toMatch(/0 ligne pour chaque cas/);
  });
});
