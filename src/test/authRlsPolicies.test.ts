import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260706200000_fix_auth_profile_role_rls.sql"),
  "utf-8"
);

describe("Auth bootstrap RLS policies", () => {
  it("allows authenticated users to read their own profile", () => {
    expect(migration).toContain('CREATE POLICY "profiles_select_own"');
    expect(migration).toContain("USING (user_id = auth.uid())");
  });

  it("allows authenticated users to read their own role", () => {
    expect(migration).toContain('CREATE POLICY "user_roles_select_own"');
    expect(migration).toContain("ON public.user_roles");
    expect(migration).toContain("FOR SELECT");
  });

  it("does not grant direct access to auth.users", () => {
    expect(migration).not.toMatch(/GRANT\s+SELECT\s+ON\s+auth\.users/i);
  });
});
