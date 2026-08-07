import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Audit final hardening (2e prompt, P1) : le filtre "Vendeur" de
 * CashClosing.tsx est désormais construit côté serveur via le RPC
 * get_cash_closing_operators, scopé organisation et filtré à
 * admin/manager/vendeur en SQL -- remplace l'ancienne jointure
 * profiles + user_roles faite côté client (elle-même déjà corrigée le
 * 2026-08-01, PR #59, pour ne plus laisser passer super_admin/comptable
 * par un fallback implicite).
 *
 * Vérifié par analyse statique de la migration SQL + du frontend, et par
 * un test live (BEGIN/ROLLBACK contre les vraies données Diallo &
 * Frères) exécuté manuellement avant application -- documenté dans le
 * message de commit, non reproductible ici sans connexion DB.
 */

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260807010000_add_get_cash_closing_operators_rpc.sql"
);
const migrationSql = fs.readFileSync(migrationPath, "utf-8");
const cashClosingTsx = fs.readFileSync(path.join(root, "src/pages/CashClosing.tsx"), "utf-8");

describe("Migration get_cash_closing_operators — sécurité et scope", () => {
  it("la fonction existe et est SECURITY DEFINER avec search_path fixé", () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_closing_operators/);
    expect(migrationSql).toMatch(/SECURITY DEFINER/);
    expect(migrationSql).toMatch(/SET search_path TO 'public'/);
  });

  it("filtre strictement sur admin/manager/vendeur (jamais super_admin ni comptable)", () => {
    expect(migrationSql).toMatch(/ur\.role IN \('admin', 'manager', 'vendeur'\)/);
    expect(migrationSql).not.toMatch(/'super_admin'/);
    expect(migrationSql).not.toMatch(/'comptable'/);
  });

  it("scope explicitement par p.organization_id = p_organization_id (pas de fuite inter-tenant)", () => {
    expect(migrationSql).toMatch(/p\.organization_id = p_organization_id/);
  });

  it("lève une exception explicite (jamais un [] silencieux) si p_organization_id est NULL", () => {
    expect(migrationSql).toMatch(/IF p_organization_id IS NULL THEN\s*\n\s*RAISE EXCEPTION/);
  });

  it("lève une exception 42501 explicite si l'appelant n'est ni super_admin ni membre de l'organisation demandée", () => {
    expect(migrationSql).toMatch(/RAISE EXCEPTION[^;]*ERRCODE = '42501'/);
    expect(migrationSql).toMatch(/is_super_admin\(\)/);
    expect(migrationSql).toMatch(/get_user_organization_id\(\) = p_organization_id/);
  });

  it("le droit d'exécution est accordé au rôle authenticated", () => {
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_cash_closing_operators\(uuid\) TO authenticated/);
  });

  it("n'utilise aucune instruction destructive (TRUNCATE, DROP non gardé)", () => {
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/DROP\s+TABLE\s+(?!IF\s+NOT)/i);
  });
});

describe("CashClosing.tsx — utilisation du RPC get_cash_closing_operators", () => {
  it("appelle le RPC avec effectiveOrgId, plus de jointure profiles + user_roles côté client", () => {
    expect(cashClosingTsx).toMatch(/supabase\.rpc\(["']get_cash_closing_operators["'],\s*\{\s*\n\s*p_organization_id:\s*effectiveOrgId/);
    expect(cashClosingTsx).not.toMatch(/supabase\.from\(["']user_roles["']\)\.select\(["']user_id, role["']\)/);
  });

  it("une erreur RPC n'est jamais masquée en [] silencieux (P0.3) — elle est levée et surfacée dans l'UI", () => {
    expect(cashClosingTsx).toMatch(/RPC get_cash_closing_operators failed/);
    expect(cashClosingTsx).toMatch(/orgProfilesError/);
  });

  it("le hook n'est activé que pour les reviewers/audit (pas pour un simple vendeur)", () => {
    expect(cashClosingTsx).toMatch(
      /enabled:\s*!!user\s*&&\s*!!effectiveOrgId\s*&&\s*\(isReviewer\s*\|\|\s*isReadOnlyAudit\)/
    );
  });
});
