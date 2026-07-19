import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf-8");

describe("P1.4 — Non-régression AdminAnalytics", () => {
  const content = read("src/pages/AdminAnalytics.tsx");

  it("1. ne contient plus 'if (error) return []' sans reportError", () => {
    // Vérifier qu'il n'y a plus de "if (error) return [];" isolé
    const lines = content.split("\n");
    const bareErrorReturn = lines.find((line) => {
      const trimmed = line.trim();
      return trimmed === "if (error) return [];" || trimmed === "if (error) return[];";
    });
    expect(bareErrorReturn).toBeUndefined();
  });

  it("2. les erreurs RPC sont envoyées à reportError", () => {
    expect(content).toMatch(/reportError\s*\(\s*new\s*Error.*RPC.*failed/i);
  });

  it("3. chaque query RPC a une queryKey stable", () => {
    // Vérifier qu'il y a des queryKey avec des noms stables
    expect(content).toMatch(/queryKey:\s*\["admin-/i);
  });

  it("4. reportError est importé depuis @/lib/sentry", () => {
    expect(content).toMatch(/import.*reportError.*from.*@\/lib\/sentry/i);
  });

  it("5. le filtre organisation est présent (selectedStoreId ou effectiveOrgId)", () => {
    expect(content).toMatch(/selectedStoreId|effectiveOrgId/i);
  });
});
