/**
 * Stripe Product & Price Seeder for MakitiPlus
 *
 * This script:
 * 1. Creates Products in Stripe for each paid plan (Croissance, Enterprise)
 * 2. Creates Monthly and Yearly Prices for each product
 * 3. Updates the `plans` table with the Stripe Price IDs
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/seed-stripe-prices.ts
 *
 * Or with Deno:
 *   deno run --allow-net --allow-env scripts/seed-stripe-prices.ts
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || Deno?.env?.get("STRIPE_SECRET_KEY") || "";
const SUPABASE_URL = process.env.SUPABASE_URL || Deno?.env?.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || Deno?.env?.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing environment variables. Required: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Plan definitions for Stripe
const PLANS = [
  {
    id: "croissance",
    name: "MakitiPlus Croissance",
    description: "Plan Croissance — Pour les commerces en expansion. 3 boutiques, 10 utilisateurs, rapports avancés, fournisseurs, WhatsApp Business, branding personnalisé.",
    monthlyPrice: 2900, // $29.00 in cents
    yearlyPrice: 29000, // $290.00 in cents (save ~2 months)
    currency: "usd",
  },
  {
    id: "enterprise",
    name: "MakitiPlus Enterprise",
    description: "Plan Enterprise — Pour les grandes structures. Boutiques et utilisateurs illimités, API, assistant IA, support prioritaire, programme fidélité.",
    monthlyPrice: 7900, // $79.00 in cents
    yearlyPrice: 79000, // $790.00 in cents (save ~2 months)
    currency: "usd",
  },
];

async function stripeRequest(endpoint: string, body: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe API error (${endpoint}): ${data.error?.message || JSON.stringify(data)}`);
  }
  return data;
}

async function supabaseRequest(table: string, method: "PATCH" | "GET", body?: Record<string, unknown>, query?: string) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ""}`;
  const headers: Record<string, string> = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Supabase error (${table}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log("🚀 Starting Stripe product & price seeding...\n");

  for (const plan of PLANS) {
    console.log(`📦 Creating product: ${plan.name}`);

    // 1. Create Product
    const product = await stripeRequest("products", {
      name: plan.name,
      description: plan.description,
      metadata: { plan_id: plan.id },
      tax_code: "txcd_10103000", // SaaS digital products
    });
    console.log(`   ✅ Product created: ${product.id}`);

    // 2. Create Monthly Price
    const monthlyPrice = await stripeRequest("prices", {
      product: product.id,
      unit_amount: String(plan.monthlyPrice),
      currency: plan.currency,
      "recurring[interval]": "month",
      nickname: `${plan.name} — Mensuel`,
      metadata: { plan_id: plan.id, period: "monthly" },
    });
    console.log(`   ✅ Monthly price created: ${monthlyPrice.id} ($${plan.monthlyPrice / 100}/mois)`);

    // 3. Create Yearly Price
    const yearlyPrice = await stripeRequest("prices", {
      product: product.id,
      unit_amount: String(plan.yearlyPrice),
      currency: plan.currency,
      "recurring[interval]": "year",
      nickname: `${plan.name} — Annuel`,
      metadata: { plan_id: plan.id, period: "yearly" },
    });
    console.log(`   ✅ Yearly price created: ${yearlyPrice.id} ($${plan.yearlyPrice / 100}/an)`);

    // 4. Update DB with Price IDs
    await supabaseRequest("plans", "PATCH", {
      stripe_price_id_monthly: monthlyPrice.id,
      stripe_price_id_yearly: yearlyPrice.id,
    }, `id=eq.${plan.id}`);
    console.log(`   ✅ DB updated for plan '${plan.id}'\n`);
  }

  // 5. Verify by reading back
  console.log("📋 Verification — reading plans from DB:");
  const plans = await supabaseRequest("plans", "GET", undefined, "select=id,name,stripe_price_id_monthly,stripe_price_id_yearly&order=sort_order");
  for (const p of plans) {
    console.log(`   ${p.name}: monthly=${p.stripe_price_id_monthly || "NULL"}, yearly=${p.stripe_price_id_yearly || "NULL"}`);
  }

  console.log("\n✨ Stripe seeding complete!");

  // 5. Configure Stripe Customer Portal
  console.log("\n🔧 Configuring Stripe Customer Portal...");
  try {
    const portalConfig = await stripeRequest("billing_portal/configurations", {
      "features[subscription_update][enabled]": "true",
      "features[subscription_update][default_allowed_update][0][behavior]": "allow",
      "features[subscription_cancel][enabled]": "true",
      "features[subscription_cancel][mode]": "at_period_end",
      "features[payment_method_update][enabled]": "true",
      "features[invoice_history][enabled]": "true",
      "business_profile[headline]": "Gérez votre abonnement MakitiPlus",
    });
    console.log(`   ✅ Portal configured: ${portalConfig.id}`);
  } catch (err) {
    console.warn(`   ⚠️  Portal config failed (may already exist): ${err.message}`);
    console.warn("   You can configure it manually at: https://dashboard.stripe.com/settings/billing/portal");
  }

  console.log("\n⚠️  Next steps:");
  console.log("   1. Create a webhook endpoint pointing to: https://<project>.supabase.co/functions/v1/stripe-webhook");
  console.log("   2. Subscribe to: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed");
  console.log("   3. Set STRIPE_WEBHOOK_SECRET in Supabase Edge Function secrets");
  console.log("   4. Set RESEND_API_KEY in Supabase Edge Function secrets (for transactional emails)");
  console.log("   5. Set VITE_STRIPE_PUBLISHABLE_KEY in your .env and deployment");
  console.log("   6. Enable pg_cron in Supabase Dashboard → Database → Extensions, then uncomment the cron.schedule() lines in the migration SQL");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
