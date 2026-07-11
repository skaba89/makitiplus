/**
 * Tests de non-régression sécurité — Palier 2 (AUDIT-2026-007)
 *
 * Valide que les correctifs des 4 findings P2 sont effectifs :
 *   • HIGH-2 : Cross-tenant via get_supplier_stats / get_supplier_with_products
 *   • MED-3  : whatsapp_config et whatsapp_message_logs non créés
 *   • MED-4  : restore_backup : injection SQL potentielle
 *   • MED-5  : admin-send-reset-link redirectTo client-controlled
 *
 * Comme pour P1, on valide la STRUCTURE de la migration et de l'edge function.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  __dirname,
  '../../supabase/migrations/20260708010000_p2_security_fixes.sql'
);
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf-8');

const EDGE_FUNCTION_PATH = join(
  __dirname,
  '../../supabase/functions/admin-send-reset-link/index.ts'
);
const EDGE_FUNCTION_TS = readFileSync(EDGE_FUNCTION_PATH, 'utf-8');

describe('P2 Security Fixes — AUDIT-2026-007', () => {
  describe('Migration file', () => {
    it('exists and is readable', () => {
      expect(MIGRATION_SQL).toBeTruthy();
      expect(MIGRATION_SQL.length).toBeGreaterThan(1000);
    });

    it('references all 4 findings by ID in comments', () => {
      expect(MIGRATION_SQL).toContain('HIGH-2');
      expect(MIGRATION_SQL).toContain('MED-3');
      expect(MIGRATION_SQL).toContain('MED-4');
      // MED-5 is patched in the edge function, not the migration
      expect(MIGRATION_SQL).toContain('MED-5');
    });
  });

  describe('HIGH-2 — Supplier RPCs cross-tenant fix', () => {
    it('drops the old get_supplier_stats(UUID) signature', () => {
      expect(MIGRATION_SQL).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS/i);
      expect(MIGRATION_SQL).toMatch(/get_supplier_stats/i);
    });

    it('recreates get_supplier_stats with NO parameter', () => {
      expect(MIGRATION_SQL).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_supplier_stats\(\)/i);
    });

    it('uses get_user_organization_id() inside get_supplier_stats body', () => {
      // The function body must call public.get_user_organization_id() server-side
      const statsFnMatch = MIGRATION_SQL.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_supplier_stats\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/
      );
      expect(statsFnMatch).toBeTruthy();
      expect(statsFnMatch![1]).toMatch(/get_user_organization_id\(\)/);
    });

    it('recreates get_supplier_with_products with only p_supplier_id parameter', () => {
      expect(MIGRATION_SQL).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_supplier_with_products\(p_supplier_id\s+UUID\)/i
      );
    });

    it('removes p_organization_id parameter from get_supplier_with_products', () => {
      // The new signature must NOT accept p_organization_id
      const match = MIGRATION_SQL.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_supplier_with_products\(([^)]+)\)/
      );
      expect(match).toBeTruthy();
      expect(match![1].toLowerCase()).not.toContain('p_organization_id');
    });

    it('uses get_user_organization_id() inside get_supplier_with_products body', () => {
      const fnMatch = MIGRATION_SQL.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_supplier_with_products\(p_supplier_id\s+UUID\)[\s\S]*?\$\$([\s\S]*?)\$\$/
      );
      expect(fnMatch).toBeTruthy();
      expect(fnMatch![1]).toMatch(/get_user_organization_id\(\)/);
    });

    it('filters suppliers by v_org_id (server-side) not p_organization_id', () => {
      const fnMatch = MIGRATION_SQL.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_supplier_with_products\(p_supplier_id\s+UUID\)[\s\S]*?\$\$([\s\S]*?)\$\$/
      );
      expect(fnMatch).toBeTruthy();
      const body = fnMatch![1];
      // WHERE clause must use v_org_id (server-side), not p_organization_id (client)
      expect(body).toMatch(/s\.organization_id\s*=\s*v_org_id/);
      expect(body).toMatch(/sp\.organization_id\s*=\s*v_org_id/);
    });

    it('returns NULL if user has no organization', () => {
      const fnMatch = MIGRATION_SQL.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_supplier_stats\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/
      );
      expect(fnMatch).toBeTruthy();
      expect(fnMatch![1]).toMatch(/v_org_id\s+IS\s+NULL/);
    });
  });

  describe('MED-3 — whatsapp tables creation', () => {
    it('creates whatsapp_config table', () => {
      expect(MIGRATION_SQL).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.whatsapp_config/i);
    });

    it('creates whatsapp_message_logs table', () => {
      expect(MIGRATION_SQL).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.whatsapp_message_logs/i);
    });

    it('whatsapp_config has organization_id FK to organizations', () => {
      const configMatch = MIGRATION_SQL.match(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.whatsapp_config[\s\S]*?\);/
      );
      expect(configMatch).toBeTruthy();
      expect(configMatch![0]).toMatch(/organization_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.organizations/i);
    });

    it('whatsapp_message_logs has organization_id FK to organizations', () => {
      const logsMatch = MIGRATION_SQL.match(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.whatsapp_message_logs[\s\S]*?\);/
      );
      expect(logsMatch).toBeTruthy();
      expect(logsMatch![0]).toMatch(/organization_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.organizations/i);
    });

    it('enables FORCE ROW LEVEL SECURITY on both tables', () => {
      expect(MIGRATION_SQL).toMatch(/ALTER\s+TABLE\s+public\.whatsapp_config\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
      expect(MIGRATION_SQL).toMatch(/ALTER\s+TABLE\s+public\.whatsapp_message_logs\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
    });

    it('whatsapp_config SELECT policy scopes by get_user_organization_id()', () => {
      // Find the policy block and check it contains the server-side org check
      const policyBlockMatch = MIGRATION_SQL.match(
        /CREATE\s+POLICY\s+whatsapp_config_select_own[\s\S]*?;/i
      );
      expect(policyBlockMatch).toBeTruthy();
      expect(policyBlockMatch![0]).toMatch(/organization_id\s*=\s*public\.get_user_organization_id\(\)/);
    });

    it('whatsapp_message_logs restricts writes to service_role (no INSERT policy for authenticated)', () => {
      // The migration should NOT create an INSERT/UPDATE/DELETE policy for authenticated
      // on whatsapp_message_logs (only service_role bypasses RLS to write)
      const logsPolicies = MIGRATION_SQL.match(
        /CREATE\s+POLICY\s+whatsapp_message_logs[\s\S]*?;/gi
      ) || [];
      expect(logsPolicies.length).toBeGreaterThanOrEqual(1);
      // Ensure none of the policies allow writes from authenticated
      const allLogsPolicies = logsPolicies.join('\n');
      expect(allLogsPolicies).not.toMatch(/FOR\s+INSERT/i);
      expect(allLogsPolicies).not.toMatch(/FOR\s+UPDATE/i);
      expect(allLogsPolicies).not.toMatch(/FOR\s+DELETE/i);
    });
  });

  describe('MED-4 — restore_backup column escaping helper', () => {
    it('creates validate_backup_columns function', () => {
      expect(MIGRATION_SQL).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.validate_backup_columns/i);
    });

    it('uses format(\'%I\', col_name) for escaping column names', () => {
      expect(MIGRATION_SQL).toMatch(/format\('%I',\s*v_col\)/i);
    });

    it('validates column existence against information_schema.columns', () => {
      expect(MIGRATION_SQL).toMatch(/information_schema\.columns/i);
      expect(MIGRATION_SQL).toMatch(/table_name\s*=\s*p_table_name/i);
      expect(MIGRATION_SQL).toMatch(/column_name\s*=\s*v_col/i);
    });

    it('skips unknown columns with a NOTICE (defense-in-depth)', () => {
      expect(MIGRATION_SQL).toMatch(/RAISE\s+NOTICE.*Colonne\s+ignorée/i);
    });

    it('grants EXECUTE to authenticated and service_role', () => {
      expect(MIGRATION_SQL).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.validate_backup_columns\(TEXT,\s*TEXT\[\]\)\s+TO\s+authenticated,\s*service_role/i
      );
    });
  });

  describe('MED-5 — admin-send-reset-link origin validation', () => {
    it('imports validateOrigin from _shared/cors', () => {
      expect(EDGE_FUNCTION_TS).toMatch(/import.*validateOrigin.*from.*'\.\.\/_shared\/cors\.ts'/);
    });

    it('does NOT use req.headers.get(\'origin\') directly anymore', () => {
      // The old vulnerable pattern was: const origin = req.headers.get('origin') ?? redirectTo ?? '';
      expect(EDGE_FUNCTION_TS).not.toMatch(/req\.headers\.get\(['"]origin['"]\)/);
    });

    it('does NOT destructure redirectTo from body anymore', () => {
      const bodyMatch = EDGE_FUNCTION_TS.match(/const\s*\{\s*([^}]+)\s*\}\s*=\s*body/);
      expect(bodyMatch).toBeTruthy();
      const destructured = bodyMatch![1];
      expect(destructured).not.toMatch(/\bredirectTo\b/);
    });

    it('uses validateOrigin(req) for the email channel', () => {
      // Look for validateOrigin call before generateLink
      const emailBlockMatch = EDGE_FUNCTION_TS.match(
        /EMAIL\s+channel[\s\S]*?generateLink[\s\S]*?\}\)/
      );
      expect(emailBlockMatch).toBeTruthy();
      expect(emailBlockMatch![0]).toMatch(/validateOrigin\(req\)/);
    });

    it('uses validateOrigin(req) for the SMS channel', () => {
      // Look for validateOrigin call before sendSmsViaTwilio
      const smsBlockMatch = EDGE_FUNCTION_TS.match(
        /MED-5\s+fix[\s\S]*?sendSmsViaTwilio/
      );
      expect(smsBlockMatch).toBeTruthy();
      expect(smsBlockMatch![0]).toMatch(/validateOrigin\(req\)/);
    });

    it('includes a comment referencing MED-5 fix', () => {
      expect(EDGE_FUNCTION_TS).toMatch(/MED-5\s+fix/i);
    });
  });

  describe('Migration safety', () => {
    it('does not contain dangerous patterns (DELETE FROM, TRUNCATE, DROP TABLE)', () => {
      expect(MIGRATION_SQL).not.toMatch(/DELETE\s+FROM\s+public\.\w+\s+WHERE/i);
      expect(MIGRATION_SQL).not.toMatch(/TRUNCATE/i);
      expect(MIGRATION_SQL).not.toMatch(/DROP\s+TABLE/i);
    });

    it('uses SET search_path = public on all SECURITY DEFINER functions', () => {
      // Count SECURITY DEFINER blocks
      const securityDefinerBlocks = MIGRATION_SQL.match(/SECURITY\s+DEFINER/gi) || [];
      expect(securityDefinerBlocks.length).toBeGreaterThanOrEqual(3);
      // Each function with SECURITY DEFINER should have SET search_path = public nearby
      // (we check this loosely — the migration should contain at least 3 SET search_path = public)
      const setSearchPathMatches = MIGRATION_SQL.match(/SET\s+search_path\s*=\s*public/gi) || [];
      expect(setSearchPathMatches.length).toBeGreaterThanOrEqual(3);
    });

    it('uses ON DELETE CASCADE for org FKs (so deleting an org cleans up whatsapp tables)', () => {
      expect(MIGRATION_SQL).toMatch(/REFERENCES\s+public\.organizations\(id\)\s+ON\s+DELETE\s+CASCADE/i);
    });

    it('creates appropriate indexes on whatsapp tables', () => {
      expect(MIGRATION_SQL).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_whatsapp_config_org/i);
      expect(MIGRATION_SQL).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_whatsapp_message_logs_org/i);
    });
  });
});
