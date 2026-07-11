import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/integrations/supabase/client.ts"),
  "utf-8"
);

describe("Supabase auth session persistence", () => {
  it("does not persist sessions in localStorage for pilot security", () => {
    expect(source).toContain("persistSession: false");
    expect(source).toContain("autoRefreshToken: false");
    expect(source).not.toContain("storage: localStorage");
  });
});
