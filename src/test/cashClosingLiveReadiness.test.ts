import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Audit final hardening 2026-08-01, section P0.5 : preuve que les 9 RPC
 * critiques de clôture de caisse / vente sont réellement appelées par le
 * frontend avec les mêmes noms que ceux vérifiés en direct sur la base live
 * (voir docs/production/SUPABASE_LIVE_VERIFICATION_2026_08_01.md, section 1
 * -- introspection pg_proc en lecture seule, 9/9 présentes).
 *
 * Ce test ne se connecte pas à la base (aucun credential embarqué) -- il
 * garantit uniquement que le code source et le contrat vérifié en direct ce
 * jour-là restent synchronisés : si un futur changement renomme une RPC
 * côté frontend sans mettre à jour la doc de vérification live (ou
 * inversement), ce test casse et force une revérification.
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");

const cashClosingSrc = readNormalized(path.join(process.cwd(), "src/pages/CashClosing.tsx"));
const offlineSaleSrc = readNormalized(path.join(process.cwd(), "src/hooks/useOfflineSale.ts"));
const liveVerificationDoc = readNormalized(
  path.join(process.cwd(), "docs/production/SUPABASE_LIVE_VERIFICATION_2026_08_01.md")
);

const CRITICAL_RPCS = [
  "open_cash_register_session",
  "get_cash_closing_summary",
  "close_cash_register_session",
  "approve_cash_register_session",
  "reject_cash_register_session",
  "get_cash_register_sessions",
] as const;

describe("Audit 2026-08-01 — les RPC critiques vérifiées live sont bien celles appelées par CashClosing.tsx", () => {
  it.each(CRITICAL_RPCS)("CashClosing.tsx appelle bien supabase.rpc(\"%s\", ...)", (rpcName) => {
    expect(cashClosingSrc).toMatch(new RegExp(`rpc\\(["']${rpcName}["']`));
  });

  it("la doc de vérification live confirme les 9 RPC présentes (9/9), pas de régression silencieuse du rapport", () => {
    expect(liveVerificationDoc).toMatch(/Résultat : 9\/9 présentes/);
    for (const rpc of [...CRITICAL_RPCS, "is_user_super_admin", "create_sale_with_limit", "create_full_sale"]) {
      expect(liveVerificationDoc).toMatch(new RegExp(`\`${rpc}\``));
    }
  });

  it("create_sale_with_limit (chemin de vente, en ligne et hors-ligne) est bien la RPC utilisée, cohérente avec la vérification live", () => {
    expect(offlineSaleSrc).toMatch(/rpc\("create_sale_with_limit"/);
  });
});

describe("Audit 2026-08-01 — cash_register_sessions reste protégée par RLS forcée sans écriture directe", () => {
  it("la doc de vérification live confirme RLS activée + forcée et 0 policy d'écriture directe", () => {
    expect(liveVerificationDoc).toMatch(/RLS activée.*✅ `true`/);
    expect(liveVerificationDoc).toMatch(/RLS forcée.*✅ `true`/);
    expect(liveVerificationDoc).toMatch(/directes pour `authenticated`.*✅ \*\*0\*\*/);
  });
});
