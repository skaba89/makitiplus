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
 * Ce fichier est volontairement distinct de src/test/rlsSuperAdminHidingFix.test.ts
 * (qui documente le fix historique lui-même) : celui-ci reste un garde-fou
 * permanent et ciblé sur CashClosing.tsx, nommé comme demandé par l'audit
 * P0.5, pour qu'une future modification de ce fichier précis ne puisse pas
 * réintroduire silencieusement le bug sans faire échouer un test au nom
 * explicite.
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
const cashClosingSrc = readNormalized(path.join(process.cwd(), "src/pages/CashClosing.tsx"));

describe("CashClosing.tsx — le super_admin ne doit jamais réapparaître dans le filtre Vendeur", () => {
  it("le filtre des profils de l'organisation exclut explicitement tout rôle hors admin/manager/vendeur", () => {
    const queryFnBlock = cashClosingSrc.match(
      /queryFn: async \(\): Promise<\{ user_id: string; owner_name: string \}\[\]> => \{[\s\S]*?\},\s*\n\s*enabled:/
    )?.[0] ?? "";
    expect(queryFnBlock).toMatch(/role === "admin" \|\| role === "manager" \|\| role === "vendeur"/);
  });

  it("aucun fallback ne fait passer un rôle non résolu (potentiellement un super_admin masqué par la RLS) pour un vendeur", () => {
    // Le bug corrigé le 2026-08-01 : `roleByUserId.get(p.user_id) ?? "vendeur"` faisait
    // passer un rôle introuvable (super_admin masqué par user_roles_select_scoped) comme
    // "vendeur" par défaut, donc visible dans le filtre. Ne doit plus jamais réapparaître.
    expect(cashClosingSrc).not.toMatch(/roleByUserId\.get\([^)]*\)\s*\?\?\s*["']vendeur["']/);
  });

  it("récupère les rôles depuis user_roles (pas seulement profiles, qui ne porte pas le rôle)", () => {
    expect(cashClosingSrc).toMatch(/supabase\.from\("user_roles"\)\.select\("user_id, role"\)/);
  });
});
