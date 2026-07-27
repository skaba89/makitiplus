import { describe, expect, it } from "vitest";
import { parseAndValidateProductImport, buildImportTemplateCSV, CSV_TEMPLATE_HEADERS } from "@/utils/productImport";
import { parseCSV } from "@/utils/csvParser";

const noExisting = { existingProducts: [], existingCategoryNames: [] };

describe("parseAndValidateProductImport", () => {
  it("signale les colonnes obligatoires manquantes", () => {
    const { rows, missingRequiredColumns } = parseAndValidateProductImport("categorie,stock\nAlim,5", noExisting);
    expect(rows).toEqual([]);
    expect(missingRequiredColumns).toContain("nom");
    expect(missingRequiredColumns).toContain("prix_vente");
  });

  it("accepte les synonymes de colonnes (name/price en anglais)", () => {
    const { rows, missingRequiredColumns } = parseAndValidateProductImport("name,price\nRice,1000", noExisting);
    expect(missingRequiredColumns).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].valid).toBe(true);
  });

  it("valide une ligne correcte", () => {
    const { rows } = parseAndValidateProductImport(
      "nom,prix_vente,stock\nRiz 25kg,350000,20",
      noExisting
    );
    expect(rows[0]).toMatchObject({ name: "Riz 25kg", price: 350000, stock: 20, valid: true, errors: [] });
  });

  it("rejette une ligne sans nom", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente\n,1000", noExisting);
    expect(rows[0].valid).toBe(false);
    expect(rows[0].errors).toContain("nom manquant");
  });

  it("rejette un prix non numérique", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente\nRiz,abc", noExisting);
    expect(rows[0].valid).toBe(false);
    expect(rows[0].errors[0]).toMatch(/valeur numérique invalide/);
  });

  it("rejette un prix négatif", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente\nRiz,-100", noExisting);
    expect(rows[0].valid).toBe(false);
    expect(rows[0].errors).toContain("prix_vente négatif");
  });

  it("avertit (sans bloquer) sur un prix à 0", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente\nRiz,0", noExisting);
    expect(rows[0].valid).toBe(true);
    expect(rows[0].warnings).toContain("prix_vente à 0");
  });

  it("rejette un stock négatif", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente,stock\nRiz,1000,-5", noExisting);
    expect(rows[0].valid).toBe(false);
    expect(rows[0].errors).toContain("stock négatif");
  });

  it("accepte une ligne sans stock (optionnel)", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente\nRiz,1000", noExisting);
    expect(rows[0].valid).toBe(true);
    expect(rows[0].stock).toBeNull();
  });

  it("détecte un doublon de nom contre la base existante", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente\nRiz,1000", {
      existingProducts: [{ name: "Riz", barcode: null }],
      existingCategoryNames: [],
    });
    expect(rows[0].valid).toBe(false);
    expect(rows[0].errors).toContain("un produit avec ce nom existe déjà");
  });

  it("détecte un doublon de nom insensible à la casse", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente\nRIZ,1000", {
      existingProducts: [{ name: "riz", barcode: null }],
      existingCategoryNames: [],
    });
    expect(rows[0].valid).toBe(false);
  });

  it("détecte un doublon de code-barres contre la base existante", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente,code_barres\nRiz,1000,123", {
      existingProducts: [{ name: "Autre", barcode: "123" }],
      existingCategoryNames: [],
    });
    expect(rows[0].valid).toBe(false);
    expect(rows[0].errors).toContain("un produit avec ce code-barres existe déjà");
  });

  it("détecte un doublon de nom DANS le fichier lui-même", () => {
    const { rows } = parseAndValidateProductImport(
      "nom,prix_vente\nRiz,1000\nRiz,1200",
      noExisting
    );
    expect(rows[0].valid).toBe(true);
    expect(rows[1].valid).toBe(false);
    expect(rows[1].errors[0]).toMatch(/doublon de nom avec la ligne 2/);
  });

  it("détecte un doublon de code-barres DANS le fichier lui-même", () => {
    const { rows } = parseAndValidateProductImport(
      "nom,prix_vente,code_barres\nA,1000,999\nB,1200,999",
      noExisting
    );
    expect(rows[1].valid).toBe(false);
    expect(rows[1].errors[0]).toMatch(/doublon de code-barres/);
  });

  it("avertit (sans bloquer) sur une catégorie inconnue", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente,categorie\nRiz,1000,Inconnue", noExisting);
    expect(rows[0].valid).toBe(true);
    expect(rows[0].warnings[0]).toMatch(/catégorie "Inconnue" introuvable/);
  });

  it("ne signale pas d'avertissement pour une catégorie existante (insensible à la casse)", () => {
    const { rows } = parseAndValidateProductImport("nom,prix_vente,categorie\nRiz,1000,alimentation", {
      existingProducts: [],
      existingCategoryNames: ["Alimentation"],
    });
    expect(rows[0].warnings).toEqual([]);
  });

  it("gère un fichier avec plusieurs lignes mixtes valides/invalides", () => {
    const csv = [
      "nom,prix_vente,stock",
      "Riz,1000,10",
      ",2000,5",
      "Savon,abc,3",
    ].join("\n");
    const { rows } = parseAndValidateProductImport(csv, noExisting);
    expect(rows).toHaveLength(3);
    expect(rows[0].valid).toBe(true);
    expect(rows[1].valid).toBe(false);
    expect(rows[2].valid).toBe(false);
  });
});

describe("buildImportTemplateCSV", () => {
  it("génère un CSV avec les en-têtes attendus", () => {
    const csv = buildImportTemplateCSV();
    const [headers] = parseCSV(csv);
    expect(headers).toEqual(CSV_TEMPLATE_HEADERS);
  });

  it("le template généré est lui-même valide via le validateur", () => {
    const csv = buildImportTemplateCSV();
    const { rows, missingRequiredColumns } = parseAndValidateProductImport(csv, noExisting);
    expect(missingRequiredColumns).toEqual([]);
    expect(rows.every((r) => r.valid)).toBe(true);
  });
});
