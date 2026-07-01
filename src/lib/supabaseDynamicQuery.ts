/**
 * Type-safe interface for dynamic Supabase queries.
 *
 * When table names are dynamic (e.g. passed as a function parameter),
 * Supabase's strongly-typed `.from()` can't infer the schema. Instead of
 * using `any`, this interface defines the minimal chainable query API
 * that our hooks and utilities actually use, preserving type safety
 * for method names and signatures while remaining flexible on the
 * underlying table schema.
 *
 * Usage:
 *   let query: DynamicSupabaseQuery = supabase.from(table as never).select("*");
 *   query = query.eq("organization_id", orgId);
 *   const { data, error } = await query;
 */

interface SupabaseResult {
  data: unknown[] | null;
  error: unknown | null;
  count: number | null;
}

interface DynamicSupabaseQuery extends Promise<SupabaseResult> {
  // Filter methods
  eq(column: string, value: unknown): DynamicSupabaseQuery;
  neq(column: string, value: unknown): DynamicSupabaseQuery;
  gt(column: string, value: number): DynamicSupabaseQuery;
  gte(column: string, value: number): DynamicSupabaseQuery;
  lt(column: string, value: number): DynamicSupabaseQuery;
  lte(column: string, value: number): DynamicSupabaseQuery;
  is(column: string, value: boolean | null): DynamicSupabaseQuery;
  ilike(column: string, pattern: string): DynamicSupabaseQuery;
  or(filters: string): DynamicSupabaseQuery;
  in(column: string, values: unknown[]): DynamicSupabaseQuery;

  // Selection methods
  select(columns?: string, options?: { count?: "exact" | "planned" | "estimated" }): DynamicSupabaseQuery;
  insert(data: unknown): DynamicSupabaseQuery;
  update(data: unknown): DynamicSupabaseQuery;
  delete(): DynamicSupabaseQuery;

  // Pagination & ordering
  range(from: number, to: number): DynamicSupabaseQuery;
  limit(count: number): DynamicSupabaseQuery;
  order(column: string, options?: { ascending?: boolean }): DynamicSupabaseQuery;

  // Single result
  single(): DynamicSupabaseQuery;
}

export type { DynamicSupabaseQuery, SupabaseResult };
