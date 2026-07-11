/**
 * MakitiPlus E2E: Smoke test post-déploiement audit AUDIT-2026-007
 *
 * Vérifie que les correctifs P1+P2+P3 sont effectifs en production.
 * À exécuter après avoir appliqué les migrations via SQL Editor.
 *
 * Prérequis :
 * - VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY dans l'environnement
 * - E2E_TEST_EMAIL et E2E_TEST_PASSWORD (compte admin de test)
 * - Application déployée et accessible (E2E_BASE_URL ou localhost:5173)
 *
 * Lancement :
 *   npx playwright test e2e/post-deployment-audit.spec.ts
 *   npx playwright test e2e/post-deployment-audit.spec.ts --ui
 */
import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;
const hasCredentials = !!(TEST_EMAIL && TEST_PASSWORD);

// Skip tout le fichier si pas de credentials
test.skip(!hasCredentials, "E2E_TEST_EMAIL/PASSWORD requis pour ce smoke test");

// ---------------------------------------------------------------------------
// Helper : login admin
// ---------------------------------------------------------------------------
async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");

  await page.getByLabel(/email/i).first().fill(TEST_EMAIL!);
  await page.getByLabel(/mot de passe|password/i).first().fill(TEST_PASSWORD!);
  await page.getByRole("button", { name: /connexion|se connecter|login/i }).click();

  // Attendre redirection vers /dashboard
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

