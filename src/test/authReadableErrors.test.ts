import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const source = fs.readFileSync(path.join(process.cwd(), "src/pages/Auth.tsx"), "utf-8");

describe("Auth readable error messages", () => {
  it("maps network and Supabase timeout failures to actionable French messages", () => {
    expect(source).toContain("getAuthErrorMessage");
    expect(source).toContain("ERR_CONNECTION_TIMED_OUT");
    expect(source).toContain("Connexion impossible à Supabase");
    expect(source).toContain("VPN, proxy, DNS ou pare-feu");
  });

  it("does not hide signIn errors behind the old generic message", () => {
    expect(source).toContain("description: getAuthErrorMessage(error)");
    expect(source).not.toContain('let message = "Une erreur est survenue"');
  });

  it("keeps credential and email-confirmation messages", () => {
    expect(source).toContain("Email ou mot de passe incorrect");
    expect(source).toContain("Veuillez confirmer votre email");
  });
});
