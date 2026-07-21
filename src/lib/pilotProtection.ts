/**
 * Garde-fou anti-pilote — protège "Diallo & Frères" (magasin pilote réel) contre
 * toute action destructive lancée par erreur depuis les tests E2E.
 *
 * Diallo & Frères utilise désormais de VRAIES données (ventes, produits, clients,
 * fournisseurs). Aucune suppression, reset, backfill non autorisé ou vente factice
 * ne doit jamais le cibler — même si les variables d'environnement E2E sont mal
 * configurées, même si E2E_ALLOW_DESTRUCTIVE=true a été mis par erreur.
 *
 * Par conséquent, la correspondance de nom pilote (isPilotOrgName) est volontairement
 * INCONDITIONNELLE : elle ne peut pas être désactivée par variable d'environnement.
 * E2E_PROTECT_PILOT_STORE documente que la protection est active ; ce n'est pas un
 * interrupteur qui la coupe.
 *
 * Utilisation dans un test E2E destructif :
 *   import { assertSafeForDestructiveAction } from "../src/lib/pilotProtection";
 *   assertSafeForDestructiveAction(targetOrgName);
 */

const DEFAULT_PILOT_ORG_NAME = "Diallo & Frères";

const ACCENT_MAP: Record<string, string> = {
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a",
  è: "e", é: "e", ê: "e", ë: "e",
  ì: "i", í: "i", î: "i", ï: "i",
  ò: "o", ó: "o", ô: "o", õ: "o", ö: "o",
  ù: "u", ú: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => ACCENT_MAP[char] ?? char)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function getPilotOrgName(): string {
  return process.env.E2E_PILOT_ORG_NAME || DEFAULT_PILOT_ORG_NAME;
}

export function isPilotProtectionEnabled(): boolean {
  return process.env.E2E_PROTECT_PILOT_STORE !== "false";
}

export function isDestructiveActionAllowed(): boolean {
  return process.env.E2E_ALLOW_DESTRUCTIVE === "true";
}

/** Vrai si `candidate` désigne le magasin pilote réel (comparaison insensible à la casse et aux accents). */
export function isPilotOrgName(candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const pilot = normalize(getPilotOrgName());
  const value = normalize(candidate);
  return value === pilot || value.includes(pilot);
}

/**
 * Doit être appelée avant TOUTE action destructive dans un test E2E (suppression,
 * reset, mutation irréversible). Lève une erreur — donc fait échouer le test —
 * si la cible est le magasin pilote réel, ou si les actions destructives ne sont
 * pas explicitement autorisées via E2E_ALLOW_DESTRUCTIVE=true.
 */
export function assertSafeForDestructiveAction(targetOrgName: string | null | undefined): void {
  if (isPilotOrgName(targetOrgName)) {
    throw new Error(
      `[PILOT PROTECTION] Action destructive bloquée : la cible "${targetOrgName}" correspond au ` +
        `magasin pilote réel (${getPilotOrgName()}). Les tests destructifs doivent utiliser ` +
        `uniquement E2E_TEST_ORG, TEST_STORE, STAGING ou DEMO_ORG — jamais Diallo & Frères.`
    );
  }

  if (!isDestructiveActionAllowed()) {
    throw new Error(
      '[PILOT PROTECTION] Action destructive bloquée : E2E_ALLOW_DESTRUCTIVE doit valoir "true" ' +
        "pour exécuter un test destructif."
    );
  }
}
