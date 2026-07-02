/**
 * P1 Security Regression Tests — verify fixes from code review
 *
 * Tests:
 * 1. register_user first-admin flow — frontend sends p_organization_id
 *    AND the RPC allows it when owner_user_id = auth.uid()
 * 2. flushQueue uses dataWithOrg for INSERT/UPDATE (not raw mutation.data)
 * 3. useOfflineMutation passes userId/organizationId to enqueueMutation
 * 4. CI audit blocks on high/critical (no || true)
 * 5. Generated artifacts removed from repo
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

function readSrc(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", filename), "utf-8");
}

function readRoot(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), filename), "utf-8");
}

function readMigration(filename: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", filename),
    "utf-8"
  );
}

// ─── 1. register_user first-admin flow ──────────────────────────
describe("P1 Fix: register_user first-admin flow", () => {
  it("register_user SQL allows first admin when owner_user_id = auth.uid()", () => {
    const sql = readMigration("20260702100000_fix_register_user_first_admin.sql");

    // Must check organizations.owner_user_id = auth.uid()
    expect(sql).toContain("owner_user_id");
    expect(sql).toContain("v_user_id");

    // Must have the first-admin flag variable
    expect(sql).toContain("v_is_first_admin");

    // Must verify user does NOT already have a profile (prevents re-registration)
    expect(sql).toMatch(/NOT EXISTS[\s\S]*profiles[\s\S]*user_id/);

    // Must still have the existing admin verification as fallback
    expect(sql).toContain("is_member_of_organization");
    expect(sql).toContain("admin");
  });

  it("frontend AuthContext still sends p_organization_id for admin signup", () => {
    const source = readSrc("contexts/AuthContext.tsx");

    // The frontend should still send p_organization_id after creating org
    expect(source).toContain("p_organization_id");

    // Should call register_user RPC
    expect(source).toMatch(/supabase\.rpc\(["']register_user["']/);

    // Should create organization first for admin roles
    expect(source).toContain("organizations");
    expect(source).toMatch(/isAdminRole/);
  });

  it("register_user has fallback path for older DBs without the RPC", () => {
    const source = readSrc("contexts/AuthContext.tsx");

    // Should have a fallback when register_user RPC fails
    expect(source).toMatch(/fallback|séquentiel/);

    // Fallback should create profile and role separately
    expect(source).toContain("profiles");
    expect(source).toContain("user_roles");
  });
});

// ─── 2. flushQueue uses dataWithOrg ─────────────────────────────
describe("P1 Fix: flushQueue uses dataWithOrg for INSERT/UPDATE", () => {
  it("INSERT operation uses dataWithOrg, not mutation.data", () => {
    const source = readSrc("lib/offlineQueue.ts");

    // Find the INSERT case — it should use dataWithOrg
    const insertMatch = source.match(
      /case\s+"INSERT"[\s\S]*?\.insert\((\w+)/
    );
    expect(insertMatch).not.toBeNull();
    expect(insertMatch![1]).toBe("dataWithOrg");
  });

  it("UPDATE operation uses dataWithOrg, not mutation.data", () => {
    const source = readSrc("lib/offlineQueue.ts");

    // Find the UPDATE case — it should use dataWithOrg
    const updateMatch = source.match(
      /case\s+"UPDATE"[\s\S]*?\.update\((\w+)/
    );
    expect(updateMatch).not.toBeNull();
    expect(updateMatch![1]).toBe("dataWithOrg");
  });

  it("dataWithOrg is computed with correct organization_id fallback", () => {
    const source = readSrc("lib/offlineQueue.ts");

    // dataWithOrg should merge mutation.data with organization_id
    expect(source).toMatch(/dataWithOrg/);
    expect(source).toMatch(/organization_id.*currentUserOrgId/);
  });
});

// ─── 3. useOfflineMutation passes userId/organizationId ─────────
describe("P1 Fix: useOfflineMutation passes identity context", () => {
  it("destructures profile from useAuth", () => {
    const source = readSrc("hooks/useOfflineMutation.ts");

    // Must destructure profile from useAuth
    expect(source).toMatch(/useAuth\(\)/);
    expect(source).toMatch(/profile/);
  });

  it("enqueueMutation call includes userId", () => {
    const source = readSrc("hooks/useOfflineMutation.ts");

    // Must pass userId to enqueueMutation
    expect(source).toMatch(/userId.*user\?\.id/);
  });

  it("enqueueMutation call includes organizationId", () => {
    const source = readSrc("hooks/useOfflineMutation.ts");

    // Must pass organizationId to enqueueMutation
    expect(source).toMatch(/organizationId.*profile\?\.organization_id/);
  });
});

// ─── 4. CI security audit blocks on high/critical ───────────────
describe("P1 Fix: CI security audit blocks on high/critical", () => {
  it("npm audit high+ does NOT have || true", () => {
    const ci = readRoot(".github/workflows/ci.yml");

    // The high-level audit step should NOT have || true
    const highAuditMatch = ci.match(
      /npm audit --audit-level=high[^\n]*/g
    );
    expect(highAuditMatch).not.toBeNull();
    for (const line of highAuditMatch!) {
      expect(line).not.toContain("|| true");
    }
  });

  it("moderate audit is informational only (has || true)", () => {
    const ci = readRoot(".github/workflows/ci.yml");

    // The moderate-level audit step SHOULD have || true
    expect(ci).toMatch(/npm audit --audit-level=moderate\s*\|\|\s*true/);
  });
});

// ─── 5. Generated artifacts removed from repo ───────────────────
describe("P2 Fix: Generated artifacts not in repo", () => {
  it(".gitignore includes tool-results/, upload/, download/", () => {
    const gitignore = readRoot(".gitignore");
    expect(gitignore).toMatch(/tool-results\//);
    expect(gitignore).toMatch(/upload\//);
    expect(gitignore).toMatch(/download\//);
  });

  it("no tool-results/ files tracked by git", () => {
    const tracked = execSync("git ls-files tool-results/ upload/ download/", {
      encoding: "utf-8",
    }).trim();
    expect(tracked).toBe("");
  });
});
