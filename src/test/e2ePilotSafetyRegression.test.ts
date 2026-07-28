import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  assertSafeForDestructiveAction,
  isDestructiveActionAllowed,
  isPilotOrgName,
} from "../lib/pilotProtection";

/**
 * Garde-fou de régression — protège "Diallo & Frères" (magasin pilote réel)
 * contre toute action destructive ajoutée par erreur dans un futur test E2E.
 *
 * Complète pilotDataProtection.test.ts (qui teste la logique unitaire de
 * pilotProtection.ts) par une analyse statique des fichiers e2e/*.spec.ts
 * eux-mêmes : même si la fonction assertSafeForDestructiveAction est
 * correcte, rien n'empêche un futur test de ne pas l'appeler du tout.
 */

const root = process.cwd();
const e2eDir = path.join(root, "e2e");
const specFiles = fs
  .readdirSync(e2eDir)
  .filter((f) => f.endsWith(".spec.ts"))
  .sort();

const read = (file: string) => fs.readFileSync(path.join(e2eDir, file), "utf-8");

const specs = specFiles.map((file) => ({ file, content: read(file) }));

// Actions considérées destructives ou créatrices de données dans l'UI E2E :
// un CLIC réel sur un bouton de suppression (pas une simple assertion que le
// bouton est absent/invisible, ce qui est un pattern légitime et fréquent
// pour vérifier qu'une action n'est PAS proposée à un rôle donné).
const DESTRUCTIVE_ACTION_PATTERN =
  /getByRole\(\s*["']button["']\s*,\s*\{\s*name:\s*[^}]*(supprimer|delete|remove|réinitialiser|reset)[^}]*\}\s*\)(?:\.(?:first|last|nth\(\d+\)))?\s*\.click\(/i;
const SALE_CREATION_PATTERN = /encaisser|finaliser.*vente|complete.*sale|checkout/i;
const PRODUCT_CREATION_PATTERN = /nouveau produit|ajouter.*produit|create.*product/i;

describe("Sécurité E2E — protection du magasin pilote Diallo & Frères", () => {
  it("au moins un fichier e2e/*.spec.ts existe (le scan n'est pas vide)", () => {
    expect(specFiles.length).toBeGreaterThan(0);
  });

  describe("pilot-critical.spec.ts — le seul fichier autorisé à utiliser les identifiants du pilote réel", () => {
    const pilotCritical = specs.find((s) => s.file === "pilot-critical.spec.ts");

    it("existe toujours (fichier de smoke-test lecture-seule sur le pilote réel)", () => {
      expect(pilotCritical).toBeDefined();
    });

    it("ne contient aucune action destructive (bouton supprimer/reset)", () => {
      expect(pilotCritical!.content).not.toMatch(DESTRUCTIVE_ACTION_PATTERN);
    });

    it("ne contient aucune soumission de vente réelle (encaissement)", () => {
      expect(pilotCritical!.content).not.toMatch(SALE_CREATION_PATTERN);
    });

    it("ne contient aucune création de produit", () => {
      expect(pilotCritical!.content).not.toMatch(PRODUCT_CREATION_PATTERN);
    });

    it("le commentaire d'en-tête documente qu'il cible le compte pilote réel (traçabilité)", () => {
      expect(pilotCritical!.content).toMatch(/pilot store admin email|pilote/i);
    });
  });

  describe("Tous les autres fichiers e2e/*.spec.ts", () => {
    const others = specs.filter((s) => s.file !== "pilot-critical.spec.ts");

    it.each(others.map((s) => [s.file, s] as const))(
      "%s — aucune action destructive sans passer par assertSafeForDestructiveAction",
      (_file, spec) => {
        const hasDestructiveAction = DESTRUCTIVE_ACTION_PATTERN.test(spec.content);
        if (hasDestructiveAction) {
          expect(spec.content).toMatch(/assertSafeForDestructiveAction/);
        }
      }
    );

    it.each(others.map((s) => [s.file, s] as const))(
      "%s — si 'Diallo' est mentionné littéralement, c'est uniquement pour documenter le garde-fou (assertSafeForDestructiveAction présent)",
      (_file, spec) => {
        if (/Diallo/i.test(spec.content)) {
          expect(spec.content).toMatch(/assertSafeForDestructiveAction/);
        }
      }
    );
  });

  describe("staging-real-flow.spec.ts — Scénarios C/D (création produit + vente réelle)", () => {
    // Ces deux scénarios écrivent des données (produit, vente) sur le compte
    // ADMIN_EMAIL/ADMIN_PASSWORD sans jamais connaître à l'avance quelle
    // organisation ces identifiants représentent si les secrets E2E sont mal
    // configurés — contrairement à Scénario G (suppression), ils ne ciblent
    // pas TEST_ORG_NAME et le DESTRUCTIVE_ACTION_PATTERN (supprimer/delete/
    // reset) ne les détecte pas car "créer/enregistrer/encaisser" n'en fait
    // pas partie. Verrou dédié plutôt qu'extension du pattern générique,
    // pour ne pas risquer de faux positifs sur les autres specs.
    const stagingFlow = specs.find((s) => s.file === "staging-real-flow.spec.ts");

    it("existe toujours", () => {
      expect(stagingFlow).toBeDefined();
    });

    it("Scénario C (création produit) appelle refuseIfPilotOrg juste après login", () => {
      const match = stagingFlow!.content.match(
        /créer un produit test[\s\S]{0,300}?refuseIfPilotOrg\(page\)/
      );
      expect(match).not.toBeNull();
    });

    it("Scénario D (vente cash) appelle refuseIfPilotOrg juste après login", () => {
      const match = stagingFlow!.content.match(
        /enregistrer une vente cash[\s\S]{0,300}?refuseIfPilotOrg\(page\)/
      );
      expect(match).not.toBeNull();
    });
  });

  describe("Garde-fou unitaire (rappel — couverture complète dans pilotDataProtection.test.ts)", () => {
    it("bloque Diallo & Frères même avec E2E_ALLOW_DESTRUCTIVE=true", () => {
      const original = process.env.E2E_ALLOW_DESTRUCTIVE;
      process.env.E2E_ALLOW_DESTRUCTIVE = "true";
      try {
        expect(() => assertSafeForDestructiveAction("Diallo & Frères")).toThrow(/PILOT PROTECTION/);
      } finally {
        process.env.E2E_ALLOW_DESTRUCTIVE = original;
      }
    });

    it("bloque toute action destructive par défaut (E2E_ALLOW_DESTRUCTIVE non défini)", () => {
      const original = process.env.E2E_ALLOW_DESTRUCTIVE;
      delete process.env.E2E_ALLOW_DESTRUCTIVE;
      try {
        expect(isDestructiveActionAllowed()).toBe(false);
        expect(() => assertSafeForDestructiveAction("E2E_TEST_ORG")).toThrow(/PILOT PROTECTION/);
      } finally {
        process.env.E2E_ALLOW_DESTRUCTIVE = original;
      }
    });

    it("reconnaît Diallo & Frères indépendamment de la casse/accents", () => {
      expect(isPilotOrgName("diallo et freres")).toBe(false); // "et" != "&", ne doit pas matcher par erreur
      expect(isPilotOrgName("DIALLO & FRERES")).toBe(true);
    });
  });
});
