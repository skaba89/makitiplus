/**
 * Pre-production non-regression tests
 *
 * Covers:
 * - Stripe webhook error handling (mutations must set processingError = true)
 * - Cron docs existence and content
 * - Experimental modules not routed in App.tsx
 * - Stripe price resolution (monthly/yearly + legacy fallback)
 * - RBAC on admin-analytics route
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─── Stripe Webhook Error Handling ────────────────────────────────────

describe("Stripe webhook — critical mutation error handling", () => {
  const webhookPath = path.resolve(
    __dirname,
    "../../supabase/functions/stripe-webhook/index.ts"
  );
  let webhookCode: string;

  beforeAll(() => {
    webhookCode = fs.readFileSync(webhookPath, "utf-8");
  });

  it("checkout.session.completed: subUpsertError sets processingError = true", () => {
    // Find the block after subUpsertError check in checkout.session.completed
    const pattern =
      /Failed to upsert subscription.*\n.*processingError\s*=\s*true/;
    expect(pattern.test(webhookCode)).toBe(true);
  });

  it("checkout.session.completed: org updateError sets processingError = true", () => {
    // After the org update in checkout.session.completed
    const pattern =
      /Failed to update org:.*\n.*processingError\s*=\s*true/;
    expect(pattern.test(webhookCode)).toBe(true);
  });

  it("customer.subscription.updated: upsert error sets processingError = true", () => {
    const pattern =
      /Failed to upsert subscription update.*\n.*processingError\s*=\s*true/;
    expect(pattern.test(webhookCode)).toBe(true);
  });

  it("customer.subscription.updated: org update error sets processingError = true", () => {
    const pattern =
      /Failed to update org on subscription update.*\n.*processingError\s*=\s*true/;
    expect(pattern.test(webhookCode)).toBe(true);
  });

  it("customer.subscription.deleted: sub update error sets processingError = true", () => {
    const pattern =
      /Failed to update subscription:.*\n.*processingError\s*=\s*true/;
    expect(pattern.test(webhookCode)).toBe(true);
  });

  it("customer.subscription.deleted: org update error sets processingError = true", () => {
    const pattern =
      /Failed to update org on deletion.*\n.*processingError\s*=\s*true/;
    expect(pattern.test(webhookCode)).toBe(true);
  });

  it("webhook returns 500 when processingError is true", () => {
    expect(webhookCode).toContain("if (processingError)");
    expect(webhookCode).toContain("status: 500");
  });

  it("webhook clears idempotency key on processingError", () => {
    // The webhook deletes the idempotency key when processingError is true
    expect(webhookCode).toContain("if (processingError)");
    expect(webhookCode).toContain("await kv.delete(['stripe_events', eventId]");
  });
});

// ─── Cron Documentation ───────────────────────────────────────────────

describe("Cron setup documentation", () => {
  const cronDocPath = path.resolve(
    __dirname,
    "../../docs/production/SUPABASE_CRON_SETUP.md"
  );

  it("SUPABASE_CRON_SETUP.md exists", () => {
    expect(fs.existsSync(cronDocPath)).toBe(true);
  });

  it("does not contain real secret values", () => {
    const content = fs.readFileSync(cronDocPath, "utf-8");
    // Should contain placeholders, not real values
    expect(content).toContain("VOTRE_CRON_SECRET");
    expect(content).toContain("VOTRE_PROJECT_ID");
    // Should NOT contain real-looking secrets
    expect(content).not.toMatch(/whsec_[a-zA-Z0-9]{20,}/);
    expect(content).not.toMatch(/sk_live_[a-zA-Z0-9]{20,}/);
  });

  it("documents rotate-test-accounts-daily", () => {
    const content = fs.readFileSync(cronDocPath, "utf-8");
    expect(content).toContain("rotate-test-accounts-daily");
  });

  it("documents subscription-lifecycle-6h", () => {
    const content = fs.readFileSync(cronDocPath, "utf-8");
    expect(content).toContain("subscription-lifecycle-6h");
  });

  it("documents X-Cron-Secret header for rotate-test-accounts", () => {
    const content = fs.readFileSync(cronDocPath, "utf-8");
    expect(content).toContain("X-Cron-Secret");
  });

  it("documents Authorization Bearer for subscription-lifecycle", () => {
    const content = fs.readFileSync(cronDocPath, "utf-8");
    expect(content).toMatch(/Authorization.*Bearer/);
  });
});

// ─── Experimental Modules Not Routed ──────────────────────────────────

describe("Experimental modules — not exposed in production", () => {
  const appPath = path.resolve(__dirname, "../App.tsx");

  it("Support is not routed in App.tsx", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).not.toContain("Support");
  });

  it("Loyalty is not routed in App.tsx", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).not.toContain("Loyalty");
  });

  it("StockTransfers is not routed in App.tsx", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).not.toContain("StockTransfers");
  });

  it("Support page has experimental warning", () => {
    const supportPath = path.resolve(__dirname, "../pages/Support.tsx");
    const content = fs.readFileSync(supportPath, "utf-8");
    expect(content).toMatch(/EXPERIMENTAL|NOT ROUTED/);
  });

  it("Loyalty page has experimental warning", () => {
    const loyaltyPath = path.resolve(__dirname, "../pages/Loyalty.tsx");
    const content = fs.readFileSync(loyaltyPath, "utf-8");
    expect(content).toMatch(/EXPERIMENTAL|NOT ROUTED/);
  });

  it("StockTransfers page has experimental warning", () => {
    const stockTransfersPath = path.resolve(
      __dirname,
      "../pages/StockTransfers.tsx"
    );
    const content = fs.readFileSync(stockTransfersPath, "utf-8");
    expect(content).toMatch(/EXPERIMENTAL|NOT ROUTED/);
  });
});

// ─── RBAC: admin-analytics uses STORE_ROLES ────────────────────────────

describe("RBAC — admin-analytics route protection", () => {
  const appPath = path.resolve(__dirname, "../App.tsx");

  it("admin-analytics route uses STORE_ROLES", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    // Find the admin-analytics route and check it uses STORE_ROLES
    const analyticsRoute = content.match(
      /admin-analytics[\s\S]*?allowedRoles=\{([^}]+)\}/
    );
    expect(analyticsRoute).not.toBeNull();
    expect(analyticsRoute![1]).toContain("STORE_ROLES");
  });
});

// ─── Stripe Price Resolution ───────────────────────────────────────────

describe("Stripe price resolution — monthly/yearly + legacy fallback", () => {
  const stripeApiPath = path.resolve(
    __dirname,
    "../../supabase/functions/_shared/stripeApi.ts"
  );
  let stripeApiCode: string;

  beforeAll(() => {
    stripeApiCode = fs.readFileSync(stripeApiPath, "utf-8");
  });

  it("PRICE_IDS includes croissance_monthly", () => {
    expect(stripeApiCode).toContain("croissance_monthly");
  });

  it("PRICE_IDS includes croissance_yearly", () => {
    expect(stripeApiCode).toContain("croissance_yearly");
  });

  it("PRICE_IDS includes enterprise_monthly", () => {
    expect(stripeApiCode).toContain("enterprise_monthly");
  });

  it("PRICE_IDS includes enterprise_yearly", () => {
    expect(stripeApiCode).toContain("enterprise_yearly");
  });

  it("legacy fallback 'croissance' maps to monthly price", () => {
    expect(stripeApiCode).toMatch(
      /croissance:\s*Deno\.env\.get\('STRIPE_PRICE_ID_CROISSANCE_MONTHLY'\)/
    );
  });

  it("legacy fallback 'enterprise' maps to monthly price", () => {
    expect(stripeApiCode).toMatch(
      /enterprise:\s*Deno\.env\.get\('STRIPE_PRICE_ID_ENTERPRISE_MONTHLY'\)/
    );
  });

  it("resolvePriceId returns null for unknown plan", () => {
    // The function returns PRICE_IDS[planKey] || null
    expect(stripeApiCode).toContain("return id || null");
  });

  it("resolvePlanFromPriceId returns null for null/undefined", () => {
    expect(stripeApiCode).toContain("if (!priceId) return null");
  });
});

// ─── CSP Render — Stripe domains ───────────────────────────────────────

describe("CSP — Stripe JS domains in render.yaml", () => {
  const renderPath = path.resolve(__dirname, "../../render.yaml");
  let renderYaml: string;

  beforeAll(() => {
    renderYaml = fs.readFileSync(renderPath, "utf-8");
  });

  it("script-src includes js.stripe.com", () => {
    expect(renderYaml).toContain("https://js.stripe.com");
  });

  it("frame-src includes js.stripe.com", () => {
    expect(renderYaml).toMatch(/frame-src.*js\.stripe\.com/);
  });

  it("frame-src includes hooks.stripe.com", () => {
    expect(renderYaml).toMatch(/frame-src.*hooks\.stripe\.com/);
  });

  it("connect-src includes api.stripe.com", () => {
    expect(renderYaml).toMatch(/connect-src.*api\.stripe\.com/);
  });
});
