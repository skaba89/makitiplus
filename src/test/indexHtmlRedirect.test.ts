import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const appSource = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf-8");

describe("index.html route compatibility", () => {
  it("redirects /index.html to /auth instead of rendering the React 404 page", () => {
    expect(appSource).toContain('Route, Navigate } from "react-router-dom"');
    expect(appSource).toContain('path="/index.html"');
    expect(appSource).toContain('to="/auth"');
    expect(appSource.indexOf('path="/index.html"')).toBeLessThan(appSource.indexOf('path="*"'));
  });
});
