import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const source = fs.readFileSync(path.join(process.cwd(), "src/contexts/AuthContext.tsx"), "utf-8");

describe("Auth login user data loading", () => {
  it("loads role and profile before completing signIn", () => {
    expect(source).toContain("setLoading(true);");
    expect(source).toContain("const loaded = await fetchUserData(data.user.id)");
    expect(source).toContain("if (!loaded.role)");
  });

  it("uses limit plus maybeSingle to avoid transient 406 during auth bootstrap", () => {
    expect(source).toContain('.from("user_roles")');
    expect(source).toContain('.from("profiles")');
    expect(source).toContain(".limit(1)");
    expect(source).toContain(".maybeSingle()");
  });
});
