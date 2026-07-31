import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * "On ne doit pas voir l'user super admin dans la liste des vendeurs
 * sauf l'administrateur du magasin, le manager et les vendeurs qui
 * peuvent vendre" — la liste des vendeurs ne doit montrer que
 * POS_ROLES (src/types/index.ts : admin, manager, vendeur), jamais
 * super_admin ni comptable (aucun accès POS, jamais de vente).
 *
 * get_seller_performance (SellerActivity.tsx) excluait déjà super_admin
 * (20260711060000) mais laissait passer comptable.
 * get_seller_kpis_detailed (SellerKpisCard.tsx sur Reports.tsx) n'excluait
 * RIEN -- n'importe quel profil avec une vente sur la période apparaissait,
 * y compris super_admin/comptable si l'un d'eux en enregistrait une un jour.
 */

const migrationSql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260731030000_seller_lists_exclude_non_selling_roles.sql"),
  "utf-8"
);

describe("Migration 20260731030000 — get_seller_performance", () => {
  it("filtre par allowlist positive (admin/manager/vendeur), pas par exclusion négative", () => {
    const fnBody = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.get_seller_performance[\s\S]*?\$\$;/
    )?.[0] ?? "";
    expect(fnBody).toMatch(/COALESCE\(ur\.role::TEXT, 'vendeur'\) IN \('admin', 'manager', 'vendeur'\)/);
    // L'ancien pattern NOT EXISTS(... = 'super_admin') a bien été retiré
    expect(fnBody).not.toMatch(/NOT EXISTS/);
  });

  it("ne change pas la signature de la fonction (pas de nouveau paramètre)", () => {
    const sig = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.get_seller_performance\(([\s\S]*?)\)\s*\nRETURNS/
    )?.[1] ?? "";
    expect(sig).toMatch(/p_period_start TIMESTAMPTZ DEFAULT NULL/);
    expect(sig).toMatch(/p_period_end TIMESTAMPTZ DEFAULT NULL/);
    expect(sig.split(",").length).toBe(2);
  });
});

describe("Migration 20260731030000 — get_seller_kpis_detailed", () => {
  it("ajoute un filtre de rôle qui n'existait pas avant", () => {
    const fnBody = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.get_seller_kpis_detailed[\s\S]*?\$\$;/
    )?.[0] ?? "";
    expect(fnBody).toMatch(/ur\.role::TEXT IN \('admin', 'manager', 'vendeur'\)/);
  });

  it("conserve le scoping org existant (v_org_id, is_super_admin) — pas de régression sécurité", () => {
    const fnBody = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.get_seller_kpis_detailed[\s\S]*?\$\$;/
    )?.[0] ?? "";
    expect(fnBody).toMatch(/IF public\.is_super_admin\(\) THEN/);
    expect(fnBody).toMatch(/v_org_id := public\.get_user_organization_id\(\);/);
    expect(fnBody).toMatch(/\(v_org_id IS NULL OR p\.organization_id = v_org_id\)/);
  });
});

describe("Migration 20260731030000 — additive, pas de DROP requis", () => {
  it("ne contient aucune instruction destructive", () => {
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migrationSql).not.toMatch(/DROP\s+TABLE/i);
    expect(migrationSql).not.toMatch(/DROP\s+FUNCTION/i);
  });

  it("les GRANT EXECUTE couvrent les deux fonctions sans changement de signature", () => {
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_seller_performance\(TIMESTAMPTZ, TIMESTAMPTZ\) TO authenticated;/);
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_seller_kpis_detailed\(TEXT, UUID\) TO authenticated;/);
  });
});
