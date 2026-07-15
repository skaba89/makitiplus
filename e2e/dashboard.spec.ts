/**
 * MakitiPlus E2E: Dashboard and navigation
 *
 * Tests that authenticated users can:
 * - View the dashboard
 * - Navigate between pages
 * - See their organization data
 *
 * CONFIGURATION:
 *   Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars to enable these tests.
 *   Without these, tests are skipped (not failed).
 *
 * Example:
 *   E2E_TEST_EMAIL=admin@test.com E2E_TEST_PASSWORD=... npx playwright test e2e/dashboard.spec.ts
 */
import { test, expect } from "@playwright/test";

const hasCredentials = !!(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

// Skip these tests if no auth credentials are provided
test.describe("Dashboard (requires auth)", () => {
  test.skip(!hasCredentials, "Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD env var");

  test.beforeEach(async ({ page }) => {
    // Login with test credentials
    await page.goto("/auth");
    await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_TEST_PASSWORD!);
    await page.click('button[type="submit"]');
    // Wait for dashboard to load
    await page.waitForURL("/dashboard", { timeout: 15000 });
  });

  test("dashboard shows sales overview", async ({ page }) => {
    await expect(page.getByText(/ventes|sales/i)).toBeVisible();
  });

  test("navigation menu shows all allowed pages", async ({ page }) => {
    // Check for sidebar navigation items
    const navItems = [
      /produit/i,
      /caisse|pos/i,
      /rapport/i,
      /catégor/i,
    ];

    for (const item of navItems) {
      await expect(page.getByText(item).first()).toBeVisible();
    }
  });

  test("clicking POS navigates to /dashboard/pos", async ({ page }) => {
    await page.getByText(/caisse|pos/i).first().click();
    await expect(page).toHaveURL(/\/dashboard\/pos/);
  });
});
