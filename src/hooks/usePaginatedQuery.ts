import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

interface Filter {
  column: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is";
  value: unknown;
}

interface SearchSingle {
  column: string;
  query: string;
}

interface SearchMulti {
  columns: string[];
  query: string;
}

type SearchOption = SearchSingle | SearchMulti;

interface PaginatedQueryOptions {
  table: string;
  select?: string;
  filters?: Filter[];
  orderBy?: { column: string; ascending?: boolean };
  search?: SearchOption;
  page: number;
  pageSize: number;
  queryKey: string[];
  enabled?: boolean;
}

interface PaginatedResult<T> {
  data: T[] | null;
  totalCount: number;
  totalPages: number;
  isLoading: boolean;
  error: unknown;
}

export function usePaginatedQuery<T = unknown>(
  options: PaginatedQueryOptions
): PaginatedResult<T> {
  const {
    table,
    select = "*",
    filters = [],
    orderBy = { column: "created_at", ascending: false },
    search,
    page,
    pageSize = 20,
    queryKey,
    enabled = true,
  } = options;

  // Stable serialisation of filters for the query key
  const filtersKey = filters.map((f) => `${f.column}${f.operator}${String(f.value)}`).join("|");
  const searchKey = search
    ? "columns" in search
      ? `${search.columns.join(",")}:${search.query}`
      : `${search.column}:${search.query}`
    : "";

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKey, page, pageSize, searchKey, filtersKey],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Use dynamic table name — cast through any to satisfy Supabase's typed .from()
      let query: AnyQuery = supabase
        .from(table as never)
        .select(select, { count: "exact" })
        .range(from, to);

      // Apply filters
      for (const f of filters) {
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
            query = query.is(f.column, f.value as boolean | null);
            break;
        }
      }

      // Apply search
      if (search?.query) {
        if ("columns" in search) {
          // Multi-column OR search: name.ilike.%query%,barcode.ilike.%query%
          const orParts = search.columns
            .map((col) => `${col}.ilike.%${search.query}%`)
            .join(",");
          query = query.or(orParts);
        } else {
          // Single-column search
          query = query.ilike(search.column, `%${search.query}%`);
        }
      }

      // Apply ordering
      query = query.order(orderBy.column, {
        ascending: orderBy.ascending ?? false,
      });

      const { data: rows, count, error: queryError } = await query;

      if (queryError) throw queryError;

      return {
        data: rows as T[],
        totalCount: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    },
    enabled,
  });

  return {
    data: data?.data ?? null,
    totalCount: data?.totalCount ?? 0,
    totalPages: data?.totalPages ?? 0,
    isLoading,
    error,
  };
}
