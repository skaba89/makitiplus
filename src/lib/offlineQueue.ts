/**
 * Offline Mutation Queue for MakitiPlus
 *
 * When the app is offline, mutations (INSERT/UPDATE/DELETE/RPC) are stored in IndexedDB.
 * When connectivity is restored, the queue is flushed in order.
 *
 * Each queued operation stores:
 * - The Supabase table/RPC, operation type, and data
 * - A unique ID for deduplication
 * - Timestamp and retry count
 *
 * IMPORTANT: This module uses the shared getDB() from indexedDBStorage.ts
 * to avoid the dual-singleton race condition that existed before.
 */

import { STORES, getDB, type StoreName } from "./indexedDBStorage";
import type { DynamicSupabaseQuery } from "./supabaseDynamicQuery";
import { logger } from "@/lib/logger";

// Re-export STORES for backward compatibility with consumers
export const OFFLINE_STORES = STORES;
export type OfflineStoreName = StoreName;

export interface QueuedMutation {
  id: string;
  table: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "RPC";
  data: Record<string, unknown>;
  filter?: Record<string, unknown>; // For UPDATE/DELETE: which row(s) to target
  rpcName?: string; // For RPC: the Supabase RPC function name
  organizationId?: string; // Organization scope — used for security validation on flush
  userId?: string; // User who created the mutation — validated on flush
  createdAt: string;
  retryCount: number;
  status: "pending" | "syncing" | "failed";
  error?: string;
}

// H3: Allowlist of permitted tables for offline mutations — prevents arbitrary table writes
const ALLOWED_TABLES = new Set([
  "sales",
  "sale_items",
  "products",
  "expenses",
  "customer_credits",
  "customers",
  "stock_movements",
  "categories",
]);

// Allowlist of permitted RPC names for offline RPC queue
const ALLOWED_RPCS = new Set([
  "create_sale_with_limit",
  "increment_customer_credit",
]);

// ---------------------------------------------------------------------------
// Mutation Queue (generic table-level operations)
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Enqueue a mutation for later sync.
 * Returns the queued mutation with its ID.
 */
