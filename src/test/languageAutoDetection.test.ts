import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { ENGLISH_SPEAKING_COUNTRY_CODES, resolveCountry, COUNTRIES } from "@/utils/currencies";

/**
 * Audit produit du 2026-08-10 : la détection automatique de langue à partir
 * du pays de l'organisation était documentée comme "prévue en Phase 3, pas
 * avant" dans ProfileLanguageSync.tsx -- jamais implémentée. Ajoutée ici,
 * UNE SEULE FOIS par profil (voir le ref inferenceAttempted dans le
 * composant), et seulement quand profiles.language est vide -- ne doit
 * jamais écraser un choix explicite de l'utilisateur (persisté dès la
 * première inférence, comme language-selector.tsx).
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
const syncSrc = readNormalized(
  path.join(process.cwd(), "src/components/i18n/ProfileLanguageSync.tsx")
);

describe("ENGLISH_SPEAKING_COUNTRY_CODES — liste raisonnable, sous-ensemble de COUNTRIES", () => {
  it("tous les codes de la liste existent bien dans COUNTRIES (pas de code orphelin)", () => {
    for (const code of ENGLISH_SPEAKING_COUNTRY_CODES) {
      expect(COUNTRIES.some((c) => c.code === code), `code ${code} absent de COUNTRIES`).toBe(true);
    }
  });

  it("la Guinée (marché pilote) n'est pas dans la liste anglophone -- pas de régression sur Diallo & Frères", () => {
    expect(ENGLISH_SPEAKING_COUNTRY_CODES.has("GN")).toBe(false);
  });

  it("inclut les marchés limitrophes anglophones déjà identifiés (Nigeria, Ghana)", () => {
    expect(ENGLISH_SPEAKING_COUNTRY_CODES.has("NG")).toBe(true);
    expect(ENGLISH_SPEAKING_COUNTRY_CODES.has("GH")).toBe(true);
  });
});

describe("resolveCountry — gère les deux formats stockés en base (code ISO ou nom complet)", () => {
  it("résout un code ISO à 2 lettres", () => {
    expect(resolveCountry("NG")?.code).toBe("NG");
  });

  it("résout un nom complet (insensible à la casse)", () => {
    expect(resolveCountry("nigeria")?.code).toBe("NG");
    expect(resolveCountry("Guinée")?.code).toBe("GN");
  });

  it("retourne undefined pour une valeur vide ou non reconnue (jamais de crash)", () => {
    expect(resolveCountry(null)).toBeUndefined();
    expect(resolveCountry(undefined)).toBeUndefined();
    expect(resolveCountry("Pays imaginaire")).toBeUndefined();
  });
});

describe("ProfileLanguageSync — inférence unique, jamais destructive d'un choix explicite", () => {
  it("le choix explicite (profile.language déjà défini) est toujours prioritaire sur l'inférence", () => {
    const explicitBlock = syncSrc.match(/if \(profile\?\.language && profile\.language !== i18n\.language\) \{[\s\S]*?return;\s*\n\s*\}/)?.[0] ?? "";
    expect(explicitBlock).toMatch(/i18n\.changeLanguage\(profile\.language\)/);
    expect(explicitBlock).toMatch(/return;/);
  });

  it("l'inférence ne se déclenche que si profile.language est vide", () => {
    expect(syncSrc).toMatch(/!inferenceAttempted\.current &&\s*\n\s*profile &&\s*\n\s*!profile\.language/);
  });

  it("l'inférence n'a lieu qu'une fois par montage (ref, pas de re-déclenchement en boucle)", () => {
    expect(syncSrc).toMatch(/const inferenceAttempted = useRef\(false\)/);
    expect(syncSrc).toMatch(/inferenceAttempted\.current = true;/);
  });

  it("le résultat de l'inférence est immédiatement persisté dans profiles.language (comme language-selector.tsx)", () => {
    expect(syncSrc).toMatch(/\.from\("profiles"\)\s*\n\s*\.update\(\{ language: "en" \}\)\s*\n\s*\.eq\("user_id", user\.id\)/);
  });

  it("un échec de persistance ne fait pas planter le composant (géré, pas de throw non catché)", () => {
    expect(syncSrc).toMatch(/if \(error\) reportError\(error\);/);
  });
});
