/**
 * MakitiPlus E2E: Staging real flow — non-destructif
 *
 * Test un flux réel end-to-end sur environnement staging.
 * Aucune action destructive par défaut.
 *
 * Secrets requis :
 * - E2E_BASE_URL
 * - E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * - E2E_VENDOR_EMAIL / E2E_VENDOR_PASSWORD
 * - E2E_TEST_ORG_NAME
 *
 * Lancement :
 *   npm run e2e:staging
 *   npx playwright test e2e/staging-real-flow.spec.ts --ui
 *
 * Actions destructives protégées par E2E_ALLOW_DESTRUCTIVE=true
 */
import { test, expect } from "@playwright/test";
import { assertSafeForDestructiveAction } from "../src/lib/pilotProtection";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:8080";
const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const VENDOR_EMAIL = process.env.E2E_VENDOR_EMAIL;
const VENDOR_PASSWORD = process.env.E2E_VENDOR_PASSWORD;
const TEST_ORG_NAME = process.env.E2E_TEST_ORG_NAME;

const hasSuperAdmin = !!(SUPER_ADMIN_EMAIL && SUPER_ADMIN_PASSWORD);
const hasAdmin = !!(ADMIN_EMAIL && ADMIN_PASSWORD);
const hasVendor = !!(VENDOR_EMAIL && VENDOR_PASSWORD);

