import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Régression : la page Pricing (publique, sans authentification) affichait
 * les prix avec un symbole EUR/$ codé en dur (`PRICING_CURRENCY = "EUR"`),
 * indépendamment de la devise réellement stockée pour chaque plan
 * (`plan.currency`, en USD côté base) et de la devise locale de
 * l'utilisateur -- incohérent pour un produit dont le paiement réel se fait
 * en Mobile Money (GNF/XOF), jamais en EUR/USD. Corrigé en réutilisant le
 * système de conversion de devises déjà utilisé ailleurs dans l'app
 * (useCurrency -> formatConvertedPrice, taux de change réels base USD).
 */

const pricingTsx = fs.readFileSync(
  path.join(process.cwd(), "src/pages/Pricing.tsx"),
  "utf-8"
);

describe("Pricing — devise locale (pas de symbole EUR/$ codé en dur)", () => {
  it("n'a plus de constante PRICING_CURRENCY codée en dur", () => {
    expect(pricingTsx).not.toMatch(/PRICING_CURRENCY\s*=\s*["']EUR["']/);
  });

  it("n'affiche plus un symbole € ou $ concaténé manuellement au prix", () => {
    expect(pricingTsx).not.toMatch(/currencySymbol\s*=\s*PRICING_CURRENCY/);
  });

  it("utilise useCurrency (le système de conversion déjà utilisé ailleurs dans l'app)", () => {
    expect(pricingTsx).toMatch(/from "@\/hooks\/useCurrency"/);
    expect(pricingTsx).toMatch(/useCurrency\(\)/);
  });

  it("convertit le prix depuis la devise réelle du plan (plan.currency), pas une devise supposée", () => {
    expect(pricingTsx).toMatch(/formatConvertedPrice\(amount,\s*plan\.currency\)/);
  });

  it("le type PlanCardProps expose bien plan.currency (nécessaire à la conversion)", () => {
    expect(pricingTsx).toMatch(/currency:\s*string;/);
  });
});
