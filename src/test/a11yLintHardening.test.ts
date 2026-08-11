import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Audit produit du 2026-08-10 : durcissement permanent des règles
 * jsx-a11y actives dans eslint.config.js (label-has-associated-control,
 * tabindex-no-positive, aria-role), en plus des règles déjà en place
 * (alt-text, aria-props, role-has-required-aria-props,
 * click-events-have-key-events). jsx-a11y/heading-has-content
 * délibérément exclue (bruit systématique sur les primitives shadcn/ui
 * génériques dont le contenu vient de props/children dynamiques -- voir
 * le commentaire dans eslint.config.js).
 *
 * Deux vrais gaps trouvés et corrigés par label-has-associated-control :
 * currency-selector.tsx (sélecteur de devise, utilisé sur plusieurs
 * pages) et OrganizationManagement.tsx (formulaire de changement de plan
 * manuel super_admin, 4 champs). Les champs Radix Select ne sont pas
 * reconnus nativement par la règle (ce ne sont pas des <select>) --
 * associés via aria-labelledby + eslint-disable ciblé et justifié plutôt
 * que par un htmlFor qui ne fonctionnerait pas sur un bouton Radix.
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
const root = process.cwd();
const eslintConfigSrc = readNormalized(path.join(root, "eslint.config.js"));
const currencySelectorSrc = readNormalized(path.join(root, "src/components/ui/currency-selector.tsx"));
const orgManagementSrc = readNormalized(path.join(root, "src/pages/OrganizationManagement.tsx"));

describe("eslint.config.js — règles jsx-a11y durcies sans régression", () => {
  it("label-has-associated-control, tabindex-no-positive et aria-role sont actives", () => {
    expect(eslintConfigSrc).toMatch(/"jsx-a11y\/label-has-associated-control":\s*"warn"/);
    expect(eslintConfigSrc).toMatch(/"jsx-a11y\/tabindex-no-positive":\s*"warn"/);
    expect(eslintConfigSrc).toMatch(/"jsx-a11y\/aria-role":\s*"warn"/);
  });

  it("heading-has-content reste délibérément absente (faux positifs shadcn documentés)", () => {
    expect(eslintConfigSrc).not.toMatch(/"jsx-a11y\/heading-has-content"/);
  });
});

describe("currency-selector.tsx — le label 'Devise' est associé au Select via aria-labelledby", () => {
  it("le label a un id et le SelectTrigger le référence", () => {
    expect(currencySelectorSrc).toMatch(/<label id="currency-selector-label"/);
    expect(currencySelectorSrc).toMatch(/<SelectTrigger className="w-full" aria-labelledby="currency-selector-label">/);
  });
});

describe("OrganizationManagement.tsx — les 4 champs du formulaire de changement de plan sont labellisés", () => {
  it("Nouveau plan et Durée (Select) associés via aria-labelledby", () => {
    expect(orgManagementSrc).toMatch(/<label id="org-new-plan-label"/);
    expect(orgManagementSrc).toMatch(/aria-labelledby="org-new-plan-label"/);
    expect(orgManagementSrc).toMatch(/<label id="org-duration-label"/);
    expect(orgManagementSrc).toMatch(/aria-labelledby="org-duration-label"/);
  });

  it("Référence paiement et Raison (Input) associés via htmlFor/id classique", () => {
    expect(orgManagementSrc).toMatch(/<label htmlFor="org-payment-reference"/);
    expect(orgManagementSrc).toMatch(/id="org-payment-reference"/);
    expect(orgManagementSrc).toMatch(/<label htmlFor="org-change-reason"/);
    expect(orgManagementSrc).toMatch(/id="org-change-reason"/);
  });
});
