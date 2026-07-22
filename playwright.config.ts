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
  timeout: process.env.CI ? 35_000 : 30_000,
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
    // En CI : build de production + `vite preview`, qui sert des fichiers déjà
    // bundlés et répond quasi instantanément. `npm run dev` (utilisé en local
    // pour le confort HMR) doit compiler chaque module à la demande au premier
    // accès — sur le CPU partagé d'un runner GitHub Actions, ce cold-compile a
    // dépassé les timeouts d'assertion codés en dur dans plusieurs specs
    // (`{ timeout: 10_000 }` etc., qui écrasent le `expect.timeout` global de
    // toute façon) sur 3 runs consécutifs du workflow Release Readiness.
    command: process.env.CI
      ? "npm run build && npx vite preview --port 8080 --strictPort"
      : "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    // Le build de prod (~50-60s en local) doit avoir le temps de se terminer
    // avant que `vite preview` ne puisse écouter le port.
    timeout: process.env.CI ? 180_000 : 30_000,
  },
});
