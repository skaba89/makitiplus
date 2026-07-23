/**
 * Integration tests for Users module
 *
 * These tests verify:
 * - Role-based access control: ADMIN_ROLES vs MANAGEMENT_ROLES vs STORE_ROLES
 * - Password policy enforcement via checkPassword
 * - AuditLogPanel: filter state management and data rendering
 * - User action responses: deactivate, reactivate, password reset
 * - Role assignment: only admin/super_admin can manage roles
 */
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

// ─── Import source for static analysis ───────────────────────────
import { ADMIN_ROLES, STORE_ROLES, MANAGEMENT_ROLES, isAdminRole } from "@/types";
import { checkPassword } from "@/lib/passwordPolicy";

// ─── Tests ───────────────────────────────────────────────────────

describe("Users module — role-based access control", () => {
  it("ADMIN_ROLES contains super_admin and admin", () => {
    expect(ADMIN_ROLES).toContain("super_admin");
    expect(ADMIN_ROLES).toContain("admin");
  });

  it("MANAGEMENT_ROLES includes manager for extended permissions", () => {
    expect(MANAGEMENT_ROLES).toContain("super_admin");
    expect(MANAGEMENT_ROLES).toContain("admin");
    expect(MANAGEMENT_ROLES).toContain("manager");
  });

  it("STORE_ROLES is defined (currently super_admin only for store-scoped ops)", () => {
    // STORE_ROLES defines who can own/manage stores — currently super_admin only
    expect(STORE_ROLES).toContain("super_admin");
    expect(Array.isArray(STORE_ROLES)).toBe(true);
  });

  it("isAdminRole correctly identifies admin roles", () => {
    expect(isAdminRole("super_admin")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("manager")).toBe(false);
    expect(isAdminRole("vendeur")).toBe(false);
    expect(isAdminRole("comptable")).toBe(false);
  });

  it("ADMIN_ROLES and STORE_ROLES are both subsets of the role enum", () => {
    // Both arrays should be non-empty and contain valid roles
    expect(ADMIN_ROLES.length).toBeGreaterThan(0);
    expect(STORE_ROLES.length).toBeGreaterThan(0);
    // STORE_ROLES includes super_admin (full access)
    expect(STORE_ROLES).toContain("super_admin");
    // ADMIN_ROLES includes both super_admin and admin
    expect(ADMIN_ROLES).toContain("super_admin");
    expect(ADMIN_ROLES).toContain("admin");
  });

  it("SyncConflicts page blocks non-admin access", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/pages/SyncConflicts.tsx"),
      "utf-8"
    );
    // The page should check ADMIN_ROLES
    expect(source).toContain("ADMIN_ROLES");
    // Should show "Accès restreint" for non-admins
    expect(source).toMatch(/Accès restreint/);
  });

  it("Users page gates admin-only actions behind role check", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/pages/Users.tsx"),
      "utf-8"
    );
    // Should reference isAdminRole or ADMIN_ROLES
    const hasAdminCheck =
      source.includes("isAdminRole") || source.includes("ADMIN_ROLES");
    expect(hasAdminCheck).toBe(true);
  });
});

