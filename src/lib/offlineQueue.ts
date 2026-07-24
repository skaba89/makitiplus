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

/**
 * H4 fix: Maximum age for a queued mutation before it's considered stale.
 * Mutations older than this are marked as failed during flush to prevent
 * replaying outdated operations (e.g., inserting a product that was deleted
 * 3 days ago). Set to 7 days.
 */
const MUTATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
  "increment_customer_credit_by_phone",
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

    // H4 fix: Skip mutations that are too old (stale)
    const mutationAge = Date.now() - new Date(mutation.createdAt).getTime();
    if (mutationAge > MUTATION_MAX_AGE_MS) {
      await updateMutationStatus(mutation.id, "failed", `Mutation expirée (${Math.floor(mutationAge / (24 * 60 * 60 * 1000))}j) — trop ancienne pour être rejouée`, false);
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
        const errMessage = result.error instanceof Error ? result.error.message : String(result.error);
        await updateMutationStatus(mutation.id, "failed", errMessage, false);
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

    // H4 fix: Skip RPC mutations that are too old (stale)
    const mutationAge = Date.now() - new Date(mutation.createdAt).getTime();
    if (mutationAge > MUTATION_MAX_AGE_MS) {
      await updateMutationStatus(mutation.id, "failed", `RPC expirée (${Math.floor(mutationAge / (24 * 60 * 60 * 1000))}j) — trop ancienne pour être rejouée`, true);
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
      const { error: rpcError } = await supabase.rpc(mutation.rpcName as never, mutation.data as never);

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
 *
 * FIX (C2): Uses upsert (put) instead of clear+put to avoid data loss
 * if the app crashes between clear and put. Each entry is upserted
 * individually, so a crash mid-write only loses the entries not yet written —
 * previously cached entries remain intact.
 *
 * For full replacement (e.g. refreshing the entire product catalog),
 * use `replaceAllCache()` instead.
 */
export async function cacheData<T extends { id: string }>(
  storeName: OfflineStoreName,
  data: T[]
): Promise<void> {
  const db = await getDB();
  const timestamp = new Date().toISOString();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const entry of data) {
      store.put({ ...entry, _cachedAt: timestamp });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Replace ALL data in a cache store atomically.
 *
 * This is the safe version of the old clear+put pattern:
 * 1. Write all new entries first (upsert)
 * 2. Delete any entries whose IDs are NOT in the new dataset
 * This ensures the store is never empty mid-transaction.
 */
export async function replaceAllCache<T extends { id: string }>(
  storeName: OfflineStoreName,
  data: T[]
): Promise<void> {
  const db = await getDB();
  const timestamp = new Date().toISOString();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    // Collect IDs of incoming data for stale cleanup
    const incomingIds = new Set(data.map((d) => d.id));

    // Upsert all new entries first
    for (const entry of data) {
      store.put({ ...entry, _cachedAt: timestamp });
    }

    // Remove stale entries (IDs not in the new dataset)
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const existing = getAllReq.result as (T & { _cachedAt?: string })[];
      for (const entry of existing) {
        if (!incomingIds.has(entry.id)) {
          store.delete(entry.id as IDBValidKey);
        }
      }
    };

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
// Offline stock decrement (C1 fix)
// ---------------------------------------------------------------------------

/**
 * Decrement stock_quantity for sold products in the local product cache.
 *
 * When a sale is made offline, the server-side stock decrement won't happen
 * until sync. This function updates the local IndexedDB product cache so
 * that subsequent offline sales see the reduced stock, preventing
 * double-selling items that are actually out of stock.
 *
 * This is a best-effort optimistic update — the server's
 * `create_sale_with_limit` RPC is the source of truth at sync time.
 */
export async function decrementLocalStock(
  saleItems: Array<{ product_id: string; quantity: number }>
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORES.PRODUCT_CACHE, "readwrite");
    const store = tx.objectStore(STORES.PRODUCT_CACHE);

    for (const item of saleItems) {
      const getReq = store.get(item.product_id);
      getReq.onsuccess = () => {
        const product = getReq.result as Record<string, unknown> | undefined;
        if (product && typeof product.stock_quantity === "number") {
          product.stock_quantity = Math.max(0, product.stock_quantity - item.quantity);
          store.put(product);
        }
      };
    }

    tx.oncomplete = () => {
      logger.info(`[OfflineStock] Decremented local stock for ${saleItems.length} item(s)`);
    };
    tx.onerror = () => {
      logger.warn("[OfflineStock] Failed to decrement local stock", tx.error);
    };
  } catch (e) {
    // Best-effort — never block a sale
    logger.warn("[OfflineStock] decrementLocalStock failed (non-blocking)", e);
  }
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

// ---------------------------------------------------------------------------
// Flush mutex (H1 fix)
// ---------------------------------------------------------------------------

let flushInProgress = false;

/**
 * Check if a flush is currently in progress.
 * Used by OfflineContext to prevent concurrent flush operations.
 */
export function isFlushInProgress(): boolean {
  return flushInProgress;
}

/**
 * Wraps flushQueue with a mutex to prevent concurrent flushes.
 *
 * Without this, the auto-sync on "online" event and a manual
 * "Synchroniser" button click could both call flushQueue()
 * simultaneously, leading to duplicate mutations being replayed.
 */
export async function flushQueueWithMutex(): Promise<{ synced: number; failed: number }> {
  if (flushInProgress) {
    logger.info("[flushQueue] Flush already in progress — skipping");
    return { synced: 0, failed: 0 };
  }

  flushInProgress = true;
  try {
    return await flushQueue();
  } finally {
    flushInProgress = false;
  }
}

// ---------------------------------------------------------------------------
// Mutation cleanup & retry utilities
// ---------------------------------------------------------------------------

/**
 * Remove failed mutations older than 24 hours from both queues.
 *
 * Without this, failed mutations accumulate indefinitely in IndexedDB,
 * consuming storage and confusing the pending count. We keep failed
 * mutations for 24h so the user can review them, then clean up.
 *
 * Also removes mutations that have exceeded the retry limit (retryCount >= 5)
 * regardless of age — these are permanently stuck and should not persist.
 */
export async function cleanupExpiredMutations(): Promise<{ removed: number }> {
  const db = await getDB();
  const FAILED_RETENTION_MS = 24 * 60 * 60 * 1000; // 24h
  const MAX_RETRIES = 5;
  const now = Date.now();
  let removed = 0;

  const cleanStore = (storeName: StoreName): Promise<number> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const mutations = getAllReq.result as QueuedMutation[];
        for (const m of mutations) {
          if (m.status === "failed") {
            const age = now - new Date(m.createdAt).getTime();
            // Remove if older than retention period OR permanently stuck
            if (age > FAILED_RETENTION_MS || m.retryCount >= MAX_RETRIES) {
              store.delete(m.id as IDBValidKey);
              removed++;
            }
          }
        }
      };
      tx.oncomplete = () => resolve(removed);
      tx.onerror = () => reject(tx.error);
    });

  await Promise.all([
    cleanStore(STORES.MUTATION_QUEUE),
    cleanStore(STORES.RPC_QUEUE),
  ]);

  if (removed > 0) {
    logger.info(`[cleanupExpiredMutations] Removed ${removed} expired/failed mutation(s)`);
  }

  return { removed };
}

