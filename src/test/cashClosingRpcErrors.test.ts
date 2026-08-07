import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frCashClosing from "@/i18n/locales/fr/cashClosing.json";

/**
 * P0.3 du plan cash-closing-final-hardening : une RPC de clôture de caisse en
 * échec ne doit JAMAIS être silencieusement transformée en tableau vide ou en
 * null -- l'utilisateur croirait alors "aucune session" alors que le service
 * est cassé, non déployé, ou bloqué par RLS. Vérifié par analyse statique du
 * frontend (les 5 RPC de src/pages/CashClosing.tsx).
 */

const cashClosingTsx = fs.readFileSync(
  path.join(process.cwd(), "src/pages/CashClosing.tsx"),
  "utf-8"
);

const RPC_NAMES = [
  "get_cash_register_sessions",
  "get_cash_closing_summary",
] as const;

describe("Erreurs RPC visibles — clôture de caisse (P0.3)", () => {
  it("aucun des 5 RPC de session/clôture ne retourne silencieusement [] ou null sur erreur", () => {
    // Portée : uniquement les 5 RPC listées par P0.3 (opérations de session
    // critiques). La requête `profiles` (P1, enrichissement décoratif des
    // noms de vendeurs) reste volontairement best-effort -- un échec dégrade
    // l'affichage (UUID au lieu d'un nom) sans jamais bloquer la clôture.
    for (const rpc of [
      "get_cash_register_sessions",
      "get_cash_closing_summary",
      "open_cash_register_session",
      "close_cash_register_session",
      "approve_cash_register_session",
    ]) {
      const callBlockMatch = cashClosingTsx.match(new RegExp(`rpc\\("${rpc}"[\\s\\S]{0,400}?\\n\\s*\\},`));
      const callBlock = callBlockMatch?.[0] ?? "";
      expect(callBlock).not.toMatch(/if\s*\(error\)\s*return\s*\[\];/);
      expect(callBlock).not.toMatch(/if\s*\(error\)\s*return\s*null;/);
    }
  });

  it.each(RPC_NAMES)("les erreurs de %s sont explicitement throw + reportError", (rpcName) => {
    // Cherche un bloc `if (error) { ... reportError ... throw ... }` quelque
    // part après un appel à cette RPC -- structure exacte imposée par P0.3.
    const rpcCallPattern = new RegExp(
      `rpc\\("${rpcName}"[\\s\\S]{0,400}?if \\(error\\) \\{[\\s\\S]{0,300}?reportError\\([\\s\\S]{0,300}?throw err;`
    );
    const matches = cashClosingTsx.match(new RegExp(rpcCallPattern, "g"));
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThan(0);
  });

  it("un état d'erreur global est affiché à l'utilisateur (pas juste consolé)", () => {
    expect(cashClosingTsx).toMatch(/mySessionsError \|\| mySummaryError \|\| teamOpenError \|\| pendingApprovalsError \|\| historyError/);
    // i18n Phase 2 : le texte est désormais dans fr/cashClosing.json
    // (loadError.title/description) plutôt que codé en dur ici.
    expect(cashClosingTsx).toMatch(/t\("loadError\.title"\)/);
    expect(cashClosingTsx).toMatch(/t\("loadError\.description"\)/);
    expect(frCashClosing.loadError.title).toMatch(/Impossible de charger les sessions de caisse/);
    expect(frCashClosing.loadError.description).toMatch(/Les données ne sont pas vides/);
  });

  it("les 5 hooks useQuery exposent bien leur `error` (destructuré depuis useQuery)", () => {
    const errorDestructureCount = (cashClosingTsx.match(/error:\s*(mySessionsError|mySummaryError|teamOpenError|pendingApprovalsError|historyError)/g) ?? []).length;
    expect(errorDestructureCount).toBe(5);
  });
});