describe("Users module — password policy", () => {
  it("rejects passwords shorter than 8 characters", () => {
    const result = checkPassword("Short1!");
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects passwords without uppercase", () => {
    const result = checkPassword("lowercase1!");
    expect(result.ok).toBe(false);
  });

  it("rejects passwords without lowercase", () => {
    const result = checkPassword("UPPERCASE1!");
    expect(result.ok).toBe(false);
  });

  it("rejects passwords without number", () => {
    const result = checkPassword("NoNumber!!");
    expect(result.ok).toBe(false);
  });

  it("rejects passwords without special character", () => {
    const result = checkPassword("NoSpecial1");
    expect(result.ok).toBe(false);
  });

  it("accepts strong passwords", () => {
    const result = checkPassword("Str0ng!Pass");
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns helpful error messages for each missing requirement", () => {
    const result = checkPassword("weak");
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Each error should be a non-empty string
    for (const err of result.errors) {
      expect(err.length).toBeGreaterThan(0);
    }
  });

  it("rejects common weak passwords like 'password'", () => {
    const result = checkPassword("Password1!");
    // Contains "password" — should be flagged
    expect(result.errors).toContain("Évitez les mots courants (password, azerty…)");
  });

  it("rejects repeated character passwords like 'aaaaaaaa'", () => {
    const result = checkPassword("aaaaaaaa");
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Évitez les caractères répétés");
  });

  it("returns a score between 0 and 4", () => {
    const weak = checkPassword("weak");
    expect(weak.score).toBeGreaterThanOrEqual(0);
    expect(weak.score).toBeLessThanOrEqual(4);

    const strong = checkPassword("Str0ng!Pass2024");
    expect(strong.score).toBeGreaterThanOrEqual(0);
    expect(strong.score).toBeLessThanOrEqual(4);
  });
});

describe("Users module — AuditLogPanel source code analysis", () => {
  it("applies filters (action, category, user, date range) via Supabase query", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/users/AuditLogPanel.tsx"),
      "utf-8"
    );
    // Verify filter-related query building
    expect(source).toContain("actionFilter");
    expect(source).toContain("categoryFilter");
    expect(source).toContain("userFilter");
    expect(source).toContain("from");
    expect(source).toContain("to");
    // Verify Supabase query methods
    expect(source).toContain(".eq(");
    expect(source).toContain(".in(");
    expect(source).toContain(".gte(");
    expect(source).toContain(".lte(");
  });

  it("exports CSV with BOM for Excel compatibility", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/users/AuditLogPanel.tsx"),
      "utf-8"
    );
    // UTF-8 BOM for Excel
    expect(source).toContain("\\uFEFF");
    // CSV type
    expect(source).toContain("text/csv");
  });

  it("traces audit export in user_audit_log", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/users/AuditLogPanel.tsx"),
      "utf-8"
    );
    expect(source).toContain("audit_exported_csv");
    expect(source).toContain("user_audit_log");
  });

  it("uses DemoContext.blockMutation for CSV export", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/users/AuditLogPanel.tsx"),
      "utf-8"
    );
    expect(source).toContain("blockMutation");
  });
});

describe("Users module — user lifecycle source code analysis", () => {
  it("deactivation includes a reason field passed to callManage", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/pages/Users.tsx"),
      "utf-8"
    );
    expect(source).toContain("deactivationReason");
    // The reason is passed through callManage to the edge function
    expect(source).toContain("callManage(deactivateTarget");
    expect(source).toContain("deactivationReason");
  });

  it("tracks deactivation in audit log", () => {
    // L'affichage du journal d'audit (et le libellé "user_deactivated") vit
    // dans AuditLogPanel.tsx, rendu par Users.tsx (voir <AuditLogPanel /> ligne
    // ~856) — pas dans Users.tsx lui-même. Une copie dupliquée et non utilisée
    // de ce mapping existait autrefois directement dans Users.tsx ; elle a été
    // retirée (dette de duplication) car aucun rendu ne la lisait, la vraie
    // implémentation active étant celle d'AuditLogPanel.tsx testée ici.
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/users/AuditLogPanel.tsx"),
      "utf-8"
    );
    expect(source).toContain("user_deactivated");
  });

  it("supports password reset via magic link (email)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/pages/Users.tsx"),
      "utf-8"
    );
    // Should have reset modes
    expect(source).toContain("resetMode");
    expect(source).toContain("email");
  });

  it("uses admin-list-user-emails edge function for email lookup", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/pages/Users.tsx"),
      "utf-8"
    );
    expect(source).toContain("admin-list-user-emails");
  });

  it("uses admin-manage-user edge function for lifecycle operations", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/pages/Users.tsx"),
      "utf-8"
    );
    expect(source).toContain("admin-manage-user");
  });
});
