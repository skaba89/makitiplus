/**
 * Tests pour la migration consolidée finale
 * Valide que 20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql contient
 * tous les éléments critiques sans SQL destructif.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const migrationName = "20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql";
const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  migrationName
);

const sql = fs.existsSync(migrationPath)
  ? fs.readFileSync(migrationPath, "utf-8")
  : "";

describe("Final Consolidated Migration", () => {
  it("la migration existe", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it.skipIf(!sql)("ajoute products.description", () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+description\s+TEXT/i);
  });

  it.skipIf(!sql)("ajoute products.expiry_date", () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+expiry_date\s+DATE/i);
  });

  it.skipIf(!sql)("ajoute products.is_active", () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+is_active\s+BOOLEAN/i);
  });

  it.skipIf(!sql)("cast p_payment_method::public.payment_method", () => {
    expect(sql).toMatch(/p_payment_method::public\.payment_method/);
  });

  it.skipIf(!sql)("accepte p_store_id UUID DEFAULT NULL", () => {
    expect(sql).toMatch(/p_store_id\s+UUID\s+DEFAULT\s+NULL/i);
  });

  it.skipIf(!sql)("vérifie stores.organization_id", () => {
    expect(sql).toMatch(/organization_id\s*=\s*p_organization_id/i);
  });

  it.skipIf(!sql)("insère sales.store_id", () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+sales\s*\([^)]*store_id/mi);
  });

  it.skipIf(!sql)("insère sale_items.organization_id", () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+sale_items\s*\([^)]*organization_id/mi);
  });

  it.skipIf(!sql)("insère sale_items.store_id", () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+sale_items\s*\([^)]*store_id[^)]*\)/mi);
  });

  it.skipIf(!sql)("ne contient pas DELETE FROM auth.users", () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+auth\.users/i);
  });

  it.skipIf(!sql)("ne contient pas TRUNCATE", () => {
    expect(sql).not.toMatch(/TRUNCATE/i);
  });

  it.skipIf(!sql)("ne contient pas DROP SCHEMA", () => {
    expect(sql).not.toMatch(/DROP\s+SCHEMA/i);
  });
});
