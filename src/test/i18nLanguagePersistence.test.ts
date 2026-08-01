import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * i18n Phase 2, point 1 : "persister la langue choisie côté profil ou
 * organisation ; garder français par défaut."
 *
 * profiles.language existe déjà en base (colonne jamais câblée jusqu'ici --
 * confirmé dans src/integrations/supabase/types.ts). Deux morceaux :
 * 1. LanguageSelector écrit désormais dans profiles.language au changement
 *    (même pattern que currency-selector.tsx pour profiles.currency).
 * 2. ProfileLanguageSync lit profiles.language au chargement du profil et
 *    appelle i18n.changeLanguage() -- monté une fois sous AuthProvider dans
 *    App.tsx, sans toucher à AuthContext.tsx (fichier critique auth).
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");

const selectorSrc = readNormalized(path.join(process.cwd(), "src/components/ui/language-selector.tsx"));
const syncSrc = readNormalized(path.join(process.cwd(), "src/components/i18n/ProfileLanguageSync.tsx"));
const appSrc = readNormalized(path.join(process.cwd(), "src/App.tsx"));
const i18nConfigSrc = readNormalized(path.join(process.cwd(), "src/i18n/config.ts"));
const typesSrc = readNormalized(path.join(process.cwd(), "src/integrations/supabase/types.ts"));

describe("profiles.language — colonne présente dans le contrat de type Supabase", () => {
  it("profiles.Row expose language (nullable)", () => {
    const profilesRowBlock = typesSrc.match(/profiles:\s*\{\s*Row:\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? "";
    expect(profilesRowBlock).toMatch(/language:\s*string \| null/);
  });
});

describe("LanguageSelector — persiste le changement dans profiles.language", () => {
  it("met à jour l'affichage immédiatement, avant toute écriture réseau (pas de blocage sur la persistance)", () => {
    const handleChangeBlock = selectorSrc.match(/const handleChange = async \(value: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
    const changeLanguageIndex = handleChangeBlock.indexOf("i18n.changeLanguage(value)");
    const updateIndex = handleChangeBlock.indexOf(".update({ language: value })");
    expect(changeLanguageIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(-1);
    expect(changeLanguageIndex).toBeLessThan(updateIndex);
  });

  it("écrit dans profiles.language scopé à l'utilisateur courant", () => {
    expect(selectorSrc).toMatch(/\.from\("profiles"\)\s*\n?\s*\.update\(\{ language: value \}\)\s*\n?\s*\.eq\("user_id", user\.id\)/);
  });

  it("un échec de persistance ne bloque pas le changement visuel (catch non bloquant, pas de rollback de i18n.changeLanguage)", () => {
    const handleChangeBlock = selectorSrc.match(/const handleChange = async \(value: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
    expect(handleChangeBlock).toMatch(/catch \(e\) \{/);
    expect(handleChangeBlock).not.toMatch(/i18n\.changeLanguage\([^)]*\);[\s\S]*catch[\s\S]*i18n\.changeLanguage/);
  });
});

describe("ProfileLanguageSync — synchronise i18n avec profiles.language au chargement", () => {
  it("ne change la langue que si profiles.language est défini et différent de la langue active", () => {
    expect(syncSrc).toMatch(/if \(profile\?\.language && profile\.language !== i18n\.language\)/);
  });

  it("est monté une seule fois sous AuthProvider dans App.tsx", () => {
    const authProviderIndex = appSrc.indexOf("<AuthProvider>");
    const syncMountIndex = appSrc.indexOf("<ProfileLanguageSync />");
    expect(authProviderIndex).toBeGreaterThan(-1);
    expect(syncMountIndex).toBeGreaterThan(authProviderIndex);
  });
});

describe("Le français reste la langue par défaut (pas de régression)", () => {
  it("i18n.config.ts force toujours lng: \"fr\" et fallbackLng: \"fr\"", () => {
    expect(i18nConfigSrc).toMatch(/lng:\s*"fr"/);
    expect(i18nConfigSrc).toMatch(/fallbackLng:\s*"fr"/);
  });
});
