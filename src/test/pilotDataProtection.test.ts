/**
 * P0.1 — Protection du magasin pilote réel "Diallo & Frères" contre toute action
 * destructive lancée par erreur depuis les tests E2E.
 *
 * Voir src/lib/pilotProtection.ts pour le garde-fou lui-même, utilisé par les
 * scénarios destructifs de e2e/staging-real-flow.spec.ts (Scénario G — suppression
 * organisation).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getPilotOrgName,
  isPilotOrgName,
  isDestructiveActionAllowed,
  assertSafeForDestructiveAction,
} from "@/lib/pilotProtection";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  delete process.env.E2E_PILOT_ORG_NAME;
  delete process.env.E2E_PROTECT_PILOT_STORE;
  delete process.env.E2E_ALLOW_DESTRUCTIVE;
}

describe("pilotProtection", () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("getPilotOrgName", () => {
    it("retourne 'Diallo & Frères' par défaut", () => {
      expect(getPilotOrgName()).toBe("Diallo & Frères");
    });

    it("respecte E2E_PILOT_ORG_NAME si défini", () => {
      process.env.E2E_PILOT_ORG_NAME = "Autre Boutique";
      expect(getPilotOrgName()).toBe("Autre Boutique");
    });
  });

  describe("isPilotOrgName", () => {
    it("reconnaît le nom exact du pilote", () => {
      expect(isPilotOrgName("Diallo & Frères")).toBe(true);
    });

    it("reconnaît le pilote indépendamment de la casse", () => {
      expect(isPilotOrgName("diallo & frères")).toBe(true);
      expect(isPilotOrgName("DIALLO & FRÈRES")).toBe(true);
    });

    it("reconnaît le pilote même sans accents", () => {
      expect(isPilotOrgName("Diallo & Freres")).toBe(true);
      expect(isPilotOrgName("diallo & freres")).toBe(true);
    });

    it("reconnaît le pilote avec espaces superflus", () => {
      expect(isPilotOrgName("  Diallo   &   Frères  ")).toBe(true);
    });

    it("reconnaît le pilote comme sous-chaîne (ex: nom affiché avec suffixe)", () => {
      expect(isPilotOrgName("Boutique Diallo & Frères — Conakry")).toBe(true);
    });

    it("ne signale pas de faux positif pour une organisation de test", () => {
      expect(isPilotOrgName("E2E_TEST_ORG")).toBe(false);
      expect(isPilotOrgName("DEMO_ORG")).toBe(false);
      expect(isPilotOrgName("Boutique Test Staging")).toBe(false);
    });

    it("retourne false pour une valeur vide ou absente", () => {
      expect(isPilotOrgName("")).toBe(false);
      expect(isPilotOrgName(null)).toBe(false);
      expect(isPilotOrgName(undefined)).toBe(false);
    });
  });

  describe("isDestructiveActionAllowed", () => {
    it("est false par défaut (sécurité par défaut)", () => {
      expect(isDestructiveActionAllowed()).toBe(false);
    });

    it("est false si E2E_ALLOW_DESTRUCTIVE=false", () => {
      process.env.E2E_ALLOW_DESTRUCTIVE = "false";
      expect(isDestructiveActionAllowed()).toBe(false);
    });

    it("est true seulement si E2E_ALLOW_DESTRUCTIVE='true' exactement", () => {
      process.env.E2E_ALLOW_DESTRUCTIVE = "true";
      expect(isDestructiveActionAllowed()).toBe(true);
      process.env.E2E_ALLOW_DESTRUCTIVE = "TRUE";
      expect(isDestructiveActionAllowed()).toBe(false);
      process.env.E2E_ALLOW_DESTRUCTIVE = "1";
      expect(isDestructiveActionAllowed()).toBe(false);
    });
  });

  describe("assertSafeForDestructiveAction — le garde-fou critique", () => {
    it("échoue TOUJOURS si la cible est Diallo & Frères, même avec E2E_ALLOW_DESTRUCTIVE=true", () => {
      process.env.E2E_ALLOW_DESTRUCTIVE = "true";
      expect(() => assertSafeForDestructiveAction("Diallo & Frères")).toThrow(
        /PILOT PROTECTION/
      );
    });

    it("échoue si la cible est Diallo & Frères même avec E2E_PROTECT_PILOT_STORE=false", () => {
      process.env.E2E_ALLOW_DESTRUCTIVE = "true";
      process.env.E2E_PROTECT_PILOT_STORE = "false";
      expect(() => assertSafeForDestructiveAction("Diallo & Frères")).toThrow(
        /PILOT PROTECTION/
      );
    });

    it("échoue si la cible est une variante (casse/accents/espaces) de Diallo & Frères", () => {
      process.env.E2E_ALLOW_DESTRUCTIVE = "true";
      expect(() => assertSafeForDestructiveAction("diallo & freres")).toThrow();
      expect(() => assertSafeForDestructiveAction(" DIALLO & FRÈRES ")).toThrow();
    });

    it("échoue si E2E_ALLOW_DESTRUCTIVE n'est pas 'true', même pour une org de test sûre", () => {
      expect(() => assertSafeForDestructiveAction("E2E_TEST_ORG")).toThrow(
        /E2E_ALLOW_DESTRUCTIVE/
      );
    });

    it("n'échoue pas pour une organisation de test sûre avec E2E_ALLOW_DESTRUCTIVE=true", () => {
      process.env.E2E_ALLOW_DESTRUCTIVE = "true";
      expect(() => assertSafeForDestructiveAction("E2E_TEST_ORG")).not.toThrow();
      expect(() => assertSafeForDestructiveAction("DEMO_ORG")).not.toThrow();
    });

    it("respecte un nom pilote personnalisé via E2E_PILOT_ORG_NAME", () => {
      process.env.E2E_ALLOW_DESTRUCTIVE = "true";
      process.env.E2E_PILOT_ORG_NAME = "Boutique Pilote XYZ";
      expect(() => assertSafeForDestructiveAction("Boutique Pilote XYZ")).toThrow(
        /PILOT PROTECTION/
      );
      // L'ancien nom par défaut n'est plus protégé une fois le nom pilote redéfini,
      // mais reste un cas volontairement hors scope : E2E_PILOT_ORG_NAME doit toujours
      // rester "Diallo & Frères" en pratique (voir .env.example).
    });
  });
});