/**
 * Reset failed mutations back to "pending" status so they can be retried
 * on the next flush cycle.
 *
 * Only resets mutations that haven't exceeded the max retry count.
 * Returns the count of mutations that were reset.
 */
export async function retryFailedMutations(): Promise<{ retried: number }> {
  const db = await getDB();
  const MAX_RETRIES = 5;
  let retried = 0;

  const resetStore = (storeName: StoreName): Promise<number> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const mutations = getAllReq.result as QueuedMutation[];
        for (const m of mutations) {
          if (m.status === "failed" && m.retryCount < MAX_RETRIES) {
            m.status = "pending";
            m.error = undefined;
            store.put(m);
            retried++;
          }
        }
      };
      tx.oncomplete = () => resolve(retried);
      tx.onerror = () => reject(tx.error);
    });

  await Promise.all([
    resetStore(STORES.MUTATION_QUEUE),
    resetStore(STORES.RPC_QUEUE),
  ]);

  if (retried > 0) {
    logger.info(`[retryFailedMutations] Reset ${retried} failed mutation(s) to pending`);
  }

  return { retried };
}

/**
 * Get count of failed mutations across both queues.
 * Used by UI to show a "retry" button when there are failed operations.
 */
export async function getFailedCount(): Promise<{ count: number }> {
  const db = await getDB();

  const countFailed = (storeName: StoreName): Promise<number> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const index = store.index("status");
      const request = index.count("failed");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  const [regular, rpc] = await Promise.all([
    countFailed(STORES.MUTATION_QUEUE),
    countFailed(STORES.RPC_QUEUE),
  ]);

  return { count: regular + rpc };
}

