/**
 * MakitiPlus E2E: Seller Activity — role-based access and functionality
 *
 * Tests:
 * - Admin can access seller activity page
 * - Manager can access seller activity page
 * - Vendor cannot access seller activity page
 * - Detail panel can be opened if rows exist
 *
 * Secrets:
 * - E2E_BASE_URL (default: http://localhost:5173)
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (or fallback to E2E_TEST_*)
 * - E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD
 * - E2E_VENDOR_EMAIL / E2E_VENDOR_PASSWORD
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5173";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.E2E_TEST_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.E2E_TEST_PASSWORD;
const MANAGER_EMAIL = process.env.E2E_MANAGER_EMAIL;
const MANAGER_PASSWORD = process.env.E2E_MANAGER_PASSWORD;
const VENDOR_EMAIL = process.env.E2E_VENDOR_EMAIL;
const VENDOR_PASSWORD = process.env.E2E_VENDOR_PASSWORD;

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/mot de passe|password/i).first().fill(password);
  await page.getByRole("button", { name: /connexion|se connecter|login/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Admin access
// ---------------------------------------------------------------------------
test.describe("Seller Activity — Admin", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "E2E_ADMIN_EMAIL/PASSWORD (or E2E_TEST_*) requis");

  test("admin can open seller activity page", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto(`${BASE_URL}/dashboard/seller-activity`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Activité Vendeurs/i)).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/Membres|Ventes totales|Chiffre/i).first()
    ).toBeVisible();
    // Must NOT show the PostgREST type mismatch error
    await expect(
      page.getByText(/structure of query does not match function result type/i)
    ).not.toBeVisible();
  });

  test("seller activity detail can be opened if rows exist", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto(`${BASE_URL}/dashboard/seller-activity`);
    await page.waitForLoadState("networkidle");

    const rowCount = await page.locator("tbody tr").count();

    if (rowCount > 0) {
      await page.locator("tbody tr").first().click();
      await expect(
        page.getByText(/Activité de|Aucune activité enregistrée|Erreur/i).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});

// ---------------------------------------------------------------------------
// Manager access
// ---------------------------------------------------------------------------
test.describe("Seller Activity — Manager", () => {
  test.skip(!MANAGER_EMAIL || !MANAGER_PASSWORD, "E2E_MANAGER_EMAIL/PASSWORD requis");

  test("manager can access seller activity page", async ({ page }) => {
    await login(page, MANAGER_EMAIL!, MANAGER_PASSWORD!);
    await page.goto(`${BASE_URL}/dashboard/seller-activity`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Activité Vendeurs/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Accès refusé/i)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Vendor denied
// ---------------------------------------------------------------------------
test.describe("Seller Activity — Vendor denied", () => {
  test.skip(!VENDOR_EMAIL || !VENDOR_PASSWORD, "E2E_VENDOR_EMAIL/PASSWORD requis");

  test("vendor cannot access seller activity page", async ({ page }) => {
    await login(page, VENDOR_EMAIL!, VENDOR_PASSWORD!);
    await page.goto(`${BASE_URL}/dashboard/seller-activity`);
    await page.waitForLoadState("networkidle");

    // Should be redirected to dashboard or see access denied
    await expect(
      page.getByText(/Accès refusé|non autorisé|dashboard/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
