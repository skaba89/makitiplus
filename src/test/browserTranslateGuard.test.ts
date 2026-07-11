import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");

describe("browser translate protection", () => {
  it("disables browser translation around the React root", () => {
    expect(html).toContain('translate="no"');
    expect(html).toContain('notranslate');
    expect(html).toContain('name="google"');
    expect(html).toContain('content="notranslate"');
  });
});
