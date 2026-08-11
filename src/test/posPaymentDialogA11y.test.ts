import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Audit produit du 2026-08-10 : POSPaymentDialog.tsx (l'écran le plus
 * critique de toute l'application -- finaliser une vente) n'avait AUCUN
 * aria-label ni attribut d'accessibilité, malgré `eslint-plugin-jsx-a11y`
 * déjà configuré et 0 warning ailleurs dans le dépôt (les règles statiques
 * activées -- alt-text, aria-props, role-has-required-aria-props,
 * click-events-have-key-events -- ne couvrent pas ce type de gap
 * spécifique : un composant Radix Tabs sans nom accessible, une zone de
 * feedback dynamique sans aria-live, un champ requis sans indication
 * d'erreur programmatique).
 *
 * Ce fichier vérifie par analyse statique du source (même pattern que
 * mobileMoneyPaymentReference.test.ts) plutôt que par rendu RTL complet --
 * POSPaymentDialog dépend de useCurrency -> useAuth -> contexte Supabase,
 * ce qui nécessiterait un mock lourd pour un gain de fiabilité marginal
 * par rapport à une vérification directe du JSX généré.
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
const dialogSrc = readNormalized(
  path.join(process.cwd(), "src/components/pos/POSPaymentDialog.tsx")
);

describe("POSPaymentDialog — sélecteur de mode de paiement a un nom accessible", () => {
  it("le Label 'Mode de paiement' est associé aux Tabs via aria-labelledby (pas juste un texte flottant)", () => {
    expect(dialogSrc).toMatch(/<Label id="pos-payment-method-label">Mode de paiement<\/Label>/);
    expect(dialogSrc).toMatch(/<Tabs[\s\S]{0,200}aria-labelledby="pos-payment-method-label"/);
  });
});

describe("POSPaymentDialog — la monnaie à rendre est annoncée dynamiquement", () => {
  it("la zone 'Monnaie à rendre' a aria-live=\"polite\" (le vendeur tape le montant reçu, la valeur change en direct)", () => {
    const changeBlock = dialogSrc.match(/\{change > 0 && \([\s\S]{0,200}/)?.[0] ?? "";
    expect(changeBlock).toMatch(/aria-live="polite"/);
  });
});

describe("POSPaymentDialog — le nom client obligatoire (vente à crédit) a un feedback d'erreur programmatique", () => {
  it("aria-required, aria-invalid et aria-describedby sont posés sur le champ", () => {
    const nameFieldBlock = dialogSrc.match(/id="pos-customer-name"[\s\S]{0,500}/)?.[0] ?? "";
    expect(nameFieldBlock).toMatch(/aria-required="true"/);
    expect(nameFieldBlock).toMatch(/aria-invalid=\{paymentMethod === "credit" && !customerName\.trim\(\)\}/);
    expect(nameFieldBlock).toMatch(/aria-describedby=\{paymentMethod === "credit" && !customerName\.trim\(\) \? "pos-customer-name-error" : undefined\}/);
  });

  it("le message d'erreur existe, a role=\"alert\" et le même id que aria-describedby (association correcte)", () => {
    expect(dialogSrc).toMatch(/id="pos-customer-name-error" role="alert"/);
    expect(dialogSrc).toMatch(/Le nom du client est obligatoire pour une vente à crédit\./);
  });
});
