import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for MakitiPlus
 *
 * Run with: npx playwright test
 * UI mode:  npx playwright test --ui
 * Debug:    npx playwright test --debug
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }]],
  // En CI (runner GitHub Actions, CPU limité), le premier chargement de page
  // déclenche la compilation à la demande de tous les modules importés par
  // main.tsx (serveur de dev Vite non-bundlé) — nettement plus lent qu'en
  // local. Marges relevées pour absorber ce cold-compile initial sans masquer
  // de vrais bugs (voir audit P0.5 : 1er run post-fix Vite encore en échec
  // sur des timeouts de 10s dépassés dès le tout premier test).
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 20_000 : 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 90_000 : 30_000,
  },
});
