import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOnlineStatus } from "@/contexts/OfflineContext";
import { enqueueMutation, cacheData, getCachedData, OFFLINE_STORES } from "@/lib/offlineQueue";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

/**
 * Offline-aware query: fetches from Supabase when online,
 * falls back to IndexedDB cache when offline.
 *
 * Automatically caches successful responses for offline use.
 */
export function useOfflineQuery<T extends { id: string }>(
  queryKey: string[],
  table: string,
  cacheStore: string,
  options?: {
    select?: string;
    filter?: Record<string, string>;
    orderBy?: string;
    orderAsc?: boolean;
    enabled?: boolean;
  }
) {
  const { isOnline } = useOnlineStatus();
  const { user } = useAuth();

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!isOnline) {
        // Offline: read from IndexedDB cache
        const cached = await getCachedData<T>(cacheStore as keyof typeof OFFLINE_STORES);
        return cached;
      }

      // Online: fetch from Supabase
      let query = supabase.from(table).select(options?.select || "*");

      if (options?.filter) {
        for (const [key, value] of Object.entries(options.filter)) {
          query = query.eq(key, value);
        }
      }

      query = query.order(options?.orderBy || "created_at", {
        ascending: options?.orderAsc ?? false,
      });

      const { data, error } = await query;

      if (error) throw error;

      // Cache the data for offline use
      if (data && data.length > 0) {
        await cacheData(cacheStore as keyof typeof OFFLINE_STORES, data as T[]).catch(() => {
          // Cache failure shouldn't break the query
        });
      }

      return (data as T[]) || [];
    },
    enabled: options?.enabled !== undefined ? options.enabled : !!user,
    staleTime: isOnline ? 5 * 60 * 1000 : Infinity, // Don't refetch when offline
  });

  return query;
}

/**
 * Offline-aware mutation: sends to Supabase when online,
 * enqueues to IndexedDB when offline for later sync.
 */
export function useOfflineMutation<TData = unknown>(
  table: string,
  operation: "INSERT" | "UPDATE" | "DELETE",
  options?: {
    invalidateKeys?: string[];
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
    successMessage?: string;
    errorMessage?: string;
  }
) {
  const { isOnline } = useOnlineStatus();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (mutationData: {
      data?: Record<string, unknown>;
      filter?: Record<string, unknown>;
    }) => {
      if (!isOnline) {
        // Offline: enqueue the mutation
        await enqueueMutation({
          table,
          operation,
          data: mutationData.data || {},
          filter: mutationData.filter,
        });

        return { offline: true, queued: true } as unknown as TData;
      }

      // Online: execute immediately
      let result;

      switch (operation) {
        case "INSERT":
          result = await supabase
            .from(table)
            .insert({ ...mutationData.data, user_id: user!.id })
            .select()
            .single();
          break;
        case "UPDATE":
          result = await supabase
            .from(table)
            .update(mutationData.data)
            .match(mutationData.filter || {});
          break;
        case "DELETE":
          result = await supabase
            .from(table)
            .delete()
            .match(mutationData.filter || {});
          break;
      }

      if (result?.error) throw result.error;
      return result?.data as TData;
    },
    onSuccess: (data) => {
      // Invalidate related queries
      if (options?.invalidateKeys) {
        for (const key of options.invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }

      if ((data as { offline?: boolean })?.offline) {
        toast({
          title: "Modification enregistrée hors-ligne",
          description: "Elle sera synchronisée à la reconnexion.",
        });
      } else if (options?.successMessage) {
        toast({ title: options.successMessage });
      }

      options?.onSuccess(data);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: options?.errorMessage || "Erreur",
        description: error.message,
      });
      options?.onError(error);
    },
  });
}
