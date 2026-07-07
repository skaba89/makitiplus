import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260707070000_auth_role_profile_bootstrap_safety.sql"),
  "utf-8"
);

describe("auth bootstrap safety migration", () => {
  it("allows users to read their own profile and roles", () => {
    expect(migration).toContain('CREATE POLICY "profiles_select_own"');
    expect(migration).toContain('CREATE POLICY "user_roles_select_own"');
    expect(migration).toContain("USING (user_id = auth.uid())");
  });

  it("does not grant direct access to auth.users", () => {
    expect(migration).not.toMatch(/GRANT\s+SELECT\s+ON\s+auth\.users/i);
  });

  it("exposes a safe diagnostic RPC for the authenticated user", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.auth_bootstrap_status()");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.auth_bootstrap_status() TO authenticated");
  });
});