export async function enqueueMutation(mutation: Omit<QueuedMutation, "id" | "createdAt" | "retryCount" | "status">): Promise<QueuedMutation> {
  // Validate table against allowlist (H3: prevent arbitrary table writes)
  if (mutation.operation === "RPC") {
    if (!mutation.rpcName || !ALLOWED_RPCS.has(mutation.rpcName)) {
      throw new Error(`Offline queue: RPC "${mutation.rpcName}" is not in the allowed list`);
    }
  } else {
    if (!ALLOWED_TABLES.has(mutation.table)) {
      throw new Error(`Offline queue: table "${mutation.table}" is not in the allowed list`);
    }
  }

  const db = await getDB();
  const entry: QueuedMutation = {
    ...mutation,
    id: generateId(),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };

  return new Promise((resolve, reject) => {
    const storeName = mutation.operation === "RPC" ? STORES.RPC_QUEUE : STORES.MUTATION_QUEUE;
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(entry);
    request.onsuccess = () => resolve(entry);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all pending mutations, ordered by creation time.
 * Includes both regular mutations and RPC mutations.
 */
export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const db = await getDB();

  const getFromStore = (storeName: StoreName): Promise<QueuedMutation[]> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const index = store.index("createdAt");
      const request = index.getAll();
      request.onsuccess = () => {
        const all = request.result as QueuedMutation[];
        resolve(all.filter((m) => m.status === "pending" || m.status === "failed"));
      };
      request.onerror = () => reject(request.error);
    });

  const [regular, rpc] = await Promise.all([
    getFromStore(STORES.MUTATION_QUEUE),
    getFromStore(STORES.RPC_QUEUE),
  ]);

  // Merge and sort by createdAt
  return [...regular, ...rpc].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/**
 * Get the count of pending mutations (both regular + RPC).
 */
export async function getPendingCount(): Promise<{ count: number }> {
  const db = await getDB();

  const countStore = (storeName: StoreName): Promise<number> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const index = store.index("status");
      const request = index.count("pending");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  const [regular, rpc] = await Promise.all([
    countStore(STORES.MUTATION_QUEUE),
    countStore(STORES.RPC_QUEUE),
  ]);

  return { count: regular + rpc };
}

/**
 * Update a mutation's status in the queue.
 */
async function updateMutationStatus(
  id: string,
  status: QueuedMutation["status"],
  error?: string,
  isRPC: boolean = false
): Promise<void> {
  const db = await getDB();
  const storeName = isRPC ? STORES.RPC_QUEUE : STORES.MUTATION_QUEUE;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result as QueuedMutation | undefined;
      if (!entry) { resolve(); return; }
      entry.status = status;
      entry.retryCount += 1;
      if (error) entry.error = error;
      store.put(entry);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Remove a mutation from the queue after successful sync.
 */
async function removeMutation(id: string, isRPC: boolean = false): Promise<void> {
  const db = await getDB();
  const storeName = isRPC ? STORES.RPC_QUEUE : STORES.MUTATION_QUEUE;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Flush the regular mutation queue: attempt to sync all pending mutations to Supabase.
 * Returns stats about how many succeeded/failed.
 */
async function flushMutationQueue(
  pending: QueuedMutation[],
  user: { id: string },
  currentUserOrgId: string | null | undefined
): Promise<{ synced: number; failed: number }> {
  const { supabase } = await import("@/integrations/supabase/client");

  let synced = 0;
  let failed = 0;

  for (const mutation of pending) {
    if (mutation.operation === "RPC") continue; // RPC mutations handled separately

    if (mutation.retryCount >= 5) {
      await updateMutationStatus(mutation.id, "failed", "Max retries exceeded", false);
      failed++;
      continue;
    }

    // Security: Validate that the mutation belongs to the current user's organization
    if (mutation.organizationId && currentUserOrgId && mutation.organizationId !== currentUserOrgId) {
      await updateMutationStatus(mutation.id, "failed", "Organization mismatch — mutation rejected for security", false);
      failed++;
      continue;
    }

    // Security: Validate that the mutation was created by the current user
    if (mutation.userId && mutation.userId !== user.id) {
      await updateMutationStatus(mutation.id, "failed", "User mismatch — mutation rejected for security", false);
      failed++;
      continue;
    }

    // Security: Ensure mutation data includes the correct organization_id
    const dataWithOrg = currentUserOrgId ? {
      ...mutation.data,
      organization_id: mutation.data.organization_id || currentUserOrgId,
    } : mutation.data;

    await updateMutationStatus(mutation.id, "syncing", undefined, false);

    try {
      let result;

      switch (mutation.operation) {
        case "INSERT":
          result = await (supabase.from(mutation.table as never) as unknown as DynamicSupabaseQuery).insert(dataWithOrg as never);
          break;
        case "UPDATE": {
          let query: DynamicSupabaseQuery = (supabase.from(mutation.table as never) as unknown as DynamicSupabaseQuery).update(dataWithOrg as never);
          if (mutation.filter) {
            for (const [key, value] of Object.entries(mutation.filter)) {
              query = query.eq(key, value as string | number | boolean);
            }
          }
          result = await query;
          break;
        }
        case "DELETE": {
          let query: DynamicSupabaseQuery = (supabase.from(mutation.table as never) as unknown as DynamicSupabaseQuery).delete();
          if (mutation.filter) {
            for (const [key, value] of Object.entries(mutation.filter)) {
              query = query.eq(key, value as string | number | boolean);
            }
          }
          result = await query;
          break;
        }
        default:
          continue;
      }

      if (result?.error) {
        await updateMutationStatus(mutation.id, "failed", result.error.message, false);
        failed++;
      } else {
        await removeMutation(mutation.id, false);
        synced++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateMutationStatus(mutation.id, "failed", message, false);
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Flush the RPC mutation queue: replay RPC calls (e.g., create_sale_with_limit).
 * RPC mutations are replayed in order — they represent atomic operations
 * that cannot be decomposed into individual table mutations.
 */
async function flushRPCQueue(
  pending: QueuedMutation[],
  user: { id: string },
  currentUserOrgId: string | null | undefined
): Promise<{ synced: number; failed: number }> {
  const { supabase } = await import("@/integrations/supabase/client");

  let synced = 0;
  let failed = 0;

  const rpcMutations = pending.filter((m) => m.operation === "RPC");

  for (const mutation of rpcMutations) {
    if (mutation.retryCount >= 5) {
      await updateMutationStatus(mutation.id, "failed", "Max retries exceeded", true);
      failed++;
      continue;
    }

    // Security: Validate org and user
    if (mutation.organizationId && currentUserOrgId && mutation.organizationId !== currentUserOrgId) {
      await updateMutationStatus(mutation.id, "failed", "Organization mismatch — RPC rejected for security", true);
      failed++;
      continue;
    }

    if (mutation.userId && mutation.userId !== user.id) {
      await updateMutationStatus(mutation.id, "failed", "User mismatch — RPC rejected for security", true);
      failed++;
      continue;
    }

    if (!mutation.rpcName) {
      await updateMutationStatus(mutation.id, "failed", "Missing rpcName", true);
      failed++;
      continue;
    }

    await updateMutationStatus(mutation.id, "syncing", undefined, true);

    try {
      const { error: rpcError } = await supabase.rpc(mutation.rpcName, mutation.data);

      if (rpcError) {
        await updateMutationStatus(mutation.id, "failed", rpcError.message, true);
        failed++;
      } else {
        await removeMutation(mutation.id, true);
        synced++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateMutationStatus(mutation.id, "failed", message, true);
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Flush all queues: regular mutations + RPC mutations.
 * Returns stats about how many succeeded/failed.
 */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const { supabase } = await import("@/integrations/supabase/client");
  const pending = await getPendingMutations();

  // Security: Get current user's organization_id to validate mutations
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    logger.warn("[flushQueue] No authenticated user — skipping flush");
    return { synced: 0, failed: 0 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  const currentUserOrgId = profile?.organization_id;

  // Flush regular mutations first (they're typically simpler and non-atomic)
  const regularResult = await flushMutationQueue(pending, user, currentUserOrgId);

  // Then flush RPC mutations (atomic operations like sales)
  const rpcResult = await flushRPCQueue(pending, user, currentUserOrgId);

  return {
    synced: regularResult.synced + rpcResult.synced,
    failed: regularResult.failed + rpcResult.failed,
  };
}

// ---------------------------------------------------------------------------
// Data Cache (offline-first reads)
// ---------------------------------------------------------------------------

/**
 * Cache data to IndexedDB for offline access.
 */
export async function cacheData<T extends { id: string }>(
  storeName: OfflineStoreName,
  data: T[]
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    // Clear existing and put all new data
    store.clear();
    for (const entry of data) {
      store.put({ ...entry, _cachedAt: new Date().toISOString() });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Read cached data from IndexedDB.
 */
export async function getCachedData<T>(storeName: OfflineStoreName): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a single cached item by ID.
 */
export async function getCachedItem<T>(storeName: OfflineStoreName, id: string): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get cache age in seconds.
 */
export async function getCacheAge(storeName: OfflineStoreName): Promise<number | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const cachedAt = cursor.value._cachedAt as string | undefined;
        if (cachedAt) {
          resolve(Math.floor((Date.now() - new Date(cachedAt).getTime()) / 1000));
          return;
        }
      }
      resolve(null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all cached data for a store.
 */
export async function clearCache(storeName: OfflineStoreName): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Convenience: Enqueue an RPC mutation
// ---------------------------------------------------------------------------

/**
 * Enqueue an RPC call for later sync when offline.
 * Use this for atomic operations like create_sale_with_limit.
 */
export async function enqueueRPCMutation(params: {
  rpcName: string;
  data: Record<string, unknown>;
  userId?: string;
  organizationId?: string;
}): Promise<QueuedMutation> {
  return enqueueMutation({
    table: "__rpc__", // Placeholder — RPC mutations don't map to a table
    operation: "RPC",
    rpcName: params.rpcName,
    data: params.data,
    userId: params.userId,
    organizationId: params.organizationId,
  });
}
