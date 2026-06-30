import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch all rows from a Supabase table using batched pagination.
 *
 * Supabase PostgREST has a `db-max-rows` setting (default 500 on newer
 * projects) that silently truncates results when no explicit `.limit()` or
 * `.range()` is set.  This helper fetches rows in batches of `batchSize`
 * using `.range()` with `count: "exact"` to determine when all rows have
 * been loaded.
 *
 * @param table    - Table name (e.g. "products")
 * @param select   - Select string (e.g. "*, categories(name, color, icon)")
 * @param options  - Optional filters, ordering, and batch size
 * @returns        - Array of all matching rows
 */
export async function fetchAllRows<T = unknown>(
  table: string,
  select: string = "*",
  options?: {
    filters?: Array<{
      column: string;
      operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is";
      value: unknown;
    }>;
    orderBy?: { column: string; ascending?: boolean };
    batchSize?: number;
  }
): Promise<T[]> {
  const batchSize = options?.batchSize ?? 500;
  const allRows: T[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * batchSize;
    const to = from + batchSize - 1;

    let query = supabase
      .from(table)
      .select(select, { count: "exact" })
      .range(from, to);

    // Apply filters
    if (options?.filters) {
      for (const f of options.filters) {
        switch (f.operator) {
          case "eq":
            query = query.eq(f.column, f.value);
            break;
          case "neq":
            query = query.neq(f.column, f.value);
            break;
          case "gt":
            query = query.gt(f.column, f.value as number);
            break;
          case "gte":
            query = query.gte(f.column, f.value as number);
            break;
          case "lt":
            query = query.lt(f.column, f.value as number);
            break;
          case "lte":
            query = query.lte(f.column, f.value as number);
            break;
          case "is":
            query = query.is(f.column, f.value);
            break;
        }
      }
    }

    // Apply ordering
    if (options?.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? false,
      });
    }

    const { data, count, error } = await query;

    if (error) throw error;

    if (data && data.length > 0) {
      allRows.push(...(data as T[]));
    }

    // If we got fewer rows than the batch size, or we've reached the total count, we're done
    const total = count ?? 0;
    if (!data || data.length < batchSize || allRows.length >= total) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allRows;
}
