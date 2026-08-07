import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * "J'ai toujours le super admin que je vois dans la liste déroulante
 * dans l'onglet clôture" -- bug rapporté avec capture d'écran sur le
 * compte réel Diallo & Frères (le super_admin de la plateforme,
 * "Ousmane Kaba", visible dans le filtre "Vendeur" de CashClosing.tsx
 * par l'admin du magasin).
 *
 * Cause racine trouvée : profiles_select_scoped et admins_view_audit_log
 * excluaient un super_admin via
 *   NOT (user_id IN (SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'super_admin'))
 * Cette sous-requête sur user_roles s'exécute avec le contexte RLS de
 * L'APPELANT -- or user_roles_select_scoped (20260724120000) exclut déjà
 * les lignes role=super_admin de ce qu'un admin peut voir. Pour un admin,
 * la sous-requête renvoie donc TOUJOURS un ensemble vide, et
 * NOT (user_id IN (ensemble vide)) est TOUJOURS vrai -- la clause
 * d'exclusion ne filtrait jamais rien, malgré l'intention explicite du
 * code (migrations 20260715100000/20260715120000).
 *
 * Vérifié en direct sur la base réelle (transaction BEGIN/ROLLBACK,
 * simulant DIALLO mamadou/admin) : avant le fix, non testé isolément
 * (bug déjà confirmé par capture d'écran) ; après le fix,
 * super_admin_still_visible = false, own_profile_visible = true.
 */

const migrationSql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260801010000_fix_rls_super_admin_hiding_self_defeating_subquery.sql"),
  "utf-8"
);

const cashClosingSrc = fs.readFileSync(
  path.join(process.cwd(), "src/pages/CashClosing.tsx"),
  "utf-8"
);

describe("Migration 20260801010000 — is_user_super_admin bypass RLS", () => {
  it("crée une fonction SECURITY DEFINER pour vérifier un rôle sans dépendre de la visibilité RLS de l'appelant", () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_user_super_admin\(_user_id uuid\)/);
    expect(migrationSql).toMatch(/SECURITY DEFINER/);
  });

  it("profiles_select_scoped n'utilise plus la sous-requête cassée (NOT IN sur user_roles)", () => {
    const policyBlock = migrationSql.match(
      /CREATE POLICY "profiles_select_scoped"[\s\S]*?\);/
    )?.[0] ?? "";
    expect(policyBlock).toMatch(/NOT public\.is_user_super_admin\(user_id\)/);
    expect(policyBlock).not.toMatch(/NOT \(user_id IN/);
  });

  it("admins_view_audit_log n'utilise plus la sous-requête cassée non plus", () => {
    const policyBlock = migrationSql.match(
      /CREATE POLICY "admins_view_audit_log"[\s\S]*?\);/
    )?.[0] ?? "";
    expect(policyBlock).toMatch(/NOT public\.is_user_super_admin\(actor_id\)/);
    expect(policyBlock).not.toMatch(/NOT \(actor_id IN/);
  });

  it("chaque policy corrigée est précédée d'un DROP POLICY IF EXISTS (remplacement propre)", () => {
    const profilesDropIndex = migrationSql.indexOf('DROP POLICY IF EXISTS "profiles_select_scoped"');
    const profilesCreateIndex = migrationSql.indexOf('CREATE POLICY "profiles_select_scoped"');
    expect(profilesDropIndex).toBeGreaterThan(-1);
    expect(profilesDropIndex).toBeLessThan(profilesCreateIndex);

    const auditDropIndex = migrationSql.indexOf('DROP POLICY IF EXISTS "admins_view_audit_log"');
    const auditCreateIndex = migrationSql.indexOf('CREATE POLICY "admins_view_audit_log"');
    expect(auditDropIndex).toBeGreaterThan(-1);
    expect(auditDropIndex).toBeLessThan(auditCreateIndex);
  });

  it("ne contient aucune instruction destructive", () => {
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migrationSql).not.toMatch(/DROP\s+TABLE/i);
  });
});

describe("CashClosing.tsx — filtre Vendeur limité à POS_ROLES (admin/manager/vendeur)", () => {
  // MISE À JOUR audit final hardening (2e prompt, P1, 2026-08-07) : cette
  // jointure profiles + user_roles côté client a été déplacée dans le RPC
  // serveur get_cash_closing_operators (migration
  // 20260807010000_add_get_cash_closing_operators_rpc.sql), couvert en
  // détail par src/test/cashClosingOperatorsRpcRegression.test.ts. Ce test
  // vérifie désormais que le frontend délègue bien au RPC et que le filtre
  // de rôle admin/manager/vendeur existe côté serveur, sans plus dépendre
  // de la présence du code client historique.
  const operatorsRpcMigration = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260807010000_add_get_cash_closing_operators_rpc.sql"),
    "utf-8"
  );

  it("délègue au RPC serveur get_cash_closing_operators plutôt que de reconstruire la liste via profiles + user_roles côté client", () => {
    expect(cashClosingSrc).toMatch(/supabase\.rpc\(["']get_cash_closing_operators["']/);
    expect(operatorsRpcMigration).toMatch(/ur\.role IN \('admin', 'manager', 'vendeur'\)/);
  });

  it("ne filtre plus uniquement sur un simple .select sans rôle", () => {
    expect(cashClosingSrc).not.toMatch(/supabase\.from\("profiles"\)\.select\("user_id, owner_name"\);\s*\n\s*if \(error\) return \[\];\s*\n\s*return data \?\? \[\];/);
  });
});
