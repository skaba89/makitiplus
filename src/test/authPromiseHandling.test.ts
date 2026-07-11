import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const source = fs.readFileSync(path.join(process.cwd(), "src/contexts/AuthContext.tsx"), "utf-8");

describe("AuthContext Supabase thenable handling", () => {
  it("does not call catch directly on supabase.rpc thenables", () => {
    expect(source).not.toContain('supabase.rpc("log_user_activity", {\n        p_action: \'login\'');
    expect(source).toContain('Promise.resolve(supabase.rpc("log_user_activity", {');
    expect(source).toContain('Promise.resolve(supabase.rpc("touch_last_login"))');
  });

  it("does not call catch directly on the profile update query builder", () => {
    expect(source).toContain('Promise.resolve(\n        supabase\n          .from("profiles")');
    expect(source).not.toContain('.then(() => {})\n        .catch(() => {})');
  });
});