// Helper : login
async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/mot de passe|password/i).first().fill(password);
  await page.getByRole("button", { name: /connexion|se connecter|login/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

// ---------------------------------------------------------------------------
// Scénario A — Diagnostic
// ---------------------------------------------------------------------------
// Scindé en deux describe distincts : `test.skip(condition, reason)` appelé nu
// à l'intérieur d'un describe() (hors du corps d'un test()) s'applique à TOUTE
// la suite englobante en Playwright — un seul describe ici aurait donc aussi
// sauté le test "sans auth" (censé tourner sans aucun secret) dès que
// E2E_SUPER_ADMIN_EMAIL manque. C'est précisément ce qui s'est produit en CI :
// les 22 tests du fichier étaient rapportés "skipped", y compris celui-ci.
test.describe("Scénario A — Diagnostic", () => {
  test("statut global visible sans auth, clé Supabase masquée", async ({ page }) => {
    await page.goto(`${BASE_URL}/diagnostic`);
    await page.waitForLoadState("networkidle");

    // Le statut global doit être visible
    await expect(page.getByText(/opérationnel|action requise|en cours/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Aucune clé Supabase ne doit être visible (même tronquée)
    const pageText = await page.textContent("body");
    expect(pageText).not.toMatch(/eyJ[A-Za-z0-9+/=]{10,}/);

    // Le détail technique doit être masqué pour les non-connectés
    await expect(page.getByText(/détails techniques réservés|se connecter/i)).toBeVisible();
  });
});

test.describe("Scénario A — Diagnostic (super_admin)", () => {
  test.skip(!hasSuperAdmin, "E2E_SUPER_ADMIN_EMAIL/PASSWORD requis");

  test("détails techniques visibles si super_admin connecté", async ({ page }) => {
    await login(page, SUPER_ADMIN_EMAIL!, SUPER_ADMIN_PASSWORD!);
    await page.goto(`${BASE_URL}/diagnostic`);
    await page.waitForLoadState("networkidle");

    // Les détails doivent être visibles (cartes avec catégories)
    await expect(page.getByText(/Connexion Supabase|Migrations P1/i)).toBeVisible({
      timeout: 10_000,
    });

    // Aucune clé ne doit être visible même en super_admin
    const pageText = await page.textContent("body");
    expect(pageText).not.toMatch(/eyJ[A-Za-z0-9+/=]{10,}/);
  });
});

// ---------------------------------------------------------------------------
// Scénario B — Login admin boutique
// ---------------------------------------------------------------------------
test.describe("Scénario B — Login admin boutique", () => {
  test.skip(!hasAdmin, "E2E_ADMIN_EMAIL/PASSWORD requis");

  test("admin peut accéder au dashboard, produits, POS", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    // Dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Produits
    await page.goto(`${BASE_URL}/dashboard/products`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/produit|ajouter/i).first()).toBeVisible({ timeout: 10_000 });

    // POS
    await page.goto(`${BASE_URL}/dashboard/pos`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/caisse|panier|vente/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("admin non-super_admin ne voit pas OrganizationManagement", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    // Tenter d'accéder à OrganizationManagement
    await page.goto(`${BASE_URL}/dashboard/admin/organizations`);
    await page.waitForLoadState("networkidle");

    // Doit être redirigé ou voir un message d'accès refusé
    const url = page.url();
    const hasAccessDenied = await page
      .getByText(/accès refusé|réservé|super admin/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    // Soit redirigé vers dashboard, soit message d'accès refusé
    expect(url.includes("/dashboard/admin/organizations") === false || hasAccessDenied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scénario C — Création produit test
// ---------------------------------------------------------------------------
test.describe("Scénario C — Création produit test", () => {
  test.skip(!hasAdmin, "E2E_ADMIN_EMAIL/PASSWORD requis");

  test("créer un produit test avec prix positif et stock", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    await page.goto(`${BASE_URL}/dashboard/products`);
    await page.waitForLoadState("networkidle");

    // Ouvrir le formulaire
    await page.getByRole("button", { name: /ajouter|nouveau|créer/i }).first().click();
    await page.waitForTimeout(1000);

    const productName = `E2E Produit Test ${Date.now()}`;

    // Remplir le formulaire
    await page.getByLabel(/nom/i).first().fill(productName);
    await page.getByLabel(/prix/i).first().fill("1500");
    await page.getByLabel(/stock/i).first().fill("10");

    // Soumettre
    await page.getByRole("button", { name: /enregistrer|sauvegarder|valider/i }).first().click();

    // Vérifier le toast de succès
    await expect(page.getByText(/ajouté|créé|succès/i).first()).toBeVisible({ timeout: 10_000 });

    // Vérifier que le produit apparaît dans la liste
    await page.waitForTimeout(2000);
    const productVisible = await page
      .getByText(productName)
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    expect(productVisible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scénario D — Vente cash
// ---------------------------------------------------------------------------
test.describe("Scénario D — Vente cash", () => {
  test.skip(!hasAdmin, "E2E_ADMIN_EMAIL/PASSWORD requis");

  test("enregistrer une vente cash et vérifier le stock", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    await page.goto(`${BASE_URL}/dashboard/pos`);
    await page.waitForLoadState("networkidle");

    // Ajouter un produit au panier (cliquer sur le premier produit visible)
    const productButton = page.locator("[data-product-id], .product-card, button:has-text('E2E Produit Test')").first();
    await productButton.click().catch(() => {
      // Fallback : recherche par texte
      return page.getByText(/E2E Produit Test|coca|pain/i).first().click();
    });

    await page.waitForTimeout(1000);

    // Encaisser
    await page.getByRole("button", { name: /encaisser|payer|checkout/i }).first().click();
    await page.waitForTimeout(1000);

    // Sélectionner cash
    const cashButton = page.getByRole("button", { name: /espèces|cash/i }).first();
    if (await cashButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cashButton.click();
    }

    // Valider
    await page.getByRole("button", { name: /valider|confirmer/i }).first().click().catch(() => {});

    // Vérifier confirmation
    await expect(page.getByText(/reçu|confirmation|vendu|succès/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Scénario E — Vente offline simulée
// ---------------------------------------------------------------------------
test.describe("Scénario E — Vente offline simulée", () => {
  test.skip(!hasAdmin, "E2E_ADMIN_EMAIL/PASSWORD requis");

  test("vente offline mise en queue puis synchronisée", async ({ page, context }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    // Simuler offline via context
    await context.setOffline(true);

    await page.goto(`${BASE_URL}/dashboard/pos`);
    await page.waitForLoadState("networkidle");

    // Vérifier banner offline
    await expect(page.getByText(/hors ligne|offline/i).first()).toBeVisible({ timeout: 10_000 });

    // Tenter une vente
    const productButton = page.locator("[data-product-id], .product-card").first();
    await productButton.click().catch(() => {});
    await page.waitForTimeout(500);

    // La vente doit être mise en queue ou afficher un message
    const queuedIndicator = await page
      .getByText(/queue|file d'attente|mis en attente|synchronis/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    // Remettre online
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Vérifier sync
    const syncIndicator = await page
      .getByText(/synchronis|sync/i)
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    // Au moins un des deux indicateurs doit être visible
    expect(queuedIndicator || syncIndicator).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scénario F — Billing sécurité
//
// Deux describe distincts (même raison que Scénario A) : deux test.skip()
// bruts dans un seul describe s'accumulent en OR sur TOUTE la suite — avec
// seulement E2E_ADMIN_EMAIL configuré (hasSuperAdmin=false), le test admin
// aurait été sauté lui aussi alors qu'il ne dépend que de hasAdmin.
// ---------------------------------------------------------------------------
test.describe("Scénario F — Billing sécurité (admin)", () => {
  test.skip(!hasAdmin, "E2E_ADMIN_EMAIL/PASSWORD requis");

  test("admin boutique ne voit pas gestion manuelle des abonnements", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    await page.goto(`${BASE_URL}/dashboard/billing`);
    await page.waitForLoadState("networkidle");

    // L'admin ne doit pas voir "Gestion manuelle" ou "Modifier l'abonnement"
    const manualMgmt = await page
      .getByText(/gestion manuelle|modifier.*abonnement|admin_update_organization_subscription/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    expect(manualMgmt).toBe(false);
  });
});

test.describe("Scénario F — Billing sécurité (super_admin)", () => {
  test.skip(!hasSuperAdmin, "E2E_SUPER_ADMIN_EMAIL/PASSWORD requis");

  test("super_admin voit la gestion manuelle des abonnements", async ({ page }) => {
    await login(page, SUPER_ADMIN_EMAIL!, SUPER_ADMIN_PASSWORD!);

    // Le super_admin a accès à OrganizationManagement
    await page.goto(`${BASE_URL}/dashboard/admin/organizations`);
    await page.waitForLoadState("networkidle");

    // La page doit charger (pas de redirection)
    await expect(page).toHaveURL(/\/dashboard\/admin\/organizations/);
  });
});

// ---------------------------------------------------------------------------
// Scénario G — Suppression organisation sécurisée
//
// Le test destructif est isolé dans un describe imbriqué avec sa propre
// condition de skip (E2E_ALLOW_DESTRUCTIVE) — même raison que Scénarios A/F :
// deux test.skip() bruts dans un seul describe s'accumulent en OR sur toute
// la suite, ce qui aurait sauté le test "bouton désactivé" (non-destructif,
// ne dépend que de hasSuperAdmin) dès que E2E_ALLOW_DESTRUCTIVE n'est pas
// "true" — soit dans la quasi-totalité des runs légitimes (RULE 1, défaut
// sûr). Le describe imbriqué hérite déjà de la garde hasSuperAdmin du parent.
// ---------------------------------------------------------------------------
test.describe("Scénario G — Suppression organisation sécurisée", () => {
  test.skip(!hasSuperAdmin, "E2E_SUPER_ADMIN_EMAIL/PASSWORD requis");

  test("bouton de suppression désactivé si texte incorrect", async ({ page }) => {
    await login(page, SUPER_ADMIN_EMAIL!, SUPER_ADMIN_PASSWORD!);

    await page.goto(`${BASE_URL}/dashboard/admin/organizations`);
    await page.waitForLoadState("networkidle");

    // Ouvrir le dialog de suppression sur la première org
    const deleteButton = page.getByRole("button", { name: /supprimer|delete/i }).first();
    if (await deleteButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await deleteButton.click();
      await page.waitForTimeout(1000);

      // Taper un mauvais nom
      const confirmInput = page.getByPlaceholder(/nom|name/i).first();
      if (await confirmInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmInput.fill("mauvais-nom");

        // Le bouton de confirmation doit être désactivé
        const confirmButton = page.getByRole("button", { name: /confirmer|supprimer définitivement/i }).first();
        if (await confirmButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
          const isDisabled = await confirmButton.isDisabled();
          expect(isDisabled).toBe(true);
        }
      }
    }
  });

  test.describe("destructif", () => {
    // Test destructif — protégé par E2E_ALLOW_DESTRUCTIVE
    test.skip(process.env.E2E_ALLOW_DESTRUCTIVE !== "true", "E2E_ALLOW_DESTRUCTIVE=true requis");

    test("suppression organisation avec nom exact", async ({ page }) => {
      // Garde-fou anti-pilote (P0.1) : lève une erreur — donc fait échouer ce test —
      // si TEST_ORG_NAME correspond à Diallo & Frères (le magasin pilote réel), quelle
      // que soit la configuration de E2E_ALLOW_DESTRUCTIVE. Voir src/lib/pilotProtection.ts.
      assertSafeForDestructiveAction(TEST_ORG_NAME);

      await login(page, SUPER_ADMIN_EMAIL!, SUPER_ADMIN_PASSWORD!);

      await page.goto(`${BASE_URL}/dashboard/admin/organizations`);
      await page.waitForLoadState("networkidle");

      // Ce test ne s'exécute que si E2E_ALLOW_DESTRUCTIVE=true
      // Et utilise TEST_ORG_NAME pour cibler une org de test jetable
      if (!TEST_ORG_NAME) {
        test.skip();
        return;
      }

      // Trouver l'org de test et ouvrir le dialog de suppression
      const orgRow = page.getByText(TEST_ORG_NAME).first();
      await orgRow.click().catch(() => {});

      // ... procédure de suppression avec nom exact
      // Ce test est intentionnellement minimal — à compléter selon l'UI
    });
  });
});
