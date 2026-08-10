import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Audit produit du 2026-08-10 : le footer public (src/components/landing/Footer.tsx)
 * exposait 3 liens "Légal" (Confidentialité, CGU, Cookies) tous vers `href="#"`
 * -- des liens morts. Corrigé en créant deux vraies pages
 * (src/pages/legal/PrivacyPolicy.tsx, TermsOfService.tsx), routées et liées
 * depuis le footer. Le contenu "Cookies" a été fusionné dans la politique de
 * confidentialité (section 9) plutôt qu'une 3e page séparée.
 *
 * Ces deux pages sont des BROUILLONS explicitement marqués comme tels
 * (bandeau d'avertissement en tête de page) -- pas encore relus par un
 * juriste, avec des espaces réservés pour l'identité légale de
 * l'entreprise. Ce test vérifie le câblage technique, pas le contenu
 * juridique (hors de portée d'un test automatisé).
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
const root = process.cwd();
const appSrc = readNormalized(path.join(root, "src/App.tsx"));
const footerSrc = readNormalized(path.join(root, "src/components/landing/Footer.tsx"));
const privacySrc = readNormalized(path.join(root, "src/pages/legal/PrivacyPolicy.tsx"));
const termsSrc = readNormalized(path.join(root, "src/pages/legal/TermsOfService.tsx"));

describe("Pages légales — routage", () => {
  it("les deux pages légales sont routées dans App.tsx", () => {
    expect(appSrc).toMatch(/<Route path="\/legal\/confidentialite" element=\{<PrivacyPolicy \/>\}/);
    expect(appSrc).toMatch(/<Route path="\/legal\/cgu" element=\{<TermsOfService \/>\}/);
  });

  it("les deux pages sont lazy-loaded (comme les autres pages secondaires)", () => {
    expect(appSrc).toMatch(/const PrivacyPolicy = lazyWithRecovery\(\(\) => import\("\.\/pages\/legal\/PrivacyPolicy"\)\)/);
    expect(appSrc).toMatch(/const TermsOfService = lazyWithRecovery\(\(\) => import\("\.\/pages\/legal\/TermsOfService"\)\)/);
  });

  it("aucune des deux routes n'est protégée (pages publiques, accessibles sans connexion)", () => {
    const privacyRouteBlock = appSrc.match(/<Route path="\/legal\/confidentialite"[\s\S]{0,80}/)?.[0] ?? "";
    const termsRouteBlock = appSrc.match(/<Route path="\/legal\/cgu"[\s\S]{0,80}/)?.[0] ?? "";
    expect(privacyRouteBlock).not.toMatch(/ProtectedRoute/);
    expect(termsRouteBlock).not.toMatch(/ProtectedRoute/);
  });
});

describe("Footer public — liens légaux ne sont plus des liens morts", () => {
  it("les liens 'Confidentialité' et 'CGU' pointent vers les vraies routes, plus de href='#'", () => {
    const legalBlock = footerSrc.match(/legal: \[[\s\S]*?\],/)?.[0] ?? "";
    expect(legalBlock).toMatch(/href: "\/legal\/confidentialite"/);
    expect(legalBlock).toMatch(/href: "\/legal\/cgu"/);
    expect(legalBlock).not.toMatch(/href: "#"/);
  });

  it("les liens légaux utilisent <Link> de react-router (navigation SPA), pas <a> classique", () => {
    // Les liens produit/ressources/entreprise restent des ancres #section (comportement
    // volontaire, navigation en page unique) -- seule la section Légal doit utiliser <Link>
    // puisqu'elle pointe vers de vraies routes internes.
    const legalRenderBlock = footerSrc.match(/footerLinks\.legal\.map[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(legalRenderBlock).toMatch(/<Link to=\{link\.href\}/);
  });

  it("le copyright n'a plus une année codée en dur", () => {
    expect(footerSrc).not.toMatch(/© 20\d{2} MakitiPlus/);
    expect(footerSrc).toMatch(/\{new Date\(\)\.getFullYear\(\)\}/);
  });
});

describe("Pages légales — brouillon explicitement marqué comme tel", () => {
  it("les deux pages affichent un bandeau d'avertissement de relecture juridique", () => {
    expect(privacySrc).toMatch(/Brouillon en attente de relecture juridique/);
    expect(termsSrc).toMatch(/Brouillon en attente de relecture juridique/);
  });

  it("les deux pages réutilisent Header/Footer du site public (cohérence visuelle)", () => {
    expect(privacySrc).toMatch(/import \{ Header \} from "@\/components\/landing\/Header"/);
    expect(privacySrc).toMatch(/import \{ Footer \} from "@\/components\/landing\/Footer"/);
    expect(termsSrc).toMatch(/import \{ Header \} from "@\/components\/landing\/Header"/);
    expect(termsSrc).toMatch(/import \{ Footer \} from "@\/components\/landing\/Footer"/);
  });

  it("la politique de confidentialité couvre les sous-traitants réellement utilisés par le produit", () => {
    for (const processor of ["Supabase", "Render", "Sentry", "Stripe"]) {
      expect(privacySrc).toMatch(new RegExp(processor));
    }
  });

  it("les CGU décrivent les modalités de paiement réellement implémentées (Billing.tsx)", () => {
    expect(termsSrc).toMatch(/Mobile Money/);
    expect(termsSrc).toMatch(/carte bancaire/);
  });
});
