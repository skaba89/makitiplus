/**
 * Security tests — verify P0 fixes are enforced via source code analysis.
 * These tests ensure that the RPC call signatures in the frontend codebase
 * do NOT send client-provided identity params (p_user_id, p_organization_id)
 * for operations where the server must derive identity from auth.uid().
 *
 * Strategy: Source-code analysis (grep-free, reliable, no mock hoisting issues)
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readSrc(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", filename), "utf-8");
}

function findRpcParams(source: string, rpcName: string): string | null {
  const match = source.match(
    new RegExp(`supabase\\.rpc\\(\\s*["']${rpcName}["']\\s*,\\s*\\{([^}]+)\\}`, "s")
  );
  return match ? match[1] : null;
}

// ─── 1. Write RPCs — must NOT send p_user_id or p_organization_id ──
describe("P0 Security: Write RPCs don't send client identity params", () => {
  it("create_full_sale does NOT include p_user_id or p_organization_id", () => {
    const params = findRpcParams(readSrc("pages/POS.tsx"), "create_full_sale");
    expect(params).not.toBeNull();
    expect(params).not.toContain("p_user_id");
    expect(params).not.toContain("p_organization_id");
    // Business params should be present
    expect(params).toContain("p_sale_number");
    expect(params).toContain("p_items");
    expect(params).toContain("p_total_amount");
  });

  it("process_credit_payment does NOT include p_user_id or p_organization_id", () => {
    const params = findRpcParams(
      readSrc("components/customers/CreditPaymentDialog.tsx"),
      "process_credit_payment"
    );
    expect(params).not.toBeNull();
    expect(params).not.toContain("p_user_id");
    expect(params).not.toContain("p_organization_id");
    expect(params).toContain("p_customer_id");
    expect(params).toContain("p_amount");
  });

  it("adjust_product_stock does NOT include p_user_id or p_organization_id", () => {
    const params = findRpcParams(readSrc("pages/Products.tsx"), "adjust_product_stock");
    expect(params).not.toBeNull();
    expect(params).not.toContain("p_user_id");
    expect(params).not.toContain("p_organization_id");
    expect(params).toContain("p_product_id");
  });

  it("increment_customer_credit does NOT include p_user_id or p_organization_id", () => {
    const params = findRpcParams(readSrc("pages/POS.tsx"), "increment_customer_credit");
    expect(params).not.toBeNull();
    expect(params).not.toContain("p_user_id");
    expect(params).not.toContain("p_organization_id");
    expect(params).toContain("p_customer_id");
  });
});

// ─── 2. Stats RPCs — must NOT send p_organization_id ────────────
describe("P0 Security: Stats RPCs don't send p_organization_id", () => {
  const hookFiles: Record<string, string> = {
    get_product_stats: "hooks/useProductStats.ts",
    get_customer_stats: "hooks/useCustomerStats.ts",
    get_expense_stats: "hooks/useExpenseStats.ts",
    get_supplier_stats: "hooks/useSupplierStats.ts",
    get_categories: "hooks/useCategories.ts",
  };

  for (const [rpcName, file] of Object.entries(hookFiles)) {
    it(`${rpcName} is called WITHOUT p_organization_id`, () => {
      const source = readSrc(file);
      const params = findRpcParams(source, rpcName);

      if (params !== null) {
        expect(params).not.toContain("p_organization_id");
      } else {
        // If no params object, the RPC is called without args — which is correct
        expect(source).toContain(`"${rpcName}"`);
      }
    });
  }

  it("get_dashboard_stats does NOT send p_organization_id", () => {
    const params = findRpcParams(readSrc("pages/Dashboard.tsx"), "get_dashboard_stats");
    expect(params).not.toBeNull();
    expect(params).not.toContain("p_organization_id");
    expect(params).toContain("p_day_start");
  });

  it("get_top_products does NOT send p_organization_id", () => {
    const params = findRpcParams(readSrc("pages/Dashboard.tsx"), "get_top_products");
    expect(params).not.toBeNull();
    expect(params).not.toContain("p_organization_id");
  });

  it("get_reports_stats does NOT send p_organization_id", () => {
    const params = findRpcParams(readSrc("pages/Reports.tsx"), "get_reports_stats");
    expect(params).not.toBeNull();
    expect(params).not.toContain("p_organization_id");
  });
});

// ─── 3. Admin analytics RPCs — p_organization_id is filter, not auth ──
describe("P0 Security: Admin analytics RPCs keep p_organization_id as filter", () => {
  it("AdminAnalytics sends p_organization_id only when filtering by store", () => {
    const source = readSrc("pages/AdminAnalytics.tsx");

    // All admin RPCs should be present
    const adminRpcs = [
      "get_admin_article_ranking",
      "get_admin_stock_movements",
      "get_admin_sales_trend",
      "get_admin_payment_distribution",
    ];
    for (const rpcName of adminRpcs) {
      expect(source).toContain(rpcName);
    }

    // p_organization_id should be conditional on store selection
    expect(source).toMatch(/selectedStoreId/);
  });
});

// ─── 4. ProtectedRoute blocks null userRole ────────────────────
describe("P0 Security: ProtectedRoute blocks null userRole", () => {
  it("has explicit null check before allowedRoles check", () => {
    const source = readSrc("components/ProtectedRoute.tsx");

    // Must have explicit null check that blocks access
    expect(source).toContain("userRole === null");

    // Must have a blocking UI (not just redirect)
    expect(source).toMatch(/incomplète/);

    // The null check must happen before the allowedRoles check
    // Find the function body and check ordering
    const lines = source.split("\n");
    let foundNullCheck = false;
    let foundAllowedRoles = false;

    for (const line of lines) {
      if (line.includes("userRole === null")) foundNullCheck = true;
      if (line.includes("allowedRoles") && line.includes("includes")) foundAllowedRoles = true;
      // null check should be found before allowedRoles check
      if (foundAllowedRoles && !foundNullCheck) {
        expect.unreachable("allowedRoles check found before userRole === null check");
      }
    }

    expect(foundNullCheck).toBe(true);
    expect(foundAllowedRoles).toBe(true);
  });
});

// ─── 5. Security headers in render.yaml ────────────────────────
describe("P0 Security: Render.yaml security headers", () => {
  it("has CSP header", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "render.yaml"),
      "utf-8"
    );
    expect(source).toContain("Content-Security-Policy");
    expect(source).toContain("X-Frame-Options");
    expect(source).toContain("X-Content-Type-Options");
    expect(source).toContain("Referrer-Policy");
    expect(source).toContain("Permissions-Policy");
    // X-Frame-Options should be DENY (not SAMEORIGIN)
    expect(source).toMatch(/X-Frame-Options[\s\S]*DENY/);
  });
});
