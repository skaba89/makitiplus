/**
 * Lightweight prefix search index for products.
 * Builds an in-memory map keyed by lowercased name tokens + barcode prefixes.
 * Optimized for catalogs up to ~50k products on low-end devices.
 */

export interface SearchableProduct {
  id: string;
  name: string;
  barcode?: string | null;
  [k: string]: unknown;
}

export interface ProductSearchIndex<T extends SearchableProduct> {
  search: (query: string, limit?: number) => T[];
  size: number;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // strip accents

export function buildProductSearchIndex<T extends SearchableProduct>(
  products: T[]
): ProductSearchIndex<T> {
  // Map prefix -> Set of product indices
  const prefixMap = new Map<string, Set<number>>();
  const normalizedNames: string[] = new Array(products.length);
  const normalizedBarcodes: string[] = new Array(products.length);

  const MAX_PREFIX_LEN = 6; // index up to 6 chars; longer queries fall back to filter

  products.forEach((p, idx) => {
    const name = normalize(p.name || "");
    normalizedNames[idx] = name;
    normalizedBarcodes[idx] = (p.barcode || "").toLowerCase();

    // Tokenize name (split on whitespace + punctuation)
    const tokens = name.split(/[\s\-_/.,;:]+/).filter(Boolean);

    for (const token of tokens) {
      for (let len = 1; len <= Math.min(MAX_PREFIX_LEN, token.length); len++) {
        const prefix = token.slice(0, len);
        let bucket = prefixMap.get(prefix);
        if (!bucket) {
          bucket = new Set();
          prefixMap.set(prefix, bucket);
        }
        bucket.add(idx);
      }
    }

    // Index barcode prefixes too
    const bc = normalizedBarcodes[idx];
    if (bc) {
      for (let len = 1; len <= Math.min(MAX_PREFIX_LEN, bc.length); len++) {
        const prefix = bc.slice(0, len);
        let bucket = prefixMap.get(prefix);
        if (!bucket) {
          bucket = new Set();
          prefixMap.set(prefix, bucket);
        }
        bucket.add(idx);
      }
    }
  });

  const search = (rawQuery: string, limit = 10): T[] => {
    const query = normalize(rawQuery.trim());
    if (!query) return [];

    const lookupKey = query.slice(0, 6);
    const candidates = prefixMap.get(lookupKey);

    if (!candidates) {
      // Fallback: longer query than indexed prefix — substring search on normalized names
      const out: T[] = [];
      for (let i = 0; i < products.length && out.length < limit; i++) {
        if (
          normalizedNames[i].includes(query) ||
          normalizedBarcodes[i].includes(query)
        ) {
          out.push(products[i]);
        }
      }
      return out;
    }

    // Score: exact prefix start > token-starts-with > contains
    const scored: { product: T; score: number }[] = [];
    for (const idx of candidates) {
      const name = normalizedNames[idx];
      const bc = normalizedBarcodes[idx];
      let score = 0;
      if (name.startsWith(query)) score = 100;
      else if (bc && bc.startsWith(query)) score = 90;
      else if (name.split(/[\s\-_/.,;:]+/).some((t) => t.startsWith(query)))
        score = 50;
      else if (name.includes(query) || (bc && bc.includes(query))) score = 10;

      if (score > 0) scored.push({ product: products[idx], score });
    }

    scored.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
    return scored.slice(0, limit).map((s) => s.product);
  };

  return { search, size: products.length };
}
