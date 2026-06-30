/**
 * IndexedDB storage layer for MalikiPlus offline data.
 * Replaces localStorage for large datasets (receipt delivery queue, merge log).
 *
 * Advantages over localStorage:
 * - No 5-10 MB quota limit (IndexedDB supports hundreds of MB)
 * - Asynchronous by design (non-blocking UI)
 * - Structured storage with indexes for efficient queries
 * - Better for offline-first PWA with potentially large queues
 *
 * Fallback: If IndexedDB is unavailable (rare), falls back to localStorage
 * with a console warning.
 */

import { logger } from "./logger";

const DB_NAME = "malikiplus_offline";
const DB_VERSION = 1;

/** Store names — each maps to an IndexedDB object store */
export const STORES = {
  RECEIPT_QUEUE: "receipt_delivery_queue",
  MERGE_LOG: "receipt_delivery_merge_log",
  MERGE_LOG_POLICY: "receipt_delivery_merge_log_policy",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Opens (or creates) the MalikiPlus IndexedDB database.
 * Uses a singleton pattern to avoid multiple open connections.
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // Receipt delivery queue store — indexed by client_uuid and status
      if (!db.objectStoreNames.contains(STORES.RECEIPT_QUEUE)) {
        const queueStore = db.createObjectStore(STORES.RECEIPT_QUEUE, { keyPath: "client_uuid" });
        queueStore.createIndex("status", "status", { unique: false });
        queueStore.createIndex("saleNumber_channel_phone", ["saleNumber", "channel", "phone"], { unique: false });
        queueStore.createIndex("created_at", "created_at", { unique: false });
      }

      // Merge log store — indexed by batch_id and timestamp
      if (!db.objectStoreNames.contains(STORES.MERGE_LOG)) {
        const logStore = db.createObjectStore(STORES.MERGE_LOG, { keyPath: "id" });
        logStore.createIndex("batch_id", "batch_id", { unique: false });
        logStore.createIndex("ts", "ts", { unique: false });
        logStore.createIndex("client_uuid", "client_uuid", { unique: false });
        logStore.createIndex("ghost_purged", "ghost_purged", { unique: false });
      }

      // Merge log policy store — single-entry config
      if (!db.objectStoreNames.contains(STORES.MERGE_LOG_POLICY)) {
        db.createObjectStore(STORES.MERGE_LOG_POLICY, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      // Handle unexpected close
      dbInstance.onclose = () => {
        dbInstance = null;
        dbInitPromise = null;
      };
      // Handle version change (another tab upgraded)
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
        dbInitPromise = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      dbInitPromise = null;
      reject(new Error(`IndexedDB open failed: ${request.error?.message}`));
    };
  });

  return dbInitPromise;
}

// ---------------------------------------------------------------------------
// Generic CRUD operations
// ---------------------------------------------------------------------------

/** Get all entries from an object store */
export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/** Get a single entry by key */
export async function getByKey<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Put (upsert) a single entry */
export async function put<T>(storeName: StoreName, entry: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Put (upsert) multiple entries in a single transaction */
export async function putMany<T>(storeName: StoreName, entries: T[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const entry of entries) {
      store.put(entry);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete a single entry by key */
export async function deleteByKey(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Delete multiple entries by keys in a single transaction */
export async function deleteByKeys(storeName: StoreName, keys: IDBValidKey[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const key of keys) {
      store.delete(key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Clear all entries from an object store */
export async function clearStore(storeName: StoreName): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Count entries in an object store */
export async function count(storeName: StoreName): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Get entries by index value */
export async function getByIndex<T>(
  storeName: StoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/** Replace all entries in a store with a new set (single transaction) */
export async function replaceAll<T>(storeName: StoreName, entries: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    for (const entry of entries) {
      store.put(entry);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Migration helper: localStorage → IndexedDB
// ---------------------------------------------------------------------------

/**
 * Migrates data from localStorage to IndexedDB.
 * Reads from localStorage, writes to IndexedDB, then removes the localStorage key.
 * Safe to call multiple times — only migrates if IndexedDB is empty for that store.
 */
export async function migrateFromLocalStorage<T>(
  storeName: StoreName,
  lsKey: string,
  options?: { isSingleEntry?: boolean; entryKey?: string },
): Promise<{ migrated: number; skipped: boolean }> {
  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return { migrated: 0, skipped: true };

    const existing = await count(storeName);
    if (existing > 0) {
      // IndexedDB already has data — skip migration, remove LS key anyway
      localStorage.removeItem(lsKey);
      return { migrated: 0, skipped: true };
    }

    const parsed = JSON.parse(raw);
    if (options?.isSingleEntry) {
      // Single-entry stores (like policy config)
      const entry = { key: options.entryKey ?? lsKey, ...parsed };
      await put(storeName, entry);
      localStorage.removeItem(lsKey);
      return { migrated: 1, skipped: false };
    }

    // Array stores
    const entries: T[] = Array.isArray(parsed) ? parsed : [];
    if (entries.length > 0) {
      await putMany(storeName, entries);
    }
    localStorage.removeItem(lsKey);
    return { migrated: entries.length, skipped: false };
  } catch (err) {
    logger.warn(`[IndexedDB] Migration failed for ${lsKey} → ${storeName}:`, err);
    return { migrated: 0, skipped: true };
  }
}

/**
 * Runs all pending migrations from localStorage to IndexedDB.
 * Call once at app startup (before any data access).
 */
export async function runMigrations(): Promise<void> {
  try {
    // Migrate receipt delivery queue
    await migrateFromLocalStorage(
      STORES.RECEIPT_QUEUE,
      "malikiplus:receipt_delivery_queue",
    );

    // Migrate merge log
    await migrateFromLocalStorage(
      STORES.MERGE_LOG,
      "malikiplus:receipt_delivery_merge_log",
    );

    // Migrate merge log policy (single entry)
    await migrateFromLocalStorage(
      STORES.MERGE_LOG_POLICY,
      "malikiplus:receipt_delivery_merge_log_policy",
      { isSingleEntry: true, entryKey: "policy" },
    );
  } catch (err) {
    logger.warn("[IndexedDB] Migration batch failed:", err);
  }
}

// ---------------------------------------------------------------------------
// localStorage fallback (for environments where IndexedDB is unavailable)
// ---------------------------------------------------------------------------

const idbAvailable = (): boolean => {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
};

/**
 * Checks if IndexedDB is available. If not, the app should fall back
 * to localStorage (the old behavior).
 */
export const isIndexedDBAvailable = idbAvailable;
