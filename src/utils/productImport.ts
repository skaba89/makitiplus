import { parseCSV, toCSV } from "./csvParser";

/** Colonnes reconnues, avec synonymes acceptés (insensible à la casse). */
const COLUMN_ALIASES: Record<string, string[]> = {
  nom: ["nom", "name"],
  categorie: ["categorie", "catégorie", "category"],
  prix_vente: ["prix_vente", "prix", "price"],
  prix_achat: ["prix_achat", "cout", "coût", "cost_price"],
  stock: ["stock", "stock_quantity"],
  alerte_stock: ["alerte_stock", "min_stock_alert", "seuil_alerte"],
  code_barres: ["code_barres", "code-barres", "barcode"],
  unite: ["unite", "unité", "unit"],
  fournisseur: ["fournisseur", "supplier"],
  description: ["description"],
};

export const CSV_TEMPLATE_HEADERS = [
  "nom",
  "categorie",
  "prix_vente",
  "prix_achat",
  "stock",
  "alerte_stock",
  "code_barres",
  "unite",
  "fournisseur",
  "description",
];

export function buildImportTemplateCSV(): string {
  return toCSV([
    CSV_TEMPLATE_HEADERS,
    ["Riz 25kg", "Alimentation", "350000", "300000", "20", "5", "3401234567890", "sac", "", "Riz local"],
    ["Savon Marseille", "Hygiène", "5000", "3500", "100", "10", "", "unité", "", ""],
  ]);
}

export interface ImportRowResult {
  /** Numéro de ligne dans le fichier (1-indexé, hors en-tête) */
  line: number;
  raw: Record<string, string>;
  name: string;
  categoryName: string | null;
  price: number | null;
  costPrice: number | null;
  stock: number | null;
  minStockAlert: number | null;
  barcode: string | null;
  unit: string;
  supplierName: string | null;
  description: string | null;
  errors: string[];
  warnings: string[];
  /** true si aucune erreur -- la ligne peut être importée */
  valid: boolean;
}

export interface ImportValidationOptions {
  /** Produits existants de l'organisation, pour détecter les doublons */
  existingProducts: { name: string; barcode: string | null }[];
  /** Catégories existantes de l'organisation (noms) */
  existingCategoryNames: string[];
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function resolveColumnMap(headers: string[]): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const map: Record<string, number> = {};
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[canonical] = idx;
  }
  return map;
}

function parseNumericField(raw: string | undefined): { value: number | null; error: string | null } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: null, error: null };
  const normalized = trimmed.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { value: null, error: `valeur numérique invalide : "${raw}"` };
  return { value, error: null };
}

/**
 * Parse et valide un fichier CSV de produits.
 * Ne fait AUCUN appel réseau — pure fonction, entièrement testable.
 */
export function parseAndValidateProductImport(
  csvText: string,
  options: ImportValidationOptions
): { rows: ImportRowResult[]; missingRequiredColumns: string[] } {
  const table = parseCSV(csvText);
  if (table.length === 0) {
    return { rows: [], missingRequiredColumns: ["nom", "prix_vente"] };
  }

  const [headerRow, ...dataRows] = table;
  const columnMap = resolveColumnMap(headerRow);

  const missingRequiredColumns: string[] = [];
  if (columnMap.nom === undefined) missingRequiredColumns.push("nom");
  if (columnMap.prix_vente === undefined) missingRequiredColumns.push("prix_vente");
  if (missingRequiredColumns.length > 0) {
    return { rows: [], missingRequiredColumns };
  }

  const existingNamesLower = new Set(options.existingProducts.map((p) => p.name.trim().toLowerCase()));
  const existingBarcodes = new Set(
    options.existingProducts.map((p) => p.barcode).filter((b): b is string => !!b && b.trim() !== "")
  );
  const existingCategoryNamesLower = new Set(options.existingCategoryNames.map((c) => c.toLowerCase()));

  // Détection de doublons DANS le fichier lui-même
  const seenNamesInFile = new Map<string, number>(); // nom normalisé -> première ligne vue
  const seenBarcodesInFile = new Map<string, number>();

  const rows: ImportRowResult[] = dataRows.map((values, idx) => {
    const line = idx + 2; // +1 pour l'en-tête, +1 pour le 1-indexage
    const get = (key: string) => (columnMap[key] !== undefined ? values[columnMap[key]] : undefined);

    const raw: Record<string, string> = {};
    headerRow.forEach((h, i) => { raw[h] = values[i] ?? ""; });

    const errors: string[] = [];
    const warnings: string[] = [];

    const name = (get("nom") ?? "").trim();
    if (!name) errors.push("nom manquant");

    const { value: price, error: priceErr } = parseNumericField(get("prix_vente"));
    if (priceErr) errors.push(`prix_vente : ${priceErr}`);
    else if (price === null) errors.push("prix_vente manquant");
    else if (price < 0) errors.push("prix_vente négatif");
    else if (price === 0) warnings.push("prix_vente à 0");

    const { value: costPrice, error: costErr } = parseNumericField(get("prix_achat"));
    if (costErr) errors.push(`prix_achat : ${costErr}`);
    else if (costPrice !== null && costPrice < 0) errors.push("prix_achat négatif");

    const { value: stock, error: stockErr } = parseNumericField(get("stock"));
    if (stockErr) errors.push(`stock : ${stockErr}`);
    else if (stock !== null && stock < 0) errors.push("stock négatif");

    const { value: minStockAlert, error: alertErr } = parseNumericField(get("alerte_stock"));
    if (alertErr) errors.push(`alerte_stock : ${alertErr}`);
    else if (minStockAlert !== null && minStockAlert < 0) errors.push("alerte_stock négative");

    const barcode = (get("code_barres") ?? "").trim() || null;
    const categoryName = (get("categorie") ?? "").trim() || null;
    const unit = (get("unite") ?? "").trim() || "unité";
    const supplierName = (get("fournisseur") ?? "").trim() || null;
    const description = (get("description") ?? "").trim() || null;

    // Doublons contre la base existante
    if (name) {
      const nameLower = name.toLowerCase();
      if (existingNamesLower.has(nameLower)) {
        errors.push("un produit avec ce nom existe déjà");
      }
      const firstSeenLine = seenNamesInFile.get(nameLower);
      if (firstSeenLine !== undefined) {
        errors.push(`doublon de nom avec la ligne ${firstSeenLine} de ce fichier`);
      } else {
        seenNamesInFile.set(nameLower, line);
      }
    }
    if (barcode) {
      if (existingBarcodes.has(barcode)) {
        errors.push("un produit avec ce code-barres existe déjà");
      }
      const firstSeenLine = seenBarcodesInFile.get(barcode);
      if (firstSeenLine !== undefined) {
        errors.push(`doublon de code-barres avec la ligne ${firstSeenLine} de ce fichier`);
      } else {
        seenBarcodesInFile.set(barcode, line);
      }
    }

    // Catégorie inconnue -- avertissement, pas une erreur bloquante (peut être créée)
    if (categoryName && !existingCategoryNamesLower.has(categoryName.toLowerCase())) {
      warnings.push(`catégorie "${categoryName}" introuvable — sera créée si l'option est activée`);
    }

    return {
      line,
      raw,
      name,
      categoryName,
      price,
      costPrice,
      stock,
      minStockAlert,
      barcode,
      unit,
      supplierName,
      description,
      errors,
      warnings,
      valid: errors.length === 0,
    };
  });

  return { rows, missingRequiredColumns: [] };
}
