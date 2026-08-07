import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Audit final hardening 2026-08-01, section P0.5 : trip-wire dédié à
 * CashClosing.tsx pour empêcher la réapparition du bug rapporté avec
 * capture d'écran (le super_admin visible dans le filtre "Vendeur" de
 * Clôture de Caisse) -- corrigé le 2026-08-01 (migration
 * 20260801010000_fix_rls_super_admin_hiding_self_defeating_subquery.sql
 * + fallback "?? vendeur" retiré côté frontend).
 *
 * MISE À JOUR audit final hardening (2e prompt, P1, 2026-08-07) : le
 * filtre de rôle a été déplacé côté serveur dans le RPC
 * get_cash_closing_operators (migration
 * 20260807010000_add_get_cash_closing_operators_rpc.sql) -- CashClosing.tsx
 * n'exécute plus lui-même la jointure profiles + user_roles, il appelle le
 * RPC scopé organisation. Ce test vérifie donc désormais que (a) le RPC SQL
 * exclut bien super_admin/comptable et (b) le frontend appelle ce RPC
 * plutôt que de reconstruire la liste lui-même.
 *
 * Ce fichier est volontairement distinct de src/test/rlsSuperAdminHidingFix.test.ts
 * (qui documente le fix historique lui-même) et de
 * src/test/cashClosingOperatorsRpcRegression.test.ts (qui couvre le RPC en
 * détail) : celui-ci reste le garde-fou nommé comme demandé par l'audit
 * P0.5, pour qu'une future modification ne puisse pas réintroduire
 * silencieusement le bug sans faire échouer un test au nom explicite.
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
const cashClosingSrc = readNormalized(path.join(process.cwd(), "src/pages/CashClosing.tsx"));
const operatorsRpcMigration = readNormalized(
  path.join(process.cwd(), "supabase/migrations/20260807010000_add_get_cash_closing_operators_rpc.sql")
);

describe("CashClosing.tsx — le super_admin ne doit jamais réapparaître dans le filtre Vendeur", () => {
  it("le RPC get_cash_closing_operators exclut explicitement tout rôle hors admin/manager/vendeur", () => {
    expect(operatorsRpcMigration).toMatch(/ur\.role IN \('admin', 'manager', 'vendeur'\)/);
    expect(operatorsRpcMigration).not.toMatch(/'super_admin'/);
    expect(operatorsRpcMigration).not.toMatch(/'comptable'/);
  });

  it("aucun fallback ne fait passer un rôle non résolu (potentiellement un super_admin masqué par la RLS) pour un vendeur", () => {
    // Le bug corrigé le 2026-08-01 : `roleByUserId.get(p.user_id) ?? "vendeur"` faisait
    // passer un rôle introuvable (super_admin masqué par user_roles_select_scoped) comme
    // "vendeur" par défaut, donc visible dans le filtre. Le RPC serveur ne fait plus de
    // résolution optionnelle : le INNER JOIN + IN (...) exclut par construction toute ligne
    // dont le rôle n'est pas explicitement admin/manager/vendeur.
    expect(cashClosingSrc).not.toMatch(/roleByUserId\.get\([^)]*\)\s*\?\?\s*["']vendeur["']/);
    expect(operatorsRpcMigration).not.toMatch(/COALESCE\([^)]*,\s*'vendeur'\)/);
  });

  it("CashClosing.tsx délègue désormais au RPC serveur, plus de jointure profiles + user_roles côté client", () => {
    expect(cashClosingSrc).toMatch(/supabase\.rpc\(["']get_cash_closing_operators["']/);
    expect(cashClosingSrc).not.toMatch(/supabase\.from\("user_roles"\)\.select\("user_id, role"\)/);
  });
});
