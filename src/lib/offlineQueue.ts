/**
 * Offline Mutation Queue for MakitiPlus
 *
 * When the app is offline, mutations (INSERT/UPDATE/DELETE) are stored in IndexedDB.
 * When connectivity is restored, the queue is flushed in order.
 *
 * Each queued operation stores:
 * - The Supabase table, operation type, and data
 * - A unique ID for deduplication
 * - Timestamp and retry count
 */

import { STORES, type StoreName } from "./indexedDBStorage";
import type { DynamicSupabaseQuery } from "./supabaseDynamicQuery";

// Extend the STORES constant with new stores for offline queue
const OFFLINE_DB_NAME = "malikiplus_offline";
const OFFLINE_DB_VERSION = 2; // Bumped from v1 to add new stores

export const OFFLINE_STORES = {
  ...STORES,
  MUTATION_QUEUE: "mutation_queue",
  PRODUCT_CACHE: "product_cache",
  CATEGORY_CACHE: "category_cache",
  CUSTOMER_CACHE: "customer_cache",
  SALE_CACHE: "sale_cache",
} as const;

export type OfflineStoreName = (typeof OFFLINE_STORES)[keyof typeof OFFLINE_STORES];

export interface QueuedMutation {
  id: string;
  table: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  data: Record<string, unknown>;
  filter?: Record<string, unknown>; // For UPDATE/DELETE: which row(s) to target
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

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

function openOfflineDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // Keep existing stores (they already exist if v1)
      // Create new stores for v2
      if (!db.objectStoreNames.contains(OFFLINE_STORES.MUTATION_QUEUE)) {
        const queueStore = db.createObjectStore(OFFLINE_STORES.MUTATION_QUEUE, { keyPath: "id" });
        queueStore.createIndex("status", "status", { unique: false });
        queueStore.createIndex("createdAt", "createdAt", { unique: false });
        queueStore.createIndex("table", "table", { unique: false });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.PRODUCT_CACHE)) {
        const productStore = db.createObjectStore(OFFLINE_STORES.PRODUCT_CACHE, { keyPath: "id" });
        productStore.createIndex("category_id", "category_id", { unique: false });
        productStore.createIndex("updated_at", "updated_at", { unique: false });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.CATEGORY_CACHE)) {
        db.createObjectStore(OFFLINE_STORES.CATEGORY_CACHE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.CUSTOMER_CACHE)) {
        const customerStore = db.createObjectStore(OFFLINE_STORES.CUSTOMER_CACHE, { keyPath: "id" });
        customerStore.createIndex("phone", "phone", { unique: false });
      }

      if (!db.objectStoreNames.contains(OFFLINE_STORES.SALE_CACHE)) {
        const saleStore = db.createObjectStore(OFFLINE_STORES.SALE_CACHE, { keyPath: "id" });
        saleStore.createIndex("sale_number", "sale_number", { unique: false });
        saleStore.createIndex("created_at", "created_at", { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onclose = () => {
        dbInstance = null;
        dbInitPromise = null;
      };
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
        dbInitPromise = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      dbInitPromise = null;
      reject(new Error(`OfflineDB open failed: ${request.error?.message}`));
    };
  });

  return dbInitPromise;
}

// ---------------------------------------------------------------------------
// Mutation Queue
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
  if (!ALLOWED_TABLES.has(mutation.table)) {
    throw new Error(`Offline queue: table "${mutation.table}" is not in the allowed list`);
  }

  const db = await openOfflineDB();
  const entry: QueuedMutation = {
    ...mutation,
    id: generateId(),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.MUTATION_QUEUE, "readwrite");
    const store = tx.objectStore(OFFLINE_STORES.MUTATION_QUEUE);
    const request = store.put(entry);
    request.onsuccess = () => resolve(entry);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all pending mutations, ordered by creation time.
 */
export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.MUTATION_QUEUE, "readonly");
    const store = tx.objectStore(OFFLINE_STORES.MUTATION_QUEUE);
    const index = store.index("createdAt");
    const request = index.getAll();
    request.onsuccess = () => {
      const all = request.result as QueuedMutation[];
      resolve(all.filter((m) => m.status === "pending" || m.status === "failed"));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the count of pending mutations.
 */
export async function getPendingCount(): Promise<{ count: number }> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.MUTATION_QUEUE, "readonly");
    const store = tx.objectStore(OFFLINE_STORES.MUTATION_QUEUE);
    const index = store.index("status");
    const request = index.count("pending");
    request.onsuccess = () => resolve({ count: request.result });
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update a mutation's status in the queue.
 */
async function updateMutationStatus(id: string, status: QueuedMutation["status"], error?: string): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.MUTATION_QUEUE, "readwrite");
    const store = tx.objectStore(OFFLINE_STORES.MUTATION_QUEUE);
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
async function removeMutation(id: string): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORES.MUTATION_QUEUE, "readwrite");
    const store = tx.objectStore(OFFLINE_STORES.MUTATION_QUEUE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Flush the mutation queue: attempt to sync all pending mutations to Supabase.
 * Returns stats about how many succeeded/failed.
 */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const { supabase } = await import("@/integrations/supabase/client");
  const pending = await getPendingMutations();

  let synced = 0;
  let failed = 0;

  for (const mutation of pending) {
    if (mutation.retryCount >= 5) {
      await updateMutationStatus(mutation.id, "failed", "Max retries exceeded");
      failed++;
      continue;
    }

    await updateMutationStatus(mutation.id, "syncing");

    try {
      let result;

      switch (mutation.operation) {
        case "INSERT":
          result = await (supabase.from(mutation.table as never) as unknown as DynamicSupabaseQuery).insert(mutation.data as never);
          break;
        case "UPDATE": {
          let query: DynamicSupabaseQuery = (supabase.from(mutation.table as never) as unknown as DynamicSupabaseQuery).update(mutation.data as never);
          // Apply filters
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
      }

      if (result?.error) {
        await updateMutationStatus(mutation.id, "failed", result.error.message);
        failed++;
      } else {
        await removeMutation(mutation.id);
        synced++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateMutationStatus(mutation.id, "failed", message);
      failed++;
    }
  }

  return { synced, failed };
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
  const db = await openOfflineDB();
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
  const db = await openOfflineDB();
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
  const db = await openOfflineDB();
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
  const db = await openOfflineDB();
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
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
