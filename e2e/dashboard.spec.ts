/**
 * MakitiPlus E2E: Dashboard and navigation
 *
 * Tests that authenticated users can:
 * - View the dashboard
 * - Navigate between pages
 * - See their organization data
 */
import { test, expect } from "@playwright/test";

// Skip these tests if no auth credentials are provided
test.describe.skip("Dashboard (requires auth)", () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Add actual login when test credentials are available
    // For now, these tests are skipped in CI
    await page.goto("/dashboard");
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
