import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import frAuth from "@/i18n/locales/fr/auth.json";

/**
 * Depuis la Phase 1 de l'i18n (docs/production/I18N_MIGRATION_PLAN.md),
 * les messages d'erreur ne sont plus des littéraux dans Auth.tsx mais des
 * clés de traduction (auth.json) -- ce test vérifie désormais le texte
 * source réel (fr, la langue par défaut) plutôt que le fichier .tsx.
 */
const source = fs.readFileSync(path.join(process.cwd(), "src/pages/Auth.tsx"), "utf-8");

describe("Auth readable error messages", () => {
  it("maps network and Supabase timeout failures to actionable French messages", () => {
    expect(source).toContain("getAuthErrorMessage");
    expect(source).toContain("ERR_CONNECTION_TIMED_OUT");
    expect(frAuth.errors.networkError).toContain("Connexion impossible à Supabase");
    expect(frAuth.errors.networkError).toContain("VPN, proxy, DNS ou pare-feu");
  });

  it("does not hide signIn errors behind the old generic message", () => {
    expect(source).toContain("description: getAuthErrorMessage(error)");
    expect(source).not.toContain('let message = "Une erreur est survenue"');
  });

  it("keeps credential and email-confirmation messages", () => {
    expect(frAuth.errors.invalidCredentials).toContain("Email ou mot de passe incorrect");
    expect(frAuth.errors.emailNotConfirmed).toContain("Veuillez confirmer votre email");
  });
});
