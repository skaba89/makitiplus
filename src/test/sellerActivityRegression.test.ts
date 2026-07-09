/**
 * Tests de non-régression — Activité Vendeurs + Diagnostic
 * Référence: production-stabilization-no-regression
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const APP_TSX = readFileSync(join(process.cwd(), "src/App.tsx"), "utf-8");
const DASHBOARD_LAYOUT = readFileSync(
  join(process.cwd(), "src/components/dashboard/DashboardLayout.tsx"),
  "utf-8"
);
const MOBILE_NAV = readFileSync(
  join(process.cwd(), "src/components/dashboard/MobileBottomNav.tsx"),
  "utf-8"
);
const SELLER_ACTIVITY = readFileSync(
  join(process.cwd(), "src/pages/SellerActivity.tsx"),
  "utf-8"
);
const DIAGNOSTIC = readFileSync(
  join(process.cwd(), "src/pages/Diagnostic.tsx"),
  "utf-8"
);
const MIGRATION_SQL = readFileSync(
  join(process.cwd(), "supabase/migrations/20260709010000_fix_seller_activity_production.sql"),
  "utf-8"
);

describe("Seller Activity regression — route/menu roles", () => {
  it("App.tsx protects /dashboard/seller-activity with MANAGEMENT_ROLES", () => {
    // Find the seller-activity route block and check it uses MANAGEMENT_ROLES
    const routeMatch = APP_TSX.match(
      /path="\/dashboard\/seller-activity"[\s\S]*?allowedRoles=\{(\w+)\}/
    );
    expect(routeMatch).toBeTruthy();
    expect(routeMatch![1]).toBe("MANAGEMENT_ROLES");
  });

  it("DashboardLayout.tsx shows 'Activité Vendeurs' with MANAGEMENT_ROLES", () => {
    const itemMatch = DASHBOARD_LAYOUT.match(
      /name:\s*"Activité Vendeurs"[\s\S]*?roles:\s*(\w+)/
    );
    expect(itemMatch).toBeTruthy();
    expect(itemMatch![1]).toBe("MANAGEMENT_ROLES");
  });

  it("MobileBottomNav.tsx contains 'Activité Vendeurs' with MANAGEMENT_ROLES", () => {
    const itemMatch = MOBILE_NAV.match(
      /name:\s*"Activité Vendeurs"[\s\S]*?roles:\s*(\w+)/
    );
    expect(itemMatch).toBeTruthy();
    expect(itemMatch![1]).toBe("MANAGEMENT_ROLES");
  });
});

describe("Seller Activity RPC migration — casts and roles", () => {
  it("migration contains ur.role::TEXT cast", () => {
    expect(MIGRATION_SQL).toContain("ur.role::TEXT");
  });

  it("migration contains ual.action::TEXT cast", () => {
    expect(MIGRATION_SQL).toContain("ual.action::TEXT");
  });

  it("migration allows manager role via has_role", () => {
    expect(MIGRATION_SQL).toContain("public.has_role(auth.uid(), 'manager')");
  });
});

describe("SellerActivity.tsx — loading/error handling", () => {
  it("uses activitiesLoading", () => {
    expect(SELLER_ACTIVITY).toContain("activitiesLoading");
  });

  it("uses activitiesError", () => {
    expect(SELLER_ACTIVITY).toContain("activitiesError");
  });

  it("does not contain old [data] normalization pattern", () => {
    expect(SELLER_ACTIVITY).not.toContain("Array.isArray(data) ? data :");
  });
});

describe("Diagnostic.tsx — no hardcoded project ref", () => {
  it("does not contain exxntkuursgwhxvehekr", () => {
    expect(DIAGNOSTIC).not.toContain("exxntkuursgwhxvehekr");
  });

  it("uses VITE_SUPABASE_DASHBOARD_URL env var", () => {
    expect(DIAGNOSTIC).toContain("VITE_SUPABASE_DASHBOARD_URL");
  });
});
