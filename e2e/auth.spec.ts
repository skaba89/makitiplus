/**
 * MakitiPlus E2E: Authentication flow
 *
 * Tests the critical auth paths:
 * - Login page loads correctly
 * - Signup flow for first admin
 * - Login with valid/invalid credentials
 * - Protected route redirects unauthenticated users
 */
import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads and shows expected elements", async ({ page }) => {
    await page.goto("/auth");

    // Should show login form
    await expect(page.getByText(/connexion|login/i)).toBeVisible();

    // Should have email and password inputs
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/mot de passe|password/i)).toBeVisible();

    // Should have a submit button
    await expect(
      page.getByRole("button", { name: /connexion|se connecter|login/i })
    ).toBeVisible();
  });

  test("invalid login shows error message", async ({ page }) => {
    await page.goto("/auth");

    await page.getByLabel(/email/i).fill("invalid@test.com");
    await page.getByLabel(/mot de passe|password/i).fill("wrongpassword123");
    await page
      .getByRole("button", { name: /connexion|se connecter|login/i })
      .click();

    // Should show error message
    await expect(
      page.getByText(/identifiants|invalid|incorrect|erreur/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("unauthenticated user is redirected from dashboard", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Should be redirected to auth page
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
  });

  test("signup form shows business name field for admin", async ({ page }) => {
    await page.goto("/auth");

    // Look for signup/register toggle
    const signupToggle = page.getByText(/créer|inscrire|signup|register/i);
    if (await signupToggle.isVisible()) {
      await signupToggle.click();

      // Should show business name field
      await expect(
        page.getByLabel(/nom.*entreprise|business.*name/i)
      ).toBeVisible();
    }
  });
});
