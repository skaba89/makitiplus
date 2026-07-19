import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf-8");

// Lire le RPC corrigé
const rpcFile = "supabase/migrations/20260719130000_product_kpis_fix_rownumber.sql";
const rpcSql = read(rpcFile);

// Vérifier si une migration ajoute sale_items.cost_price
const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations"));
const costPriceMigrationExists = migrationFiles.some((f) => {
  if (!f.endsWith(".sql")) return false;
  const content = read(`supabase/migrations/${f}`);
  return content.includes("sale_items") && content.includes("ADD COLUMN") && content.includes("cost_price");
});

describe("P0.4 — Non-régression SQL KPI produits", () => {
  it("1. le SQL ne contient pas ROW_NUMBER() directement dans WHERE", () => {
    // Vérifier qu'il n'y a pas "WHERE.*ROW_NUMBER"
    const lines = rpcSql.split("\n");
    const whereWithRowNumber = lines.find((line) => {
      const trimmed = line.trim().toUpperCase();
      return trimmed.startsWith("WHERE") && trimmed.includes("ROW_NUMBER()");
    });
    expect(whereWithRowNumber).toBeUndefined();
  });

  it("2. le SQL contient un CTE ranked_products", () => {
    expect(rpcSql).toMatch(/ranked_products\s+AS\s*\(/i);
  });

  it("3. le SQL contient p_organization_id UUID DEFAULT NULL", () => {
    expect(rpcSql).toMatch(/p_organization_id\s+UUID\s+DEFAULT\s+NULL/i);
  });

  it("4. le SQL contient v_org_id := p_organization_id", () => {
    expect(rpcSql).toMatch(/v_org_id\s*:=\s*p_organization_id/i);
  });

  it("5. le SQL ne contient pas COALESCE(p_organization_id, get_user_organization_id)", () => {
    expect(rpcSql).not.toMatch(/COALESCE\s*\(\s*p_organization_id\s*,\s*public\.get_user_organization_id/i);
  });

  it("6. si si.cost_price est utilisé, alors une migration ajoute sale_items.cost_price", () => {
    const usesCostPrice = rpcSql.includes("cost_price");
    if (usesCostPrice) {
      expect(costPriceMigrationExists).toBe(true);
    }
  });

  it("7. le SQL contient top_rank <= 5 (ou rank_top <= 5)", () => {
    expect(rpcSql).toMatch(/rank_top\s*<=\s*5/i);
  });

  it("8. le SQL contient bad_rank <= 5 (ou rank_bad <= 5)", () => {
    expect(rpcSql).toMatch(/rank_bad\s*<=\s*5/i);
  });

  it("9. le SQL documente que NULL = toutes les organisations", () => {
    // Vérifier qu'il y a un commentaire mentionnant NULL = toutes
    const hasComment = rpcSql.match(/NULL\s*=?\s*toutes\s*les\s*org/i) || 
                       rpcSql.match(/--.*NULL.*toutes/i);
    expect(hasComment).not.toBeNull();
  });

  it("10. aucune migration destructive n'est introduite (pas de TRUNCATE/DROP SCHEMA)", () => {
    const destructivePatterns = ["TRUNCATE", "DROP SCHEMA", "DROP TABLE public.products", "DROP TABLE public.sales"];
    for (const pattern of destructivePatterns) {
      expect(rpcSql).not.toContain(pattern);
    }
  });
});
