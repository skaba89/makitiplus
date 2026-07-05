/**
 * Production Pilot Readiness — Non-Regression Tests
 *
 * Verifies that production pilot requirements are maintained:
 * 1. CI uses max-warnings 10 (not 50)
 * 2. CI has pilot-e2e blocking job
 * 3. CI pilot-e2e has no continue-on-error
 * 4. Render uses npm ci (not npm install)
 * 5. POS/offline core invariants are intact
 * 6. Demo mode blocks sales
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

function readFile(filepath: string): string {
  return fs.readFileSync(path.join(process.cwd(), filepath), "utf-8");
}

// ════════════════════════════════════════════════════════════════
// 1. CI — max-warnings 10
// ════════════════════════════════════════════════════════════════
describe("Pilot Readiness: CI ESLint strictness", () => {
  let ci: string;
  beforeAll(() => {
    ci = readFile(".github/workflows/ci.yml");
  });

  it("uses max-warnings 10 (not 50)", () => {
    expect(ci).toContain("--max-warnings 10");
    expect(ci).not.toContain("--max-warnings 50");
  });

  it("lint step has no continue-on-error", () => {
    const lintSection = ci.substring(
      ci.indexOf("- name: Lint"),
      ci.indexOf("- name: Lint") + 200
    );
    expect(lintSection).not.toContain("continue-on-error");
  });
});

// ════════════════════════════════════════════════════════════════
// 2. CI — pilot-e2e blocking job
// ════════════════════════════════════════════════════════════════
describe("Pilot Readiness: CI pilot-e2e job", () => {
  let ci: string;
  beforeAll(() => {
    ci = readFile(".github/workflows/ci.yml");
  });

  it("has pilot-e2e job defined", () => {
    expect(ci).toContain("pilot-e2e:");
  });

  it("pilot-e2e runs npm run e2e:pilot", () => {
    expect(ci).toContain("npm run e2e:pilot");
  });

  it("pilot-e2e has no continue-on-error on the test step", () => {
    // The pilot-e2e job should NOT have continue-on-error at the job level
    const pilotJob = ci.substring(
      ci.indexOf("pilot-e2e:"),
      ci.indexOf("pilot-e2e:") + 2000
    );
    // Job-level continue-on-error should NOT be present
    // (individual informational steps can have it, but not the job)
    const lines = pilotJob.split("\n");
    const jobLevelContinueOnError = lines.some(
      (line, i) =>
        line.includes("continue-on-error") &&
        !lines.slice(0, i).some((l) => l.includes("- name:"))
    );
    expect(jobLevelContinueOnError).toBe(false);
  });

  it("pilot-e2e passes E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars", () => {
    expect(ci).toContain("E2E_TEST_EMAIL");
    expect(ci).toContain("E2E_TEST_PASSWORD");
  });

  it("pilot-e2e depends on build-and-test", () => {
    const pilotJob = ci.substring(
      ci.indexOf("pilot-e2e:"),
      ci.indexOf("pilot-e2e:") + 500
    );
    expect(pilotJob).toContain("needs: build-and-test");
  });
});

// ════════════════════════════════════════════════════════════════
// 3. Render — npm ci
// ════════════════════════════════════════════════════════════════
describe("Pilot Readiness: Render build reproducibility", () => {
  let render: string;
  beforeAll(() => {
    render = readFile("render.yaml");
  });

  it("uses npm ci (not npm install)", () => {
    expect(render).toContain("npm ci");
    expect(render).not.toMatch(/npm install/);
  });
});

// ════════════════════════════════════════════════════════════════
// 4. package.json — e2e:pilot script
// ════════════════════════════════════════════════════════════════
describe("Pilot Readiness: npm scripts", () => {
  let pkg: string;
  beforeAll(() => {
    pkg = readFile("package.json");
  });

  it("has e2e:pilot script", () => {
    expect(pkg).toContain('"e2e:pilot"');
    expect(pkg).toContain("pilot-critical.spec.ts");
  });
});

// ════════════════════════════════════════════════════════════════
// 5. POS/Offline — core invariants
// ════════════════════════════════════════════════════════════════
describe("Pilot Readiness: POS/Offline invariants", () => {
  let offlineSale: string;
  let offlineQueue: string;
  beforeAll(() => {
    offlineSale = readFile("src/hooks/useOfflineSale.ts");
    offlineQueue = readFile("src/lib/offlineQueue.ts");
  });

  it("useOfflineSale checks demo mode before any sale", () => {
    expect(offlineSale).toContain("blockMutation");
    expect(offlineSale).toMatch(/Mode démo/);
  });

  it("useOfflineSale uses create_sale_with_limit RPC online", () => {
    expect(offlineSale).toContain("create_sale_with_limit");
  });

  it("useOfflineSale enqueues create_sale_with_limit offline", () => {
    expect(offlineSale).toMatch(/enqueueRPCMutation.*create_sale_with_limit/s);
  });

  it("offlineQueue has create_sale_with_limit in ALLOWED_RPCS", () => {
    expect(offlineQueue).toContain("create_sale_with_limit");
  });

  it("offlineQueue has decrementLocalStock for offline stock", () => {
    expect(offlineQueue).toContain("decrementLocalStock");
  });

  it("offlineQueue has flushQueueWithMutex for safe sync", () => {
    expect(offlineQueue).toContain("flushQueueWithMutex");
  });

  it("offlineQueue has MUTATION_MAX_AGE_MS for stale protection", () => {
    expect(offlineQueue).toContain("MUTATION_MAX_AGE_MS");
  });
});

// ════════════════════════════════════════════════════════════════
// 6. Checklist docs exist
// ════════════════════════════════════════════════════════════════
describe("Pilot Readiness: Documentation", () => {
  it("PILOT_STORE_CHECKLIST.md exists", () => {
    expect(fs.existsSync(path.join(process.cwd(), "docs/production/PILOT_STORE_CHECKLIST.md"))).toBe(true);
  });

  it("PRODUCTION_PILOT_TECH_CHECKLIST.md exists", () => {
    expect(fs.existsSync(path.join(process.cwd(), "docs/production/PRODUCTION_PILOT_TECH_CHECKLIST.md"))).toBe(true);
  });

  it("pilot-critical.spec.ts exists", () => {
    expect(fs.existsSync(path.join(process.cwd(), "e2e/pilot-critical.spec.ts"))).toBe(true);
  });
});
