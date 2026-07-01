/**
 * Sanitize user input for PostgREST filter expressions.
 *
 * PostgREST's `.or()`, `.ilike()`, etc. accept raw filter strings where
 * special characters like `%`, `,`, `)`, `(` can break the expression
 * or alter query semantics (injection risk).
 *
 * This function strips PostgREST-dangerous characters while preserving
 * normal search terms.
 */

/** Characters that have special meaning in PostgREST filter syntax */
const DANGEROUS_CHARS = /[%(),.]/g;

/**
 * Sanitize a string for safe use in PostgREST `.ilike()` and `.or()` filters.
 * Removes `%` (wildcard), `,` (separator), `()` (grouping), `.` (dot notation).
 */
export function sanitizeSearchInput(input: string): string {
  return input.replace(DANGEROUS_CHARS, "");
}

/**
 * Build a safe PostgREST `.or()` filter string for multi-column ilike search.
 *
 * Example: `buildSafeOrFilter(["name", "barcode"], "riz")`
 * → `"name.ilike.%riz%,barcode.ilike.%riz%"`
 */
export function buildSafeOrFilter(
  columns: string[],
  query: string
): string {
  const safe = sanitizeSearchInput(query.trim());
  if (!safe) return "";
  return columns.map((col) => `${col}.ilike.%${safe}%`).join(",");
}
