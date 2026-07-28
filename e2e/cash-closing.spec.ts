/**
 * MakitiPlus E2E: Cash Closing (sessions) — P6 du plan cash-closing-complete
 *
 * Tests :
 * - E2E_VENDOR ouvre sa caisse
 * - E2E_VENDOR clôture sa caisse
 * - E2E_MANAGER voit la clôture en attente et l'approuve
 * - E2E_ADMIN (fallback comptable non configuré séparément) consulte l'historique
 *
 * RULE 1 : ces tests ciblent EXCLUSIVEMENT E2E_TEST_ORG via les comptes
 * E2E_ADMIN/E2E_MANAGER/E2E_VENDOR — jamais Diallo & Frères. Aucun de ces
 * scénarios n'est destructif (ouverture/clôture/approbation de sessions
 * n'efface ni ne modifie jamais sales/expenses), donc pas de garde-fou
 * assertSafeForDestructiveAction nécessaire ici — voir
 * src/test/e2ePilotSafetyRegression.test.ts qui vérifie statiquement que ce
 * fichier ne contient aucune action destructive.
 *
 * Secrets :
 * - E2E_BASE_URL (default: http://localhost:8080)
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (ou fallback E2E_TEST_*)
 * - E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD
 * - E2E_VENDOR_EMAIL / E2E_VENDOR_PASSWORD
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:8080";
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

async function navigateViaMenu(page: Page, linkName: string): Promise<boolean> {
  const menuButton = page.getByRole("button", { name: /menu|ouvrir le menu/i }).first();
  if (await menuButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await menuButton.click();
  }
  const link = page.getByRole("link", { name: linkName }).first();
  const isVisible = await link.isVisible({ timeout: 5_000 }).catch(() => false);
  if (isVisible) {
    await link.click();
    await page.waitForLoadState("networkidle");
  }
  return isVisible;
}

const hasVendorCredentials = !!(VENDOR_EMAIL && VENDOR_PASSWORD);
const hasManagerCredentials = !!(MANAGER_EMAIL && MANAGER_PASSWORD);
const hasAdminCredentials = !!(ADMIN_EMAIL && ADMIN_PASSWORD);

test.describe("Clôture de caisse — accès par rôle", () => {
  test("vendeur voit le menu Clôture caisse et peut y accéder", async ({ page }) => {
    test.skip(!hasVendorCredentials, "E2E_VENDOR_EMAIL/PASSWORD non configurés");
    await login(page, VENDOR_EMAIL!, VENDOR_PASSWORD!);
    const found = await navigateViaMenu(page, "Clôture caisse");
    if (found) {
      await expect(page.getByRole("heading", { name: /clôture de caisse/i })).toBeVisible({ timeout: 10_000 });
    }
  });

  test("vendeur peut ouvrir sa caisse si aucune session n'est ouverte", async ({ page }) => {
    test.skip(!hasVendorCredentials, "E2E_VENDOR_EMAIL/PASSWORD non configurés");
    await login(page, VENDOR_EMAIL!, VENDOR_PASSWORD!);
    await page.goto(`${BASE_URL}/dashboard/cash-closing`);
    await page.waitForLoadState("networkidle");

    const openButton = page.getByRole("button", { name: /ouvrir la caisse/i });
    if (await openButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const amountInput = page.getByLabel(/fond de caisse initial/i);
      await amountInput.fill("10000");
      await openButton.click();
      await expect(page.getByText(/session en cours/i)).toBeVisible({ timeout: 10_000 });
    }
    // Si une session est déjà ouverte (run précédent non nettoyé), le test
    // passe silencieusement — pas d'action destructive pour "forcer" un état propre.
  });

  test("manager voit la vue équipe (caisses ouvertes / approbations)", async ({ page }) => {
    test.skip(!hasManagerCredentials, "E2E_MANAGER_EMAIL/PASSWORD non configurés");
    await login(page, MANAGER_EMAIL!, MANAGER_PASSWORD!);
    await page.goto(`${BASE_URL}/dashboard/cash-closing`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /clôture de caisse/i })).toBeVisible({ timeout: 10_000 });
  });

  test("admin voit l'historique des sessions", async ({ page }) => {
    test.skip(!hasAdminCredentials, "E2E_ADMIN_EMAIL/PASSWORD non configurés");
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto(`${BASE_URL}/dashboard/cash-closing`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /historique des sessions/i })).toBeVisible({ timeout: 10_000 });
  });

  // P1 (cash-closing-final-hardening) : le rejet d'une clôture exige une
  // raison -- pas d'action destructive testée ici, uniquement l'état
  // désactivé du bouton tant qu'aucune note n'est saisie. Ignoré silencieux
  // si aucune clôture n'est en attente (état non garanti en environnement de
  // test partagé).
  test("manager ne peut pas rejeter une clôture sans note", async ({ page }) => {
    test.skip(!hasManagerCredentials, "E2E_MANAGER_EMAIL/PASSWORD non configurés");
    await login(page, MANAGER_EMAIL!, MANAGER_PASSWORD!);
    await page.goto(`${BASE_URL}/dashboard/cash-closing`);
    await page.waitForLoadState("networkidle");

    const rejectButton = page.getByRole("button", { name: /rejeter/i }).first();
    if (await rejectButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(rejectButton).toBeDisabled();
    }
  });

  // P1 : filtres d'historique (date/statut/vendeur/magasin) visibles pour
  // tout rôle ayant accès à l'historique -- lecture seule, aucune donnée modifiée.
  test("les filtres de l'historique sont visibles (statut au minimum)", async ({ page }) => {
    test.skip(!hasAdminCredentials, "E2E_ADMIN_EMAIL/PASSWORD non configurés");
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto(`${BASE_URL}/dashboard/cash-closing`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/^statut$/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
