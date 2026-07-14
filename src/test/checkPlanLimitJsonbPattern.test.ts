/**
 * Test de non-régression : le pattern SQL cassé
 *   SELECT allowed INTO v_limit_ok FROM public.check_plan_limit(...) LIMIT 1;
 * ne doit PLUS JAMAIS apparaître dans la DERNIÈRE version de chaque fonction.
 *
 * Bug historique : 2026-07-12 — "column "allowed" does not exist" sur
 * create_product, create_sale_with_limit, create_first_organization.
 *
 * Le pattern correct est :
 *   v_plan_check := public.check_plan_limit('xxx');
 *   v_limit_ok := COALESCE((v_plan_check->>'allowed')::boolean, false);
 *
 * Note : les anciennes migrations peuvent encore contenir le pattern cassé,
 * mais elles sont surchargées par les migrations plus récentes qui corrigent.
 * Ce test valide que la DERNIÈRE définition de chaque fonction utilise le
 * pattern JSONB correct.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function getAllMigrations(): { name: string; content: string }[] {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  return fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        !f.includes("_combined_") &&
        !f.includes("_deploy_combined") &&
        !f.includes("_combined_remaining")
    )
    .sort()
    .map((name) => ({
      name,
      content: fs.readFileSync(path.join(dir, name), "utf-8"),
    }));
}

function getLatestFunctionDef(
  migrations: { name: string; content: string }[],
  functionName: string
): { name: string; content: string } | null {
  let latest: { name: string; content: string } | null = null;
  const pattern = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${functionName}\\s*\\(`,
    "i"
  );
  for (const m of migrations) {
    if (pattern.test(m.content)) {
      latest = m; // On prend la dernière (les migrations sont triées par nom)
    }
  }
  return latest;
}

function extractFunctionBody(content: string, functionName: string): string {
  // Extrait le corps de la fonction (entre AS $$ et $$;)
  const pattern = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${functionName}\\s*\\([^)]*\\)[^$]*AS\\s*\\$\\$(.*?)\\$\\$`,
    "is"
  );
  const m = content.match(pattern);
  return m ? m[1] : "";
}

describe("Régression : pattern check_plan_limit JSONB cassé", () => {
  it("La migration 20260712160000 corrige create_product avec ->>'allowed'", () => {
    const fixMigration = getAllMigrations().find(
      (m) => m.name === "20260712160000_fix_check_plan_limit_jsonb_pattern.sql"
    );
    expect(fixMigration).toBeDefined();

    const content = fixMigration!.content;
    expect(content).toMatch(/v_plan_check\s*:=\s*public\.check_plan_limit/);
    expect(content).toMatch(/\(v_plan_check->>'allowed'\)::boolean/);
    expect(content).toMatch(/COALESCE\(\(v_plan_check->>'allowed'\)::boolean,\s*false\)/);
  });

  it("create_product : la DERNIÈRE version utilise le pattern JSONB", () => {
    const allMigrations = getAllMigrations();
    const latest = getLatestFunctionDef(allMigrations, "create_product");

    expect(latest).not.toBeNull();
    // La dernière version peut être dans la migration consolidée (20260712180000)
    // ou dans la migration individuelle (20260712160000)
    const validNames = [
      "20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql",
      "20260712140000_consolidate_create_product.sql",
      "20260712160000_fix_check_plan_limit_jsonb_pattern.sql",
    ];
    expect(validNames).toContain(latest!.name);

    const body = extractFunctionBody(latest!.content, "create_product");
    expect(body.length).toBeGreaterThan(0);

    // Le pattern cassé NE doit PAS être dans la dernière version
    const brokenPattern = /SELECT\s+allowed\s+INTO\s+[^;]*FROM\s+public\.check_plan_limit/i;
    expect(brokenPattern.test(body)).toBe(false);

    // Le pattern correct DOIT être dans la dernière version
    expect(body).toMatch(/v_plan_check\s*:=\s*public\.check_plan_limit\('products'\)/);
    expect(body).toMatch(/\(v_plan_check->>'allowed'\)::boolean/);
  });

  it("create_sale_with_limit : la DERNIÈRE version utilise le pattern JSONB", () => {
    const allMigrations = getAllMigrations();
    const latest = getLatestFunctionDef(allMigrations, "create_sale_with_limit");

    expect(latest).not.toBeNull();
    const validNames = [
      "20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql",
      "20260712195000_harden_sales_store_scope.sql",
      "20260712190000_fix_payment_method_enum_cast.sql",
      "20260712180000_CONSOLIDATED_all_critical_fixes.sql",
      "20260712160000_fix_check_plan_limit_jsonb_pattern.sql",
    ];
    expect(validNames).toContain(latest!.name);

    const body = extractFunctionBody(latest!.content, "create_sale_with_limit");
    expect(body.length).toBeGreaterThan(0);

    const brokenPattern = /SELECT\s+allowed\s+INTO\s+[^;]*FROM\s+public\.check_plan_limit/i;
    expect(brokenPattern.test(body)).toBe(false);

    expect(body).toMatch(/check_plan_limit\('sales_this_month'\)/);
    expect(body).toMatch(/\(v_plan_check->>'allowed'\)::boolean/);
  });

  it("create_first_organization : la DERNIÈRE version utilise le pattern JSONB", () => {
    const allMigrations = getAllMigrations();
    const latest = getLatestFunctionDef(allMigrations, "create_first_organization");

    expect(latest).not.toBeNull();
    const validNames = [
      "20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql",
      "20260713120000_fix_create_first_organization_conflict.sql",
      "20260712180000_CONSOLIDATED_all_critical_fixes.sql",
      "20260712160000_fix_check_plan_limit_jsonb_pattern.sql",
    ];
    expect(validNames).toContain(latest!.name);

    const body = extractFunctionBody(latest!.content, "create_first_organization");
    expect(body.length).toBeGreaterThan(0);

    const brokenPattern = /SELECT\s+allowed\s+INTO\s+[^;]*FROM\s+public\.check_plan_limit/i;
    expect(brokenPattern.test(body)).toBe(false);

    // La version 20260713120000 n'utilise pas check_plan_limit dans le path
    // "new org" (uniquement dans le path "adding store"). On vérifie donc
    // seulement que le pattern cassé n'est PAS présent.
    if (body.includes("check_plan_limit")) {
      expect(body).toMatch(/\(v_plan_check->>'allowed'\)::boolean/);
    }
  });

  it("Aucune nouvelle migration après 20260712180000 ne réintroduit le pattern cassé", () => {
    // Ce test empêche une régression future : toute migration future
    // qui contiendrait le pattern cassé échouerait.
    const allMigrations = getAllMigrations();
    const fixMigrationIndex = allMigrations.findIndex(
      (m) => m.name === "20260712180000_CONSOLIDATED_all_critical_fixes.sql"
    );
    expect(fixMigrationIndex).toBeGreaterThan(-1);

    const brokenPattern = /SELECT\s+allowed\s+INTO\s+[^;]*FROM\s+public\.check_plan_limit/i;
    const offenders: string[] = [];

    for (let i = fixMigrationIndex + 1; i < allMigrations.length; i++) {
      const { name, content } = allMigrations[i];
      const lines = content.split("\n");
      for (let j = 0; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim().startsWith("--")) continue;
        if (brokenPattern.test(line)) {
          offenders.push(`${name}:${j + 1}: ${line.trim()}`);
        }
      }
    }

    if (offenders.length > 0) {
      console.error("❌ Pattern cassé réintroduit après le fix :", offenders);
    }
    expect(offenders).toHaveLength(0);
  });

  it("create_full_sale : la DERNIÈRE version contient le cast ::payment_method", () => {
    // Bug 2026-07-12 : "column 'payment_method' is of type payment_method
    // but expression is of type text" — la colonne est un enum PostgreSQL
    // et la RPC passait une valeur TEXT sans cast explicite.
    const allMigrations = getAllMigrations();
    const latest = getLatestFunctionDef(allMigrations, "create_full_sale");

    expect(latest).not.toBeNull();
    // La dernière version peut être dans harden_sales_store_scope (20260712195000)
    // ou dans fix_payment_method_enum_cast (20260712190000)
    const validNames = [
      "20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql",
      "20260712195000_harden_sales_store_scope.sql",
      "20260712190000_fix_payment_method_enum_cast.sql",
    ];
    expect(validNames).toContain(latest!.name);

    const body = extractFunctionBody(latest!.content, "create_full_sale");
    expect(body.length).toBeGreaterThan(0);

    // Le cast explicite ::payment_method doit être présent
    expect(body).toMatch(/::public\.payment_method|::payment_method/);
  });
});
