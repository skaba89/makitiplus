import { expect, type Page } from "@playwright/test";

const userId = "10000000-0000-4000-8000-000000000001";
const orgId = "20000000-0000-4000-8000-000000000001";
const user = { id: userId, aud: "authenticated", role: "authenticated", email: "ui-fixture@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };

/** Browser-only UI fixture. All Supabase requests are intercepted; never writes real data. */
export async function openAdminPage(page: Page, path: string, demo = false) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp: expires, role: "authenticated" })}.fixture`;
  const writes: string[] = [];
  await page.route("**/auth/v1/**", async route => {
    const url = new URL(route.request().url());
    const json = url.pathname.endsWith("/token")
      ? { access_token: token, refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: expires, user }
      : user;
    await route.fulfill({ json });
  });
  await page.route("**/rest/v1/**", async route => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split("/").at(-1);
    const single = request.headers().accept?.includes("vnd.pgrst.object");
    let json: unknown = single ? null : [];
    if (name === "admin_exists") json = true;
    else if (name === "user_roles") json = { role: "admin" };
    else if (name === "profiles") json = { user_id: userId, organization_id: orgId, business_name: "E2E Boutique", owner_name: "E2E Admin", is_active: true, currency: "GNF", subscription_plan: "enterprise" };
    else if (name === "check_feature_access") json = { allowed: true, plan_id: "enterprise" };
    else if (name === "check_plan_limit") json = { allowed: true, current: 0, limit: null, plan_id: "enterprise" };
    else if (name === "check_account_status") json = { is_active: true };
    else if (name === "create_product" || (name === "products" && request.method() !== "GET" && request.method() !== "HEAD")) {
      writes.push(request.method());
      await route.fulfill({ status: 403, json: { message: "Fixture forbids product writes" } });
      return;
    }
    await route.fulfill({ json, headers: { "content-range": "*/0" } });
  });
  await page.route("**/functions/v1/**", route => route.fulfill({ json: {} }));
  await page.route("**/storage/v1/**", route => route.fulfill({ status: 403, json: { message: "Fixture forbids storage access" } }));
  await page.addInitScript(({ demo }) => {
    if (demo) localStorage.setItem("makitiplus_demo_mode", "true");
  }, { demo });
  await page.goto("/auth");
  await page.getByLabel(/email/i).first().fill(user.email);
  await page.getByLabel(/mot de passe|password/i).first().fill("FixturePassword123!");
  await page.getByRole("button", { name: /connexion|se connecter|login/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  if (path !== "/dashboard") {
    // Session is intentionally in-memory: use SPA navigation, not a reload.
    await page.evaluate(target => {
      history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  return writes;
}
