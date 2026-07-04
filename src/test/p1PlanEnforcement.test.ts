/**
 * P1 Regression Tests — Server-side plan enforcement + SQL migration integrity
 *
 * Tests:
 * 1. create_sale_with_limit has same signature as create_full_sale
 * 2. All plan enforcement RPCs exist and have correct GRANT EXECUTE
 * 3. SQL migrations have no anti-patterns (profile_roles, CREATE OR REPLACE POLICY)
 * 4. stripe_events table exists with idempotency primary key
 * 5. Frontend POS uses create_sale_with_limit (not create_full_sale)
 * 6. Frontend Products uses create_product RPC
 * 7. Frontend Stores uses create_store RPC
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readSrc(filepath: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", filepath), "utf-8");
}

function readMigration(filepath: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", filepath),
    "utf-8"
  );
}

function getAllMigrations(): string[] {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.includes("_combined_") && !f.includes("p0_hotfix"))
    .sort();
}

// ─── 1. create_sale_with_limit signature ──────────────────────────
describe("P1 Fix: create_sale_with_limit matches create_full_sale signature", () => {
  it("create_sale_with_limit accepts p_sale_number, p_subtotal, p_total_amount, p_items", () => {
    const sql = readMigration("20260703040000_p1_sale_limit_grant_stripe_idempotency.sql");

    // Should have the same params as create_full_sale
    expect(sql).toContain("p_sale_number TEXT");
    expect(sql).toContain("p_subtotal NUMERIC");
    expect(sql).toContain("p_total_amount NUMERIC");
    expect(sql).toContain("p_items JSONB");
    expect(sql).toContain("p_tax_amount NUMERIC");
    expect(sql).toContain("p_payment_method TEXT");
    expect(sql).toContain("p_amount_paid NUMERIC");
    expect(sql).toContain("p_change_amount NUMERIC");
    expect(sql).toContain("p_customer_name TEXT");
    expect(sql).toContain("p_customer_phone TEXT");
    expect(sql).toContain("p_seller_name TEXT");
  });

  it("create_sale_with_limit delegates to create_full_sale with all params", () => {
    const sql = readMigration("20260703040000_p1_sale_limit_grant_stripe_idempotency.sql");

    // Should call create_full_sale with all the params
    expect(sql).toMatch(/create_full_sale\s*\(\s*p_sale_number/);
    expect(sql).toContain("p_sale_number");
    expect(sql).toContain("p_seller_name");
  });

  it("create_sale_with_limit calls check_plan_limit before delegation", () => {
    const sql = readMigration("20260703040000_p1_sale_limit_grant_stripe_idempotency.sql");

    // Should check plan limit for sales_this_month
    expect(sql).toContain("check_plan_limit('sales_this_month')");
    expect(sql).toContain("Limite de ventes mensuelles");
  });

  it("old create_sale_with_limit with wrong signature is dropped", () => {
    const sql = readMigration("20260703040000_p1_sale_limit_grant_stripe_idempotency.sql");

    // Should drop the old function with wrong signature
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.create_sale_with_limit(JSONB, TEXT, UUID, NUMERIC, UUID, TEXT)");
  });
});

// ─── 2. Plan enforcement RPCs have GRANT EXECUTE ──────────────────
describe("P1 Fix: Plan enforcement RPCs have GRANT EXECUTE", () => {
  const enforcementSql = readMigration("20260703020000_p1_server_side_plan_enforcement.sql");
  const fixesSql = readMigration("20260703040000_p1_sale_limit_grant_stripe_idempotency.sql");
  const allSql = enforcementSql + fixesSql;

  it("create_product has GRANT EXECUTE", () => {
    expect(allSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_product/);
  });

  it("create_store has GRANT EXECUTE", () => {
    expect(allSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_store/);
  });

  it("invite_user has GRANT EXECUTE", () => {
    expect(allSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.invite_user/);
  });

  it("create_sale_with_limit has GRANT EXECUTE", () => {
    expect(allSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_sale_with_limit/);
  });
});

// ─── 3. SQL migrations have no anti-patterns ──────────────────────
describe("P1 Fix: SQL migrations integrity", () => {
  it("no migration uses CREATE OR REPLACE POLICY", () => {
    const migrations = getAllMigrations();
    const violations: string[] = [];

    for (const file of migrations) {
      const content = readMigration(file);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("--")) continue;
        if (/CREATE\s+OR\s+REPLACE\s+POLICY/i.test(line)) {
          violations.push(`${file}:${i + 1}: ${line}`);
        }
      }
    }

    expect(violations).toHaveLength(0);
  });

  it("no migration references profile_roles table", () => {
    const migrations = getAllMigrations();
    const violations: string[] = [];

    for (const file of migrations) {
      const content = readMigration(file);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("--")) continue;
        if (/\bprofile_roles\b/.test(line)) {
          violations.push(`${file}:${i + 1}: ${line}`);
        }
      }
    }

    expect(violations).toHaveLength(0);
  });

  it("no migration uses movement_type in INSERT INTO stock_movements", () => {
    const migrations = getAllMigrations();
    const violations: string[] = [];

    for (const file of migrations) {
      const content = readMigration(file);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("--")) continue;
        if (/INSERT\s+INTO\s+public\.stock_movements\s*\([^)]*movement_type/i.test(line)) {
          violations.push(`${file}:${i + 1}: ${line}`);
        }
      }
    }

    expect(violations).toHaveLength(0);
  });

  it("no migration uses low_stock_threshold", () => {
    const migrations = getAllMigrations();
    const violations: string[] = [];

    for (const file of migrations) {
      const content = readMigration(file);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("--")) continue;
        if (/\blow_stock_threshold\b/.test(line)) {
          violations.push(`${file}:${i + 1}: ${line}`);
        }
      }
    }

    expect(violations).toHaveLength(0);
  });
});

// ─── 4. Stripe webhook idempotency table ──────────────────────────
describe("P1 Fix: Stripe webhook idempotency", () => {
  it("stripe_events table has event_id as primary key", () => {
    const sql = readMigration("20260703040000_p1_sale_limit_grant_stripe_idempotency.sql");

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.stripe_events/);
    expect(sql).toContain("event_id TEXT PRIMARY KEY");
  });

  it("stripe_events has event_type column for filtering", () => {
    const sql = readMigration("20260703040000_p1_sale_limit_grant_stripe_idempotency.sql");

    expect(sql).toContain("event_type TEXT NOT NULL");
  });

  it("stripe_events has RLS enabled", () => {
    const sql = readMigration("20260703040000_p1_sale_limit_grant_stripe_idempotency.sql");

    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("stripe_events has index on processed_at for auto-purge", () => {
    const sql = readMigration("20260703040000_p1_sale_limit_grant_stripe_idempotency.sql");

    expect(sql).toMatch(/idx_stripe_events_processed_at/);
  });
});

// ─── 5. Frontend uses create_sale_with_limit ──────────────────────
describe("P1 Fix: Frontend POS uses create_sale_with_limit", () => {
  it("POS.tsx calls create_sale_with_limit RPC, not create_full_sale directly", () => {
    const source = readSrc("pages/POS.tsx");

    expect(source).toMatch(/supabase\.rpc\(["']create_sale_with_limit["']/);
    // Should NOT call create_full_sale directly from frontend anymore
    expect(source).not.toMatch(/supabase\.rpc\(["']create_full_sale["']/);
  });

  it("POS.tsx has plan limit error detection", () => {
    const source = readSrc("pages/POS.tsx");

    // Should detect plan limit errors and show specific message
    expect(source).toMatch(/isPlanLimit/);
    expect(source).toMatch(/Limite.*atteinte|Upgradez/);
  });
});

// ─── 6. Frontend Products uses create_product RPC ─────────────────
describe("P1 Fix: Frontend Products uses create_product RPC", () => {
  it("Products.tsx calls create_product RPC", () => {
    const source = readSrc("pages/Products.tsx");

    expect(source).toMatch(/supabase\.rpc\(["']create_product["']/);
  });

  it("Products.tsx has plan limit error detection", () => {
    const source = readSrc("pages/Products.tsx");

    expect(source).toMatch(/isPlanLimit/);
  });
});

// ─── 7. Frontend Stores uses create_store RPC ─────────────────────
describe("P1 Fix: Frontend Stores uses create_store RPC", () => {
  it("Stores.tsx calls create_store RPC", () => {
    const source = readSrc("pages/Stores.tsx");

    expect(source).toMatch(/supabase\.rpc\(["']create_store["']/);
  });
});
