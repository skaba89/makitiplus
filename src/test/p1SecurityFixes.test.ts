/**
 * Tests de non-régression sécurité — Palier 1 (AUDIT-2026-007)
 *
 * Valide que les correctifs des 4 findings P1 sont effectifs :
 *   • CRIT-1  : Self-grant super_admin via register_user "first admin"
 *   • HIGH-1  : register_user avec p_organization_id IS NULL
 *   • HIGH-3  : stripe_events policy sans clause TO
 *   • HIGH-4  : is_org_admin() non définie
 *
 * Ces tests ne peuvent pas réellement exploiter Supabase (pas de DB
 * dans le runner Vitest), mais ils valident la STRUCTURE de la migration
 * SQL — présence des clauses de sécurité attendues.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  __dirname,
  '../../supabase/migrations/20260708000000_p1_security_fixes.sql'
);

const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf-8');

describe('P1 Security Fixes — AUDIT-2026-007', () => {
  describe('Migration file', () => {
    it('exists and is readable', () => {
      expect(MIGRATION_SQL).toBeTruthy();
      expect(MIGRATION_SQL.length).toBeGreaterThan(1000);
    });

    it('references all 4 findings by ID in comments', () => {
      expect(MIGRATION_SQL).toContain('CRIT-1');
      expect(MIGRATION_SQL).toContain('HIGH-1');
      expect(MIGRATION_SQL).toContain('HIGH-3');
      expect(MIGRATION_SQL).toContain('HIGH-4');
    });
  });

  describe('CRIT-1 + HIGH-1 — register_user patch', () => {
    it('checks admin_exists() before allowing first admin path', () => {
      // The fix must include an admin_exists() check on the first-admin path
      expect(MIGRATION_SQL).toMatch(/IF\s+v_is_first_admin\s+THEN[\s\S]*?admin_exists\(\)/i);
    });

    it('raises an exception when an admin already exists', () => {
      expect(MIGRATION_SQL).toMatch(/RAISE\s+EXCEPTION.*admin.*existe/i);
    });

    it('restricts p_role to non-admin when p_organization_id IS NULL (HIGH-1)', () => {
      // When p_organization_id IS NULL, the role must not be admin/super_admin
      expect(MIGRATION_SQL).toMatch(/IF\s+p_organization_id\s+IS\s+NULL\s+THEN[\s\S]*?Rôle\s+non\s+autorisé/i);
    });

    it('blocks non-super_admin from creating super_admin', () => {
      expect(MIGRATION_SQL).toMatch(/seul\s+un\s+super_admin\s+peut\s+créer\s+un\s+autre\s+super_admin/i);
    });

    it('forces first admin role to be admin or super_admin', () => {
      expect(MIGRATION_SQL).toMatch(/premier\s+admin\s+doit\s+avoir\s+le\s+rôle.*admin.*super_admin/i);
    });

    it('uses ON CONFLICT for idempotent inserts', () => {
      expect(MIGRATION_SQL).toContain('ON CONFLICT (user_id) DO NOTHING');
      expect(MIGRATION_SQL).toContain('ON CONFLICT (user_id) DO UPDATE');
    });

    it('drops existing function before recreating (idempotent)', () => {
      expect(MIGRATION_SQL).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS/i);
    });
  });

  describe('HIGH-3 — stripe_events policy patch', () => {
    it('drops the old permissive policy', () => {
      expect(MIGRATION_SQL).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS\s+stripe_events_service_role/i);
    });

    it('recreates the policy with TO service_role clause', () => {
      // The fix must include "TO service_role" on the new policy
      expect(MIGRATION_SQL).toMatch(/CREATE\s+POLICY\s+stripe_events_service_role[\s\S]*?TO\s+service_role/i);
    });

    it('does NOT remove the select_authenticated policy (still needed for audit reads)', () => {
      expect(MIGRATION_SQL).not.toMatch(/DROP\s+POLICY.*stripe_events_select_authenticated/i);
    });
  });

  describe('HIGH-4 — is_org_admin() function creation', () => {
    it('creates the function with the expected signature', () => {
      expect(MIGRATION_SQL).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.is_org_admin\(\)/i);
    });

    it('returns boolean', () => {
      expect(MIGRATION_SQL).toMatch(/is_org_admin\(\)[\s\S]*?RETURNS\s+boolean/i);
    });

    it('uses SECURITY DEFINER (bypasses RLS to read user_roles)', () => {
      expect(MIGRATION_SQL).toMatch(/is_org_admin[\s\S]*?SECURITY\s+DEFINER/i);
    });

    it('is STABLE (can be cached within a transaction)', () => {
      expect(MIGRATION_SQL).toMatch(/is_org_admin[\s\S]*?STABLE/i);
    });

    it('checks role IN (admin, super_admin)', () => {
      expect(MIGRATION_SQL).toMatch(/role\s+IN\s+\('admin',\s+'super_admin'\)/i);
    });

    it('grants EXECUTE to authenticated and service_role', () => {
      expect(MIGRATION_SQL).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_org_admin\(\)\s+TO\s+authenticated,\s+service_role/i);
    });

    it('uses auth.uid() server-side (not a client-provided param)', () => {
      expect(MIGRATION_SQL).toMatch(/is_org_admin[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i);
    });
  });

  describe('Migration safety', () => {
    it('does not contain dangerous patterns (DELETE FROM, TRUNCATE, DROP TABLE)', () => {
      // The migration should NOT destroy data
      expect(MIGRATION_SQL).not.toMatch(/DELETE\s+FROM\s+public\./i);
      expect(MIGRATION_SQL).not.toMatch(/TRUNCATE/i);
      expect(MIGRATION_SQL).not.toMatch(/DROP\s+TABLE/i);
    });

    it('uses SET search_path = public on SECURITY DEFINER functions', () => {
      // Critical: without this, functions are vulnerable to search_path hijacking
      const securityDefinerBlocks = MIGRATION_SQL.match(/SECURITY\s+DEFINER[\s\S]*?\$\$/g) || [];
      expect(securityDefinerBlocks.length).toBeGreaterThanOrEqual(2);
      securityDefinerBlocks.forEach((block) => {
        // Each SECURITY DEFINER block must have SET search_path = public nearby
        // (either in the function signature or in the function body)
        const surroundingText = MIGRATION_SQL.substring(
          Math.max(0, MIGRATION_SQL.indexOf(block) - 200),
          MIGRATION_SQL.indexOf(block) + block.length + 50
        );
        expect(surroundingText).toMatch(/SET\s+search_path\s*=\s*public/i);
      });
    });

    it('includes verification queries as comments', () => {
      expect(MIGRATION_SQL).toMatch(/--.*SELECT.*is_org_admin/i);
      expect(MIGRATION_SQL).toMatch(/pg_policy[\s\S]*stripe_events/i);
    });
  });
});
