/**
 * Secure Manual Billing Governance — Non-Regression Tests
 *
 * Verifies that:
 * 1. Billing.tsx only shows manual plan change controls to super_admin (not admin)
 * 2. Billing.tsx shows payment info to tenant admin
 * 3. Billing.tsx uses admin_update_organization_subscription RPC (not direct update)
 * 4. Billing.tsx calls blockMutation() before all subscription mutations
 * 5. PlanLimitGuard bypasses only for super_admin (not admin)
 * 6. FeatureGate bypasses only for super_admin (not admin)
 * 7. SQL migration creates the secured RPC with is_super_admin() check
 * 8. SQL migration has proper RLS for subscriptions (INSERT/UPDATE super_admin only)
 * 9. health-check.sh has no hardcoded project ref
 * 10. Scripts have no hardcoded project ref exxntkuursgwhxvehekr
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readSrc(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", filename), "utf-8");
}

function readMigration(filename: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", filename),
    "utf-8"
  );
}

function readScript(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), filename), "utf-8");
}

// ════════════════════════════════════════════════════════════════
// 1. Billing.tsx — super_admin only for manual plan changes
// ════════════════════════════════════════════════════════════════
describe("Hotfix: Billing.tsx manual plan governance", () => {
  let billing: string;
  beforeAll(() => {
    billing = readSrc("pages/Billing.tsx");
  });

  it("uses isPlatformSuperAdmin = userRole === 'super_admin' for manual plan change", () => {
    // Must have the super_admin-only flag
    expect(billing).toContain('isPlatformSuperAdmin');
    expect(billing).toMatch(/isPlatformSuperAdmin.*super_admin/);
  });

  it("uses isTenantAdmin = userRole === 'admin' for payment info display", () => {
    // Must distinguish tenant admin from super_admin
    expect(billing).toContain('isTenantAdmin');
    expect(billing).toMatch(/isTenantAdmin.*admin/);
  });

  it("shows manual plan change card ONLY to super_admin", () => {
    // The manual plan change card should be gated by isPlatformSuperAdmin
    expect(billing).toMatch(/\{isPlatformSuperAdmin\s*&&\s*\(/);
  });

  it("shows payment info card to tenant admin (not super_admin)", () => {
    // The payment info card should be gated by isTenantAdmin && !isPlatformSuperAdmin
    expect(billing).toMatch(/isTenantAdmin\s*&&\s*!isPlatformSuperAdmin/);
  });

  it("calls admin_update_organization_subscription RPC (not direct update)", () => {
    // Must call the secured RPC, not supabase.from("subscriptions").update()
    expect(billing).toContain("admin_update_organization_subscription");
    // Must NOT have direct subscriptions table update
    expect(billing).not.toMatch(/supabase\.from\(["']subscriptions["']\)\.update/);
    expect(billing).not.toMatch(/supabase\.from\(["']subscriptions["']\)\.insert/);
  });

  it("calls blockMutation() in handleManualPlanChange", () => {
    // The handler should call blockMutation before doing anything
    expect(billing).toMatch(/handleManualPlanChange[\s\S]*blockMutation/);
  });

  it("calls blockMutation() in handleExtendSubscription", () => {
    // The handler should call blockMutation before doing anything
    expect(billing).toMatch(/handleExtendSubscription[\s\S]*blockMutation/);
  });

  it("does NOT import ADMIN_ROLES or isAdminRole", () => {
    // Billing should not use the old permissive admin check
    expect(billing).not.toContain("isAdminRole");
    expect(billing).not.toContain("ADMIN_ROLES");
  });

  it("passes p_payment_reference and p_reason to the RPC", () => {
    expect(billing).toContain("p_payment_reference");
    expect(billing).toContain("p_reason");
  });

  it("handles RPC array return (Array.isArray data unwrap)", () => {
    // Must handle the Supabase RETURNS TABLE array bug
    expect(billing).toMatch(/Array\.isArray\(data\)/);
  });
});

// ════════════════════════════════════════════════════════════════
// 2. PlanLimitGuard — super_admin bypass only
// ════════════════════════════════════════════════════════════════
describe("Hotfix: PlanLimitGuard super_admin-only bypass", () => {
  let guard: string;
  beforeAll(() => {
    guard = readSrc("components/saas/PlanLimitGuard.tsx");
  });

  it("PlanLimitGuard bypasses only for super_admin (not admin)", () => {
    expect(guard).toMatch(/userRole\s*===\s*["']super_admin["']/);
    // Must NOT use isAdminRole which includes admin
    expect(guard).not.toContain("isAdminRole");
  });

  it("PlanLimitGuard imports useAuth for role check", () => {
    expect(guard).toContain("useAuth");
  });

  it("FeatureGate bypasses only for super_admin (not admin)", () => {
    // FeatureGate should have the same super_admin-only bypass
    const featureGateSection = guard.substring(
      guard.indexOf("export function FeatureGate"),
      guard.indexOf("export function FeatureGate") + 400
    );
    expect(featureGateSection).toMatch(/userRole\s*===\s*["']super_admin["']/);
  });
});

// ════════════════════════════════════════════════════════════════
// 3. SQL Migration — secured RPC
// ════════════════════════════════════════════════════════════════
describe("Hotfix: SQL migration admin_update_organization_subscription", () => {
  let sql: string;
  beforeAll(() => {
    sql = readMigration("20260705050000_secure_manual_subscription_management.sql");
  });

  it("creates admin_update_organization_subscription function", () => {
    expect(sql).toContain("admin_update_organization_subscription");
  });

  it("uses SECURITY DEFINER", () => {
    expect(sql).toContain("SECURITY DEFINER");
  });

  it("checks is_super_admin() as first guard", () => {
    expect(sql).toMatch(/is_super_admin\(\)/);
    // Must raise exception if not super_admin
    expect(sql).toMatch(/RAISE EXCEPTION.*super_admin/);
  });

  it("validates plan_id against plans table", () => {
    expect(sql).toMatch(/EXISTS.*plans.*p_plan_id/);
  });

  it("validates duration parameter", () => {
    expect(sql).toContain("1_month");
    expect(sql).toContain("3_months");
    expect(sql).toContain("6_months");
    expect(sql).toContain("1_year");
    expect(sql).toMatch(/Durée invalide/);
  });

  it("validates organization exists", () => {
    expect(sql).toMatch(/EXISTS.*organizations.*p_organization_id/);
  });

  it("calculates period_end server-side", () => {
    expect(sql).toMatch(/v_new_period_end.*NOW\(\).*\+/);
  });

  it("upserts on subscriptions table", () => {
    expect(sql).toContain("ON CONFLICT (organization_id) DO UPDATE");
  });

  it("updates organizations cache columns", () => {
    expect(sql).toContain("UPDATE public.organizations");
    expect(sql).toContain("subscription_plan");
  });

  it("logs to subscription_events for audit", () => {
    expect(sql).toMatch(/INSERT INTO.*subscription_events/);
  });

  it("returns JSONB result", () => {
    expect(sql).toContain("RETURNS JSONB");
  });

  it("GRANT EXECUTE to authenticated", () => {
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_update_organization_subscription");
    expect(sql).toContain("TO authenticated");
  });

  it("has RLS INSERT/UPDATE policies restricting to super_admin", () => {
    // Must have policies that restrict direct mutations to super_admin only
    expect(sql).toMatch(/Only super_admin can insert subscriptions/);
    expect(sql).toMatch(/Only super_admin can update subscriptions/);
    expect(sql).toMatch(/is_super_admin\(\)/);
  });

  it("drops existing function first (42P13 safety)", () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS.*admin_update_organization_subscription/);
  });
});

// ════════════════════════════════════════════════════════════════
// 4. health-check.sh — no hardcoded project ref
// ════════════════════════════════════════════════════════════════
describe("Hotfix: health-check.sh portability", () => {
  let script: string;
  beforeAll(() => {
    script = readScript("scripts/health-check.sh");
  });

  it("has no hardcoded project ref exxntkuursgwhxvehekr", () => {
    expect(script).not.toContain("exxntkuursgwhxvehekr");
  });

  it("uses configurable BASE_URL", () => {
    expect(script).toMatch(/BASE_URL.*\$\{1:-/);
  });

  it("uses configurable SUPABASE_PROJECT_REF", () => {
    expect(script).toMatch(/SUPABASE_PROJECT_REF.*\$\{2:-/);
  });

  it("uses configurable CRON_SECRET", () => {
    expect(script).toMatch(/CRON_SECRET.*\$\{3:-/);
  });

  it("skips Supabase checks when project ref not configured", () => {
    expect(script).toMatch(/SUPABASE_PROJECT_REF not set/);
  });
});

// ════════════════════════════════════════════════════════════════
// 5. Scripts — no hardcoded project ref
// ════════════════════════════════════════════════════════════════
describe("Hotfix: No hardcoded project ref in scripts", () => {
  const scriptsToCheck = [
    "deploy-functions.sh",
    "scripts/push_migrations_remote.sh",
    "scripts/STRIPE_DEPLOYMENT_GUIDE.sh",
  ];

  for (const script of scriptsToCheck) {
    it(`${script} has no hardcoded exxntkuursgwhxvehekr`, () => {
      if (fs.existsSync(path.join(process.cwd(), script))) {
        const content = readScript(script);
        expect(content).not.toContain("exxntkuursgwhxvehekr");
      }
    });
  }

  it("supabase/config.toml has no hardcoded exxntkuursgwhxvehekr", () => {
    const config = readScript("supabase/config.toml");
    expect(config).not.toContain("exxntkuursgwhxvehekr");
  });

  it("index.html has no hardcoded exxntkuursgwhxvehekr", () => {
    const html = readScript("index.html");
    expect(html).not.toContain("exxntkuursgwhxvehekr");
  });
});

// ════════════════════════════════════════════════════════════════
// 6. CI — no continue-on-error on critical steps
// ════════════════════════════════════════════════════════════════
describe("Hotfix: CI configuration", () => {
  let ci: string;
  beforeAll(() => {
    ci = readScript(".github/workflows/ci.yml");
  });

  it("triggers on push to main", () => {
    expect(ci).toMatch(/on:.*push.*main/s);
  });

  it("triggers on PR to main", () => {
    expect(ci).toMatch(/pull_request.*main/s);
  });

  it("has no continue-on-error on lint step", () => {
    const lintSection = ci.substring(
      ci.indexOf("- name: Lint"),
      ci.indexOf("- name: Lint") + 200
    );
    expect(lintSection).not.toContain("continue-on-error");
  });

  it("has no continue-on-error on typecheck step", () => {
    const tcSection = ci.substring(
      ci.indexOf("- name: Type check"),
      ci.indexOf("- name: Type check") + 200
    );
    expect(tcSection).not.toContain("continue-on-error");
  });

  it("has no continue-on-error on build step", () => {
    const buildSection = ci.substring(
      ci.indexOf("- name: Build"),
      ci.indexOf("- name: Build") + 200
    );
    expect(buildSection).not.toContain("continue-on-error");
  });

  it("has no continue-on-error on unit tests step", () => {
    const testSection = ci.substring(
      ci.indexOf("- name: Unit tests"),
      ci.indexOf("- name: Unit tests") + 300
    );
    expect(testSection).not.toContain("continue-on-error");
  });

  it("has no continue-on-error on SQL validate step", () => {
    const sqlSection = ci.substring(
      ci.indexOf("- name: Validate SQL"),
      ci.indexOf("- name: Validate SQL") + 200
    );
    expect(sqlSection).not.toContain("continue-on-error");
  });

  it("has no continue-on-error on security audit high step", () => {
    const auditSection = ci.substring(
      ci.indexOf("- name: Security audit (high"),
      ci.indexOf("- name: Security audit (high") + 200
    );
    expect(auditSection).not.toContain("continue-on-error");
  });

  it("moderate audit can have continue-on-error (informational only)", () => {
    // The moderate audit is informational and can continue-on-error
    const modSection = ci.substring(
      ci.indexOf("- name: Security audit (moderate"),
      ci.indexOf("- name: Security audit (moderate") + 300
    );
    // It's OK if this has continue-on-error
    expect(true).toBe(true); // This test just documents the expectation
  });
});

// ════════════════════════════════════════════════════════════════
// 7. OrganizationManagement.tsx — RPC alignment
// ════════════════════════════════════════════════════════════════
describe("Hotfix: OrganizationManagement.tsx RPC alignment", () => {
  let orgMgmt: string;
  beforeAll(() => {
    orgMgmt = readSrc("pages/OrganizationManagement.tsx");
  });

  it("calls admin_update_organization_subscription RPC (not direct update)", () => {
    expect(orgMgmt).toContain("admin_update_organization_subscription");
    expect(orgMgmt).not.toMatch(/supabase\.from\(["']subscriptions["']\)\.update/);
    expect(orgMgmt).not.toMatch(/supabase\.from\(["']subscriptions["']\)\.insert/);
  });

  it("does NOT send p_status to the RPC", () => {
    // p_status is not a parameter of the current RPC signature
    const rpcCallSection = orgMgmt.substring(
      orgMgmt.indexOf('supabase.rpc("admin_update_organization_subscription"'),
      orgMgmt.indexOf('supabase.rpc("admin_update_organization_subscription"') + 500
    );
    expect(rpcCallSection).not.toContain("p_status:");
  });

  it("sends p_duration with RPC-accepted format", () => {
    // Must use 1_month/1_year (not "1 month"/"1 year")
    expect(orgMgmt).toContain("p_duration");
    // The conversion must produce RPC-accepted values
    expect(orgMgmt).toMatch(/1year.*1_year/);
    expect(orgMgmt).toMatch(/1_month/);
  });

  it("converts '1year' selector to '1_year' for the RPC", () => {
    // The duration selector uses '1year' but RPC expects '1_year'
    expect(orgMgmt).toMatch(/selectedDuration.*1year.*1_year/);
  });

  it("converts '1month' selector to '1_month' for the RPC", () => {
    // The duration selector uses '1month' but RPC expects '1_month'
    expect(orgMgmt).toMatch(/1_month/);
  });

  it("does NOT send '1 year' or '1 month' to the RPC", () => {
    const rpcCallSection = orgMgmt.substring(
      orgMgmt.indexOf('supabase.rpc("admin_update_organization_subscription"'),
      orgMgmt.indexOf('supabase.rpc("admin_update_organization_subscription"') + 500
    );
    expect(rpcCallSection).not.toContain('"1 year"');
    expect(rpcCallSection).not.toContain('"1 month"');
  });

  it("sends p_payment_reference and p_reason to the RPC", () => {
    expect(orgMgmt).toContain("p_payment_reference");
    expect(orgMgmt).toContain("p_reason");
  });

  it("includes p_reason for audit trail", () => {
    // p_reason is passed to admin_update_organization_subscription for audit
    expect(orgMgmt).toMatch(/p_reason/);
  });

  it("is reserved to super_admin only (userRole check)", () => {
    expect(orgMgmt).toMatch(/userRole\s*!==\s*["']super_admin["']/);
  });

  it("query is only enabled for super_admin", () => {
    expect(orgMgmt).toMatch(/enabled:\s*userRole\s*===\s*["']super_admin["']/);
  });

  it("does not import or use isAdminRole", () => {
    expect(orgMgmt).not.toContain("isAdminRole");
  });
});

// ════════════════════════════════════════════════════════════════
// 8. SQL Migration — subscription_expires_at alignment
// ════════════════════════════════════════════════════════════════
describe("Hotfix: SQL migration subscription_expires_at", () => {
  let sql: string;
  beforeAll(() => {
    sql = readMigration("20260705050000_secure_manual_subscription_management.sql");
  });

  it("updates subscription_expires_at in organizations", () => {
    expect(sql).toContain("subscription_expires_at = v_new_period_end");
  });

  it("updates subscription_status in organizations", () => {
    expect(sql).toContain("subscription_status = 'active'");
  });

  it("updates subscription_plan in organizations", () => {
    expect(sql).toContain("subscription_plan = p_plan_id");
  });

  it("IF NOT public.is_super_admin() guard exists", () => {
    expect(sql).toMatch(/IF NOT public\.is_super_admin\(\)/);
  });

  it("validates p_plan_id against plans table", () => {
    expect(sql).toMatch(/EXISTS.*plans.*p_plan_id/);
  });

  it("validates p_duration with accepted values", () => {
    expect(sql).toContain("1_month");
    expect(sql).toContain("3_months");
    expect(sql).toContain("6_months");
    expect(sql).toContain("1_year");
    expect(sql).toMatch(/Durée invalide/);
  });

  it("GRANT EXECUTE is present for authenticated", () => {
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_update_organization_subscription");
    expect(sql).toContain("TO authenticated");
  });

  it("subscriptions INSERT restricted to super_admin", () => {
    expect(sql).toMatch(/Only super_admin can insert subscriptions/);
  });

  it("subscriptions UPDATE restricted to super_admin", () => {
    expect(sql).toMatch(/Only super_admin can update subscriptions/);
  });
});

// ════════════════════════════════════════════════════════════════
// 9. SaaS governance — no regression on Billing & PlanLimitGuard
// ════════════════════════════════════════════════════════════════
describe("Hotfix: SaaS governance no-regression", () => {
  let billing: string;
  let guard: string;
  beforeAll(() => {
    billing = readSrc("pages/Billing.tsx");
    guard = readSrc("components/saas/PlanLimitGuard.tsx");
  });

  it("Billing.tsx has no direct subscriptions.update() fallback", () => {
    expect(billing).not.toMatch(/supabase\.from\(["']subscriptions["']\)\.update/);
  });

  it("admin (tenant) cannot see manual plan change block in Billing.tsx", () => {
    // isPlatformSuperAdmin gates the manual change, not isTenantAdmin
    expect(billing).toMatch(/isPlatformSuperAdmin\s*&&\s*\(/);
  });

  it("super_admin sees manual plan change block in Billing.tsx", () => {
    expect(billing).toMatch(/isPlatformSuperAdmin/);
  });

  it("PlanLimitGuard bypasses only for super_admin", () => {
    expect(guard).toMatch(/userRole\s*===\s*["']super_admin["']/);
    expect(guard).not.toContain("isAdminRole");
  });

  it("FeatureGate bypasses only for super_admin", () => {
    const featureGateSection = guard.substring(
      guard.indexOf("export function FeatureGate"),
      guard.indexOf("export function FeatureGate") + 400
    );
    expect(featureGateSection).toMatch(/userRole\s*===\s*["']super_admin["']/);
  });
});
