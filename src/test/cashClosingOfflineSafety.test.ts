import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frCashClosing from "@/i18n/locales/fr/cashClosing.json";

/**
 * P0.4 du plan cash-closing-final-hardening : une clôture calculée pendant
 * que des ventes hors-ligne ne sont pas encore synchronisées serait fausse
 * (elles manqueraient au total serveur). Vérifié par analyse statique --
 * pas de test d'intégration IndexedDB ici (déjà couvert par les tests
 * dédiés d'offlineQueue.ts), seulement le câblage dans CashClosing.tsx.
 */

const cashClosingTsx = fs.readFileSync(
  path.join(process.cwd(), "src/pages/CashClosing.tsx"),
  "utf-8"
);

describe("Sécurité offline avant clôture (P0.4)", () => {
  it("utilise useOnlineStatus() (pendingCount) plutôt que de réinventer un compteur", () => {
    expect(cashClosingTsx).toMatch(/useOnlineStatus\(\)/);
    expect(cashClosingTsx).toMatch(/pendingCount:\s*offlinePendingCount/);
  });

  it("le bouton Clôturer est désactivé tant que la confirmation n'est pas cochée avec des ventes en attente", () => {
    expect(cashClosingTsx).toMatch(/offlinePendingCount > 0 && !confirmCloseWithPending/);
  });

  it("le message d'avertissement précise qu'IndexedDB/les ventes offline ne sont jamais supprimées", () => {
    // i18n Phase 2 : le texte est désormais dans fr/cashClosing.json
    // (counting.offlineWarning_one/_other) plutôt que codé en dur ici --
    // on vérifie que le code appelle bien la clé, et que le texte français
    // réel contient toujours la garantie "jamais supprimées".
    expect(cashClosingTsx).toMatch(/t\("counting\.offlineWarning", \{ count: offlinePendingCount \}\)/);
    expect(frCashClosing.counting.offlineWarning_one).toMatch(/ne seront pas supprimées/);
    expect(frCashClosing.counting.offlineWarning_other).toMatch(/ne seront pas supprimées/);
  });

  it("aucun appel à indexedDB.deleteDatabase, localStorage.clear ou 'Clear site data' dans le module", () => {
    expect(cashClosingTsx).not.toMatch(/indexedDB\.deleteDatabase/);
    expect(cashClosingTsx).not.toMatch(/localStorage\.clear\(\)/);
    expect(cashClosingTsx).not.toMatch(/caches\.delete/);
  });

  it("la confirmation offline est réinitialisée après une clôture réussie (pas de résidu pour la session suivante)", () => {
    expect(cashClosingTsx).toMatch(/setConfirmCloseWithPending\(false\)/);
  });
});
