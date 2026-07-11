import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const source = fs.readFileSync(path.join(process.cwd(), "src/contexts/AuthContext.tsx"), "utf-8");

describe("AuthContext Supabase thenable handling", () => {
  it("does not call catch directly on supabase.rpc thenables", () => {
    // Verify that rpc calls are wrapped in Promise.resolve to avoid
    // unhandled rejection issues with Supabase thenable
    expect(source).toContain('Promise.resolve(supabase.rpc("log_user_activity", {');
    expect(source).toContain('Promise.resolve(supabase.rpc("touch_last_login"))');
    // Verify there's no bare supabase.rpc call (not wrapped)
    expect(source).not.toMatch(/^\s*supabase\.rpc\(/m);
  });

  it("does not call catch directly on the profile update query builder", () => {
    expect(source).toContain('Promise.resolve(\n        supabase\n          .from("profiles")');
    expect(source).not.toContain('.then(() => {})\n        .catch(() => {})');
  });
});
