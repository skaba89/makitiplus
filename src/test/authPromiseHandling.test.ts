import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// Normalisé en LF : sur Windows, `core.autocrlf` peut checkout ce fichier en CRLF,
// ce qui ferait échouer les assertions littérales `\n` ci-dessous sans rapport avec
// le comportement réellement testé (le wrapping Promise.resolve, pas le style de fin de ligne).
const source = fs
  .readFileSync(path.join(process.cwd(), "src/contexts/AuthContext.tsx"), "utf-8")
  .replace(/\r\n/g, "\n");

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