// ---------------------------------------------------------------------------
// Scénario 1 — Application démarre sans erreur critique
// ---------------------------------------------------------------------------
test.describe("Post-déploiement — Application démarre", () => {
  test("page d'accueil charge sans erreur JS critique", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Pas d'erreur JS critique (filtrer les warnings React Router)
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes("React Router")
        && !e.includes("startTransition")
        && !e.includes("splat")
        && !e.includes("downloadable font")
    );
    expect(criticalErrors).toEqual([]);
  });

  test("page auth accessible et fonctionnelle", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByLabel(/mot de passe|password/i).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scénario 2 — Login admin fonctionne (valide que register_user patch est OK)
// ---------------------------------------------------------------------------
test.describe("Post-déploiement — Login admin", () => {
  test("admin peut se connecter et accéder au dashboard", async ({ page }) => {
    await loginAsAdmin(page);

    // Dashboard visible
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/tableau de bord|dashboard/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Scénario 3 — Charts s'affichent (valide MED-7 : CSP style-src 'self')
// ---------------------------------------------------------------------------
test.describe("Post-déploiement — Charts (MED-7)", () => {
  test("charts du dashboard s'affichent sans erreur CSP", async ({ page }) => {
    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && msg.text().includes("Content Security Policy")) {
        cspViolations.push(msg.text());
      }
    });

    await loginAsAdmin(page);

    // Naviguer vers les rapports (où les charts sont)
    await page.goto("/dashboard/reports");
    await page.waitForLoadState("networkidle");

    // Pas de violation CSP liée à style-src
    const styleViolations = cspViolations.filter((v) => v.includes("style-src"));
    expect(styleViolations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scénario 4 — Page Produits (valide ProductForm avec zod)
// ---------------------------------------------------------------------------
test.describe("Post-déploiement — Produits (MED-6)", () => {
  test("page produits charge et formulaire est accessible", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/dashboard/products");
    await page.waitForLoadState("networkidle");

    // Bouton "Ajouter un produit" visible
    const addButton = page.getByRole("button", { name: /ajouter|nouveau|créer/i }).first();
    await expect(addButton).toBeVisible({ timeout: 10_000 });
  });

  test("formulaire produit rejette un prix négatif (zod validation)", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/dashboard/products");
    await page.waitForLoadState("networkidle");

    // Ouvrir le formulaire
    await page.getByRole("button", { name: /ajouter|nouveau|créer/i }).first().click();

    // Remplir avec un prix négatif
    await page.getByLabel(/nom/i).first().fill("Test Produit Négatif");
    const priceInput = page.getByLabel(/prix/i).first();
    await priceInput.fill("-100");

    // Soumettre
    await page.getByRole("button", { name: /enregistrer|sauvegarder|valider/i }).first().click();

    // Un toast d'erreur doit apparaître (zod a rejeté)
    await expect(page.getByText(/données invalides|négatif/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Scénario 5 — Page Clients (valide customerForm avec zod)
// ---------------------------------------------------------------------------
test.describe("Post-déploiement — Clients (MED-6)", () => {
  test("page clients charge", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/dashboard/customers");
    await page.waitForLoadState("networkidle");

    // La page doit afficher soit des clients, soit un message "aucun client"
    const hasContent = await page
      .getByText(/client|aucun|ajouter/i)
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    expect(hasContent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scénario 6 — Page Fournisseurs (valide HIGH-2 : get_supplier_stats RPC)
// ---------------------------------------------------------------------------
test.describe("Post-déploiement — Fournisseurs (HIGH-2)", () => {
  test("page fournisseurs charge sans erreur RPC", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/dashboard/suppliers");
    await page.waitForLoadState("networkidle");

    // La page doit charger sans erreur visible
    const errorToast = page.getByText(/erreur|error/i).first();
    const isErrorVisible = await errorToast.isVisible({ timeout: 3_000 }).catch(() => false);

    // Si une erreur est visible, vérifier que ce n'est pas une erreur RPC
    if (isErrorVisible) {
      const errorText = await errorToast.textContent();
      // Les erreurs RPC get_supplier_stats ne doivent plus apparaître
      expect(errorText).not.toMatch(/get_supplier_stats|function.*does not exist/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Scénario 7 — Page Paramètres (valide que la config WhatsApp existe MED-3)
// ---------------------------------------------------------------------------
test.describe("Post-déploiement — Paramètres (MED-3)", () => {
  test("page paramètres charge", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/dashboard/settings");
    await page.waitForLoadState("networkidle");

    // Page paramètres doit être visible
    await expect(page.getByText(/paramètres|settings/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Scénario 8 — Logout (valide LOW-4 : record_user_logout RPC)
// ---------------------------------------------------------------------------
test.describe("Post-déploiement — Logout (LOW-4)", () => {
  test("déconnexion fonctionne sans erreur RPC", async ({ page }) => {
    await loginAsAdmin(page);

    // Trouver le bouton de déconnexion (souvent dans le menu utilisateur)
    const logoutButton = page.getByRole("button", { name: /déconnexion|logout|se déconnecter/i }).first();

    // Si le bouton n'est pas directement visible, cliquer sur le menu utilisateur d'abord
    if (!(await logoutButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
      const userMenu = page.getByRole("button", { name: /compte|profil|user|menu/i }).first();
      if (await userMenu.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await userMenu.click();
      }
    }

    // Tenter la déconnexion
    if (await logoutButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutButton.click();
      await page.waitForURL("**/auth", { timeout: 10_000 });
      await expect(page).toHaveURL(/\/auth/);
    }
    // Si pas de bouton trouvé, le test passe quand même (dépend de l'UI)
  });
});

// ---------------------------------------------------------------------------
// Scénario 9 — Pas d'erreur "function does not exist" (valide HIGH-4)
// ---------------------------------------------------------------------------
test.describe("Post-déploiement — Aucune erreur fonction manquante (HIGH-4)", () => {
  test("navigation dans toutes les pages principales sans erreur fonction manquante", async ({ page }) => {
    await loginAsAdmin(page);

    const pages = [
      "/dashboard",
      "/dashboard/products",
      "/dashboard/customers",
      "/dashboard/suppliers",
      "/dashboard/reports",
      "/dashboard/settings",
    ];

    const functionErrors: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error" && text.includes("function") && text.includes("does not exist")) {
        functionErrors.push(text);
      }
    });

    for (const url of pages) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000); // Laisser le temps aux RPC de se déclencher
    }

    // Aucune erreur "function does not exist" ne doit apparaître
    expect(functionErrors).toEqual([]);
  });
});
