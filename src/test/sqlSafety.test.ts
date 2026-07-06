import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf-8");

const stripLineComments = (sql: string) =>
  sql
    .split("\n")
    .map((line) => {
      const stripped = line.trimStart();
      if (stripped.startsWith("--")) return "";
      return line.split("--", 1)[0];
    })
    .join("\n");

const migrationEntries = migrationFiles.map((file) => ({
  file,
  sql: read(path.join("supabase", "migrations", file)),
}));

const allMigrations = migrationEntries.map(({ sql }) => sql).join("\n");
const combinedDeploy = read("supabase/migrations/_deploy_combined.sql");

const rowRemoval = "DELETE" + "\\s+" + "FROM" + "\\s+";
const publicSchema = "public" + "\\.";
const authSchema = "auth" + "\\.";

const destructivePatterns: Array<[string, RegExp]> = [
  ["profiles organization detach", new RegExp("UPDATE\\s+" + publicSchema + "profiles\\s+SET\\s+organization_id\\s*=\\s*NULL\\s*;", "i")],
  ["categories organization detach", new RegExp("UPDATE\\s+" + publicSchema + "categories\\s+SET\\s+organization_id\\s*=\\s*NULL\\s*;", "i")],
  ["global sales removal", new RegExp(rowRemoval + publicSchema + "sales\\s*;", "i")],
  ["global products removal", new RegExp(rowRemoval + publicSchema + "products\\s*;", "i")],
  ["global customers removal", new RegExp(rowRemoval + publicSchema + "customers\\s*;", "i")],
  ["global organizations removal", new RegExp(rowRemoval + publicSchema + "organizations\\s*;", "i")],
  ["global stores removal", new RegExp(rowRemoval + publicSchema + "stores\\s*;", "i")],
  ["auth users mutation", new RegExp(rowRemoval + authSchema + "users\\b", "i")],
  ["truncate", /\bTRUNCATE\b/i],
  ["drop schema", /\bDROP\s+SCHEMA\b/i],
];

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "build", "test"].includes(entry.name)) return [];
      return listSourceFiles(fullPath);
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

function findSourceContaining(token: string): string {
  const srcDir = path.join(root, "src");
  const files = listSourceFiles(srcDir);
  const found = files.find((file) => fs.readFileSync(file, "utf-8").includes(token));
  expect(found, `Expected to find a source file containing ${token}`).toBeTruthy();
  return found as string;
}

describe("SQL safety: production migrations", () => {
  it.each(migrationEntries)("$file has no global destructive SQL", ({ sql }) => {
    const cleaned = stripLineComments(sql);
    for (const [label, pattern] of destructivePatterns) {
      expect(cleaned, label).not.toMatch(pattern);
    }
  });

  it.each(migrationEntries)("$file scopes every row-removal statement with WHERE", ({ sql }) => {
    const cleaned = stripLineComments(sql);
    const statementPattern = new RegExp(rowRemoval + "((?:public|auth)\\.\\w+)\\b[\\s\\S]*?;", "gi");
    const statements = Array.from(cleaned.matchAll(statementPattern)).map((match) => match[0]);
    for (const statement of statements) {
      expect(statement).toMatch(/\bWHERE\b/i);
    }
  });

  it("_deploy_combined.sql does not include the removed cleanup migration content", () => {
    expect(combinedDeploy).not.toContain("20260706090000_cleanup_final.sql");
    for (const [label, pattern] of destructivePatterns) {
      expect(stripLineComments(combinedDeploy), label).not.toMatch(pattern);
    }
  });
});

describe("Billing security: unsafe subscription RPC", () => {
  it("does not recreate or grant the unsafe tenant self-upgrade RPC", () => {
    const cleaned = stripLineComments(allMigrations);
    expect(cleaned).not.toMatch(new RegExp("CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+" + publicSchema + "update_organization_subscription\\s*\\(\\s*TEXT\\s*,\\s*TEXT\\s*,\\s*TEXT\\s*\\)", "i"));
    expect(cleaned).not.toMatch(new RegExp("GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+" + publicSchema + "update_organization_subscription\\s*\\([^)]*\\)\\s+TO\\s+authenticated", "i"));
  });

  it("Billing.tsx only calls the secured admin subscription RPC", () => {
    const billing = read("src/pages/Billing.tsx");
    expect(billing).toContain("admin_update_organization_subscription");
    expect(billing).not.toMatch(/\.rpc\(\s*["']update_organization_subscription["']/);
  });

  it("OrganizationManagement.tsx only calls the secured admin subscription RPC", () => {
    const orgManagement = read("src/pages/OrganizationManagement.tsx");
    expect(orgManagement).toContain("admin_update_organization_subscription");
    expect(orgManagement).not.toMatch(/\.rpc\(\s*["']update_organization_subscription["']/);
  });

  it("PlanLimitGuard bypass is limited to super_admin", () => {
    const planLimitGuardPath = findSourceContaining("PlanLimitGuard");
    const source = fs.readFileSync(planLimitGuardPath, "utf-8");
    expect(source).toContain('userRole === "super_admin"');
    expect(source).not.toMatch(/userRole\s*===\s*["']admin["'].*return\s+children/s);
  });

  it("FeatureGate bypass is limited to super_admin", () => {
    const featureGatePath = findSourceContaining("FeatureGate");
    const source = fs.readFileSync(featureGatePath, "utf-8");
    expect(source).toContain('userRole === "super_admin"');
    expect(source).not.toMatch(/userRole\s*===\s*["']admin["'].*return\s+children/s);
  });
});

describe("OrganizationManagement deletion and status UX", () => {
  const source = read("src/pages/OrganizationManagement.tsx");

  it("requires exact organization-name confirmation before delete", () => {
    expect(source).toContain("deleteConfirmText");
    expect(source).toContain("canConfirmDelete");
    expect(source).toContain("organization_name.trim()");
    expect(source).toContain("disabled={deleting || !canConfirmDelete}");
  });

  it("does not expose a fake editable subscription status field", () => {
    expect(source).not.toContain("Nouveau statut");
    expect(source).not.toContain("selectedStatus");
    expect(source).toContain("statut actif");
  });

  it("calls delete_organization only from the strong confirmation path", () => {
    expect(source).toContain('supabase.rpc("delete_organization"');
    expect(source).toMatch(/if \(!orgToDelete \|\| !canConfirmDelete\) return;/);
  });
});

describe("POS/offline non-regression", () => {
  it("ProductAutocomplete imports and uses offline product search", () => {
    const autocomplete = read("src/components/pos/ProductAutocomplete.tsx");
    expect(autocomplete).toMatch(/import[\s\S]*useOfflineProductSearch[\s\S]*from[\s\S]*useProductSearch/);
    expect(autocomplete).toContain("useOfflineProductSearch(");
  });

  it("offline sale queues create_sale_with_limit and blocks demo sales", () => {
    const offlineSale = read("src/hooks/useOfflineSale.ts");
    expect(offlineSale).toContain("blockMutation");
    expect(offlineSale).toMatch(/enqueueRPCMutation[\s\S]*create_sale_with_limit/);
  });

  it("offline queue allows create_sale_with_limit and decrements local stock", () => {
    const offlineQueue = read("src/lib/offlineQueue.ts");
    expect(offlineQueue).toContain("create_sale_with_limit");
    expect(offlineQueue).toContain("decrementLocalStock");
    expect(offlineQueue).toContain("IndexedDB");
  });
});
