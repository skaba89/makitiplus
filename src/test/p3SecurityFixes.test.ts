/**
 * Tests de non-régression sécurité — Palier 3 (AUDIT-2026-007)
 *
 * Valide les correctifs des findings P3 :
 *   • MED-1 : user_activity_logs accepte n'importe quel p_action
 *   • MED-2 : profiles/user_roles politiques RLS incohérentes
 *   • MED-6 : Forms métier sans validation zod
 *   • MED-7 + LOW-5 : CSP style-src 'unsafe-inline' + chart.tsx dangerouslySetInnerHTML
 *   • LOW-2 : rotate-test-accounts fail-open si CRON_SECRET unset
 *   • LOW-3 : send-whatsapp ne vérifie pas customer_id dans org
 *   • LOW-4 : useInactivityTimeout écrit last_logout_at depuis le client
 *   • LOW-6 : Android allowBackup + FileProvider paths
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  productSchema,
  customerSchema,
  stockAdjustmentSchema,
  creditPaymentSchema,
  validateForm,
} from "@/lib/schemas";

const MIGRATION_PATH = join(
  __dirname,
  "../../supabase/migrations/20260708020000_p3_security_fixes.sql"
);
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, "utf-8");

const ROTATE_FN_PATH = join(
  __dirname,
  "../../supabase/functions/rotate-test-accounts/index.ts"
);
const ROTATE_FN = readFileSync(ROTATE_FN_PATH, "utf-8");

const WHATSAPP_FN_PATH = join(
  __dirname,
  "../../supabase/functions/send-whatsapp/index.ts"
);
const WHATSAPP_FN = readFileSync(WHATSAPP_FN_PATH, "utf-8");

const CHART_PATH = join(__dirname, "../components/ui/chart.tsx");
const CHART_TS = readFileSync(CHART_PATH, "utf-8");

const RENDER_YAML_PATH = join(__dirname, "../../render.yaml");
const RENDER_YAML = readFileSync(RENDER_YAML_PATH, "utf-8");

const INACTIVITY_PATH = join(__dirname, "../hooks/useInactivityTimeout.ts");
const INACTIVITY_TS = readFileSync(INACTIVITY_PATH, "utf-8");

const MANIFEST_PATH = join(
  __dirname,
  "../../android/app/src/main/AndroidManifest.xml"
);
const MANIFEST_XML = readFileSync(MANIFEST_PATH, "utf-8");

const FILE_PATHS_XML_PATH = join(
  __dirname,
  "../../android/app/src/main/res/xml/file_paths.xml"
);
const FILE_PATHS_XML = readFileSync(FILE_PATHS_XML_PATH, "utf-8");

describe("P3 Security Fixes — AUDIT-2026-007", () => {
  describe("Migration file", () => {
    it("exists and is readable", () => {
      expect(MIGRATION_SQL).toBeTruthy();
      expect(MIGRATION_SQL.length).toBeGreaterThan(1000);
    });

    it("references findings by ID in comments", () => {
      expect(MIGRATION_SQL).toContain("MED-1");
      expect(MIGRATION_SQL).toContain("MED-2");
      expect(MIGRATION_SQL).toContain("LOW-1");
      expect(MIGRATION_SQL).toContain("LOW-4");
    });
  });

  describe("MED-1 — log_user_activity ENUM validation", () => {
    it("creates app_activity_action ENUM type", () => {
      expect(MIGRATION_SQL).toMatch(/CREATE\s+TYPE\s+public\.app_activity_action\s+AS\s+ENUM/i);
    });

    it("includes the expected action values in the ENUM", () => {
      expect(MIGRATION_SQL).toMatch(/'login'/);
      expect(MIGRATION_SQL).toMatch(/'logout'/);
      expect(MIGRATION_SQL).toMatch(/'sale_created'/);
      expect(MIGRATION_SQL).toMatch(/'product_created'/);
      expect(MIGRATION_SQL).toMatch(/'stock_adjusted'/);
    });

    it("migrates the action column from TEXT to the ENUM type", () => {
      expect(MIGRATION_SQL).toMatch(
        /ALTER\s+TABLE\s+public\.user_activity_logs[\s\S]*?ALTER\s+COLUMN\s+action\s+TYPE\s+app_activity_action/i
      );
    });

    it("recreates log_user_activity with the ENUM parameter type", () => {
      expect(MIGRATION_SQL).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.log_user_activity\([\s\S]*?p_action\s+public\.app_activity_action/i
      );
    });

    it("drops the old TEXT-signature function before recreating", () => {
      expect(MIGRATION_SQL).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.log_user_activity\(TEXT,\s*TEXT,\s*JSONB\)/i);
    });
  });

  describe("MED-2 — Drop redundant old RLS policies", () => {
    it("drops Users can view own profile policy on profiles", () => {
      expect(MIGRATION_SQL).toMatch(
        /DROP\s+POLICY\s+IF\s+EXISTS\s+"Users can view own profile"\s+ON\s+public\.profiles/i
      );
    });

    it("drops user_roles_select_own_or_admin policy on user_roles", () => {
      expect(MIGRATION_SQL).toMatch(
        /DROP\s+POLICY\s+IF\s+EXISTS\s+"user_roles_select_own_or_admin"\s+ON\s+public\.user_roles/i
      );
    });

    it("recreates the strict profiles_select_own policy", () => {
      expect(MIGRATION_SQL).toMatch(
        /CREATE\s+POLICY\s+"profiles_select_own"\s+ON\s+public\.profiles/i
      );
    });

    it("recreates the strict profiles_update_own policy", () => {
      expect(MIGRATION_SQL).toMatch(
        /CREATE\s+POLICY\s+"profiles_update_own"\s+ON\s+public\.profiles/i
      );
    });

    it("recreates the strict user_roles_select_own policy", () => {
      expect(MIGRATION_SQL).toMatch(
        /CREATE\s+POLICY\s+"user_roles_select_own"\s+ON\s+public\.user_roles/i
      );
    });

    it("strict policies scope by user_id = auth.uid() OR is_super_admin()", () => {
      expect(MIGRATION_SQL).toMatch(
        /user_id\s*=\s*auth\.uid\(\)\s+OR\s+public\.is_super_admin\(\)/i
      );
    });
  });

  describe("LOW-4 — record_user_logout RPC", () => {
    it("creates record_user_logout function", () => {
      expect(MIGRATION_SQL).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.record_user_logout\(\)/i
      );
    });

    it("uses NOW() server-side (not a client-supplied timestamp)", () => {
      const fnMatch = MIGRATION_SQL.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.record_user_logout\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/
      );
      expect(fnMatch).toBeTruthy();
      expect(fnMatch![1]).toMatch(/SET\s+last_logout_at\s*=\s*NOW\(\)/i);
    });

    it("is SECURITY DEFINER with SET search_path = public", () => {
      const fnMatch = MIGRATION_SQL.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.record_user_logout\(\)[\s\S]*?\$\$/i
      );
      expect(fnMatch).toBeTruthy();
      expect(fnMatch![0]).toMatch(/SECURITY\s+DEFINER/i);
      expect(fnMatch![0]).toMatch(/SET\s+search_path\s*=\s*public/i);
    });

    it("grants EXECUTE to authenticated", () => {
      expect(MIGRATION_SQL).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.record_user_logout\(\)\s+TO\s+authenticated/i
      );
    });

    it("useInactivityTimeout hook calls record_user_logout RPC instead of direct UPDATE", () => {
      expect(INACTIVITY_TS).toMatch(/supabase\.rpc\(["']record_user_logout["']\)/);
      // Should NOT contain the old vulnerable direct update
      expect(INACTIVITY_TS).not.toMatch(
        /from\(["']profiles["']\)\s*\.update\(\s*\{\s*last_logout_at:\s*new\s+Date\(\)/
      );
    });

    it("useInactivityTimeout includes LOW-4 fix comment", () => {
      expect(INACTIVITY_TS).toMatch(/LOW-4\s+fix/i);
    });
  });

  describe("LOW-2 — rotate-test-accounts fail-closed", () => {
    it("returns 500 if CRON_SECRET is unset", () => {
      expect(ROTATE_FN).toMatch(/if\s*\(\s*!cronSecret\s*\)/i);
      expect(ROTATE_FN).toMatch(/status:\s*500/i);
    });

    it("includes LOW-2 fix comment", () => {
      expect(ROTATE_FN).toMatch(/LOW-2\s+fix/i);
    });

    it("does NOT use the old fail-open pattern (if cronSecret && ...)", () => {
      // The old pattern was: if (cronSecret && !timingSafeEqual(...))
      // Now it should be: if (!cronSecret) return 500; ... if (!timingSafeEqual(...))
      expect(ROTATE_FN).not.toMatch(/if\s*\(\s*cronSecret\s*&&\s*!timingSafeEqual/i);
    });
  });

  describe("LOW-3 — send-whatsapp org membership check", () => {
    it("verifies customer_id belongs to caller's org when provided", () => {
      expect(WHATSAPP_FN).toMatch(/customer_id[\s\S]*?from\(['"]customers['"]\)[\s\S]*?eq\(['"]organization_id['"],\s*orgId\)/i);
    });

    it("verifies sale_id belongs to caller's org when provided", () => {
      expect(WHATSAPP_FN).toMatch(/sale_id[\s\S]*?from\(['"]sales['"]\)[\s\S]*?eq\(['"]organization_id['"],\s*orgId\)/i);
    });

    it("verifies store_id belongs to caller's org when provided", () => {
      expect(WHATSAPP_FN).toMatch(/store_id[\s\S]*?from\(['"]stores['"]\)[\s\S]*?eq\(['"]organization_id['"],\s*orgId\)/i);
    });

    it("returns 400 when customer_id is invalid or out of org", () => {
      expect(WHATSAPP_FN).toMatch(/customer_id invalide ou hors organisation/i);
    });

    it("includes LOW-3 fix comment", () => {
      expect(WHATSAPP_FN).toMatch(/LOW-3\s+fix/i);
    });
  });

  describe("MED-7 + LOW-5 — chart.tsx CSP-safe theming", () => {
    it("does NOT use dangerouslySetInnerHTML as JSX attribute anymore (only mentioned in comment)", () => {
      // The old pattern was: <style dangerouslySetInnerHTML={{ __html: ... }} />
      // The new code uses <style>{`...`}</style> which is React-escaped
      // We accept the string appearing in comments but not as a JSX attribute
      expect(CHART_TS).not.toMatch(/<style[\s\S]*?dangerouslySetInnerHTML\s*=\s*\{/i);
    });

    it("includes MED-7 fix comment", () => {
      expect(CHART_TS).toMatch(/MED-7\s+\+\s+LOW-5\s+fix/i);
    });

    it("sanitizes color values with a regex (hex, var(), or keyword)", () => {
      // The code contains the regex /^#[0-9a-fA-F]{3,8}$/ and /^var\(--[a-z0-9-]+\)$/
      // Look for these patterns as literal strings in the source
      expect(CHART_TS).toContain("#[0-9a-fA-F]");
      expect(CHART_TS).toContain("var\\(--[a-z0-9-]");
    });

    it("uses CSS custom properties via style attribute", () => {
      expect(CHART_TS).toMatch(/\-\-color-\$\{key\}/);
    });

    it("render.yaml CSP no longer contains style-src 'unsafe-inline'", () => {
      // Extract the CSP value from render.yaml
      const cspMatch = RENDER_YAML.match(/Content-Security-Policy[\s\S]*?value:\s*"([^"]+)"/);
      expect(cspMatch).toBeTruthy();
      const csp = cspMatch![1];
      // style-src must NOT contain 'unsafe-inline'
      const styleSrcMatch = csp.match(/style-src\s+([^;]+)/);
      expect(styleSrcMatch).toBeTruthy();
      expect(styleSrcMatch![1]).not.toContain("'unsafe-inline'");
      expect(styleSrcMatch![1]).toContain("'self'");
    });
  });

  describe("LOW-6 — Android security hardening", () => {
    it("sets android:allowBackup to false", () => {
      expect(MANIFEST_XML).toMatch(/android:allowBackup="false"/);
      expect(MANIFEST_XML).not.toMatch(/android:allowBackup="true"/);
    });

    it("file_paths.xml uses external-files-path (not external-path with root)", () => {
      // external-path with path="." exposes the entire external storage
      // external-files-path is scoped to the app's private external dir
      expect(FILE_PATHS_XML).toMatch(/external-files-path/i);
      expect(FILE_PATHS_XML).not.toMatch(/<external-path\s+name="my_images"\s+path="\."\s*\/>/i);
    });

    it("file_paths.xml restricts to Pictures/MakitiPlus/ subdirectory", () => {
      expect(FILE_PATHS_XML).toMatch(/Pictures\/MakitiPlus\//i);
    });

    it("file_paths.xml includes LOW-6 fix comment", () => {
      expect(FILE_PATHS_XML).toMatch(/LOW-6\s+fix/i);
    });
  });

  describe("MED-6 — Zod schemas for business forms", () => {
    it("productSchema validates a valid product", () => {
      const valid = {
        name: "Coca-Cola 1L",
        barcode: "1234567890123",
        sale_price: 1500,
        cost_price: 1000,
        stock_quantity: 100,
      };
      const result = productSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("productSchema rejects negative sale_price", () => {
      const invalid = {
        name: "Test",
        sale_price: -100,
        stock_quantity: 10,
      };
      const result = productSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join("; ");
        expect(messages).toMatch(/négatif/i);
      }
    });

    it("productSchema rejects name longer than 200 chars", () => {
      const invalid = {
        name: "x".repeat(201),
        sale_price: 100,
        stock_quantity: 10,
      };
      const result = productSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("productSchema rejects non-numeric stock_quantity", () => {
      const invalid = {
        name: "Test",
        sale_price: 100,
        stock_quantity: "abc" as unknown as number,
      };
      const result = productSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("productSchema rejects barcode with special chars", () => {
      const invalid = {
        name: "Test",
        barcode: "12;34'OR'1",
        sale_price: 100,
        stock_quantity: 10,
      };
      const result = productSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("customerSchema validates a valid customer", () => {
      const valid = {
        name: "Jean Dupont",
        phone: "+224 123 456 789",
        email: "jean@example.com",
      };
      const result = customerSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("customerSchema rejects invalid email", () => {
      const invalid = { name: "Test", email: "not-an-email" };
      const result = customerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("customerSchema rejects phone with letters", () => {
      const invalid = { name: "Test", phone: "abc123" };
      const result = customerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("stockAdjustmentSchema requires reason", () => {
      const invalid = {
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        new_quantity: 50,
        reason: "",
      };
      const result = stockAdjustmentSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("stockAdjustmentSchema rejects negative quantity", () => {
      const invalid = {
        product_id: "123e4567-e89b-12d3-a456-426614174000",
        new_quantity: -5,
        reason: "Test",
      };
      const result = stockAdjustmentSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("creditPaymentSchema rejects zero amount", () => {
      const invalid = {
        customer_id: "123e4567-e89b-12d3-a456-426614174000",
        amount: 0,
        payment_method: "cash" as const,
      };
      const result = creditPaymentSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("creditPaymentSchema rejects invalid payment_method", () => {
      const invalid = {
        customer_id: "123e4567-e89b-12d3-a456-426614174000",
        amount: 100,
        payment_method: "cryptocurrency" as unknown as "cash",
      };
      const result = creditPaymentSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validateForm helper returns formatted errors", () => {
      const result = validateForm(productSchema, { name: "", sale_price: -1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(Object.keys(result.errors).length).toBeGreaterThan(0);
      }
    });

    it("validateForm helper returns parsed data on success", () => {
      const result = validateForm(productSchema, {
        name: "Test",
        sale_price: 100,
        stock_quantity: 10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Test");
      }
    });
  });

  describe("Migration safety", () => {
    it("does not contain DELETE FROM / TRUNCATE / DROP TABLE", () => {
      expect(MIGRATION_SQL).not.toMatch(/DELETE\s+FROM\s+public\.\w+\s+WHERE/i);
      expect(MIGRATION_SQL).not.toMatch(/TRUNCATE/i);
      expect(MIGRATION_SQL).not.toMatch(/DROP\s+TABLE/i);
    });

    it("uses SET search_path = public on all SECURITY DEFINER functions", () => {
      const securityDefinerCount = (MIGRATION_SQL.match(/SECURITY\s+DEFINER/gi) || []).length;
      const setSearchPathCount = (MIGRATION_SQL.match(/SET\s+search_path\s*=\s*public/gi) || []).length;
      expect(securityDefinerCount).toBeGreaterThan(0);
      expect(setSearchPathCount).toBeGreaterThanOrEqual(securityDefinerCount);
    });

    it("uses idempotent DO $$ ... END $$ for ENUM creation", () => {
      expect(MIGRATION_SQL).toMatch(/DO\s+\$\$[\s\S]*?CREATE\s+TYPE[\s\S]*?END\s+\$\$/i);
    });
  });
});
