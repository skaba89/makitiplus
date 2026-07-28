import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * P0.5/P0.6/P0.7 du plan cash-closing-final-hardening : la clôture de caisse
 * doit être bloquante dans la validation nationale (E2E + CI), et le
 * typecheck utilisé en CI doit être le vrai script du projet (pas un faux
 * gate `npx tsc --noEmit` qui ignore le tsconfig strict).
 */

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
const releaseReadinessYml = fs.readFileSync(path.join(root, ".github/workflows/release-readiness.yml"), "utf-8");
const ciYml = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf-8");

describe("e2e:cash-closing dans package.json (P0.5)", () => {
  it("le script e2e:cash-closing existe et cible e2e/cash-closing.spec.ts", () => {
    expect(packageJson.scripts["e2e:cash-closing"]).toBe("playwright test e2e/cash-closing.spec.ts");
  });

  it("check:national-readiness inclut npm run e2e:cash-closing", () => {
    expect(packageJson.scripts["check:national-readiness"]).toMatch(/npm run e2e:cash-closing/);
  });
});

describe("Job E2E Cash Closing bloquant dans Release Readiness (P0.6)", () => {
  it("le job e2e-cash-closing existe et exécute npm run e2e:cash-closing", () => {
    expect(releaseReadinessYml).toMatch(/e2e-cash-closing:/);
    expect(releaseReadinessYml).toMatch(/run: npm run e2e:cash-closing/);
  });

  it("le job e2e-cash-closing fait partie des dépendances du résumé final (bloquant)", () => {
    const summaryBlock = releaseReadinessYml.split("release-readiness-summary:")[1] ?? "";
    expect(summaryBlock).toMatch(/- e2e-cash-closing/);
  });

  it("le job ne cible jamais Diallo & Frères et protège explicitement le pilote", () => {
    const jobBlock = releaseReadinessYml.split("e2e-cash-closing:")[1]?.split(/\n {2}[a-z-]+:\n/)[0] ?? "";
    expect(jobBlock).toMatch(/E2E_PROTECT_PILOT_STORE: "true"/);
    expect(jobBlock).toMatch(/E2E_ALLOW_DESTRUCTIVE: "false"/);
  });
});

describe("Vrai typecheck en CI (P0.7)", () => {
  it("ci.yml utilise npm run typecheck (pas npx tsc --noEmit)", () => {
    expect(ciYml).not.toMatch(/run:\s*npx tsc --noEmit\s*$/m);
    expect(ciYml).toMatch(/run:\s*npm run typecheck/);
  });

  it("release-readiness.yml utilise npm run typecheck (pas npx tsc --noEmit)", () => {
    expect(releaseReadinessYml).not.toMatch(/run:\s*npx tsc --noEmit\s*$/m);
    expect(releaseReadinessYml).toMatch(/run:\s*npm run typecheck/);
  });
});
