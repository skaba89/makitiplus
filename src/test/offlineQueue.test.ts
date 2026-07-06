import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";

// Mock supabase to avoid real API calls
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => ({ data: null, error: null })) })) })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: { organization_id: "org-1" }, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: { id: "user-1" } } })
      ),
      getSession: vi.fn(),
    },
  },
}));

// Mock logger to avoid noise
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock sentry
vi.mock("@/lib/sentry", () => ({
  reportError: vi.fn(),
}));

/**
 * Helper: reset IndexedDB between tests.
 * 1. Close any existing connection
 * 2. Delete the database
 * 3. Reset module cache so getDB() re-initializes
 */
async function resetDatabase() {
  // Import current module state to close the DB
  const { getDB } = await import("@/lib/indexedDBStorage");
  try {
    const db = await getDB();
    db.close();
  } catch {
    // DB might not be open
  }

  // Delete the database
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("malikiplus_offline");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

  // Bust the module cache so next import gets fresh state
  vi.resetModules();
}

/**
 * Helper: insert a record into an IndexedDB store and wait for completion.
 */
async function insertRecord(storeName: string, record: Record<string, unknown>) {
  const { getDB } = await import("@/lib/indexedDBStorage");
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Helper: read a record from IndexedDB by key.
 */
async function readRecord(storeName: string, key: string) {
  const { getDB } = await import("@/lib/indexedDBStorage");
  const db = await getDB();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// cleanupExpiredMutations
// ---------------------------------------------------------------------------
describe("offlineQueue — cleanupExpiredMutations", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("supprime les mutations failed de plus de 24h", async () => {
    const { cleanupExpiredMutations, getFailedCount } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    // Insert an old failed mutation (25 hours old) — should be cleaned
    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "old-failed-1",
      table: "sales",
      operation: "INSERT",
      data: { name: "test" },
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      retryCount: 1,
      status: "failed",
      error: "Network error",
    });

    // Insert a recent failed mutation (1 hour old) — should NOT be cleaned
    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "recent-failed-1",
      table: "sales",
      operation: "INSERT",
      data: { name: "test2" },
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      retryCount: 1,
      status: "failed",
      error: "Timeout",
    });

    // Insert an old pending mutation — should NOT be cleaned
    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "old-pending-1",
      table: "sales",
      operation: "INSERT",
      data: { name: "test3" },
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      retryCount: 0,
      status: "pending",
    });

    const { removed } = await cleanupExpiredMutations();
    expect(removed).toBe(1);

    const { count: failedCount } = await getFailedCount();
    expect(failedCount).toBe(1); // recent-failed-1 still there
  });

  it("supprime les mutations avec retryCount >= 5 même si récentes", async () => {
    const { cleanupExpiredMutations, getFailedCount } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "max-retries-1",
      table: "expenses",
      operation: "INSERT",
      data: { amount: 100 },
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      retryCount: 5,
      status: "failed",
      error: "Max retries exceeded",
    });

    const { removed } = await cleanupExpiredMutations();
    expect(removed).toBe(1);

    const { count } = await getFailedCount();
    expect(count).toBe(0);
  });

  it("nettoie les mutations échouées dans les deux queues", async () => {
    const { cleanupExpiredMutations, getFailedCount } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "old-mut-1",
      table: "sales",
      operation: "INSERT",
      data: {},
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      retryCount: 1,
      status: "failed",
    });

    await insertRecord(STORES.RPC_QUEUE, {
      id: "old-rpc-1",
      table: "__rpc__",
      operation: "RPC",
      rpcName: "create_sale_with_limit",
      data: {},
      createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      retryCount: 2,
      status: "failed",
    });

    const { removed } = await cleanupExpiredMutations();
    expect(removed).toBe(2);

    const { count } = await getFailedCount();
    expect(count).toBe(0);
  });

  it("ne fait rien s'il n'y a pas de mutations à nettoyer", async () => {
    const { cleanupExpiredMutations } = await import("@/lib/offlineQueue");

    const { removed } = await cleanupExpiredMutations();
    expect(removed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// retryFailedMutations
// ---------------------------------------------------------------------------
describe("offlineQueue — retryFailedMutations", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("remet les mutations failed en pending si retryCount < 5", async () => {
    const { retryFailedMutations, getPendingCount, getFailedCount } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "retry-1",
      table: "sales",
      operation: "INSERT",
      data: { amount: 500 },
      createdAt: new Date().toISOString(),
      retryCount: 2,
      status: "failed",
      error: "Timeout",
    });

    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "retry-2",
      table: "expenses",
      operation: "INSERT",
      data: { amount: 200 },
      createdAt: new Date().toISOString(),
      retryCount: 1,
      status: "failed",
      error: "Network error",
    });

    const { retried } = await retryFailedMutations();
    expect(retried).toBe(2);

    const { count: failedCount } = await getFailedCount();
    expect(failedCount).toBe(0);

    const { count: pendingCount } = await getPendingCount();
    expect(pendingCount).toBe(2);
  });

  it("ignore les mutations avec retryCount >= 5", async () => {
    const { retryFailedMutations, getFailedCount } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "max-retries",
      table: "sales",
      operation: "INSERT",
      data: {},
      createdAt: new Date().toISOString(),
      retryCount: 5,
      status: "failed",
      error: "Max retries exceeded",
    });

    const { retried } = await retryFailedMutations();
    expect(retried).toBe(0);

    const { count } = await getFailedCount();
    expect(count).toBe(1);
  });

  it("ne touche pas les mutations déjà en pending", async () => {
    const { retryFailedMutations, getPendingCount } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "pending-1",
      table: "sales",
      operation: "INSERT",
      data: {},
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: "pending",
    });

    const { retried } = await retryFailedMutations();
    expect(retried).toBe(0);

    const { count } = await getPendingCount();
    expect(count).toBe(1);
  });

  it("fonctionne aussi sur la queue RPC", async () => {
    const { retryFailedMutations, getFailedCount } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await insertRecord(STORES.RPC_QUEUE, {
      id: "rpc-retry-1",
      table: "__rpc__",
      operation: "RPC",
      rpcName: "create_sale_with_limit",
      data: {},
      createdAt: new Date().toISOString(),
      retryCount: 1,
      status: "failed",
      error: "Server error",
    });

    const { retried } = await retryFailedMutations();
    expect(retried).toBe(1);

    const { count: failedCount } = await getFailedCount();
    expect(failedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getFailedCount
// ---------------------------------------------------------------------------
describe("offlineQueue — getFailedCount", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("retourne 0 quand il n'y a pas de mutations échouées", async () => {
    const { getFailedCount } = await import("@/lib/offlineQueue");
    const { count } = await getFailedCount();
    expect(count).toBe(0);
  });

  it("compte les mutations échouées dans les deux queues", async () => {
    const { getFailedCount } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "fail-1",
      table: "sales",
      operation: "INSERT",
      data: {},
      createdAt: new Date().toISOString(),
      retryCount: 3,
      status: "failed",
    });
    await insertRecord(STORES.MUTATION_QUEUE, {
      id: "fail-2",
      table: "expenses",
      operation: "INSERT",
      data: {},
      createdAt: new Date().toISOString(),
      retryCount: 1,
      status: "failed",
    });
    await insertRecord(STORES.RPC_QUEUE, {
      id: "rpc-fail-1",
      table: "__rpc__",
      operation: "RPC",
      rpcName: "increment_customer_credit",
      data: {},
      createdAt: new Date().toISOString(),
      retryCount: 2,
      status: "failed",
    });

    const { count } = await getFailedCount();
    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// decrementLocalStock
// ---------------------------------------------------------------------------
describe("offlineQueue — decrementLocalStock", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("décrémente le stock des produits vendus", async () => {
    const { decrementLocalStock } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await insertRecord(STORES.PRODUCT_CACHE, {
      id: "prod-1",
      name: "Coca-Cola",
      price: 500,
      stock_quantity: 50,
      _cachedAt: new Date().toISOString(),
    });
    await insertRecord(STORES.PRODUCT_CACHE, {
      id: "prod-2",
      name: "Fanta",
      price: 500,
      stock_quantity: 30,
      _cachedAt: new Date().toISOString(),
    });

    await decrementLocalStock([
      { product_id: "prod-1", quantity: 3 },
      { product_id: "prod-2", quantity: 5 },
    ]);

    const prod1 = await readRecord(STORES.PRODUCT_CACHE, "prod-1");
    expect(prod1.stock_quantity).toBe(47); // 50 - 3

    const prod2 = await readRecord(STORES.PRODUCT_CACHE, "prod-2");
    expect(prod2.stock_quantity).toBe(25); // 30 - 5
  });

  it("ne descend jamais en dessous de 0", async () => {
    const { decrementLocalStock } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await insertRecord(STORES.PRODUCT_CACHE, {
      id: "prod-low",
      name: "Produit stock faible",
      price: 100,
      stock_quantity: 2,
      _cachedAt: new Date().toISOString(),
    });

    await decrementLocalStock([{ product_id: "prod-low", quantity: 10 }]);

    const prod = await readRecord(STORES.PRODUCT_CACHE, "prod-low");
    expect(prod.stock_quantity).toBe(0);
  });

  it("ne crash pas si le produit n'existe pas dans le cache", async () => {
    const { decrementLocalStock } = await import("@/lib/offlineQueue");

    await expect(
      decrementLocalStock([{ product_id: "nonexistent", quantity: 5 }])
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// flushQueueWithMutex
// ---------------------------------------------------------------------------
describe("offlineQueue — flushQueueWithMutex", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("empêche les flushs concurrents", async () => {
    const { flushQueueWithMutex } = await import("@/lib/offlineQueue");

    const [result1, result2] = await Promise.all([
      flushQueueWithMutex(),
      flushQueueWithMutex(),
    ]);

    // One of them should be skipped (synced: 0)
    const skipped = result1.synced === 0 ? result1 : result2;
    expect(skipped.synced).toBe(0);
  });

  it("retourne {0,0} quand il n'y a pas de mutations en attente", async () => {
    const { flushQueueWithMutex } = await import("@/lib/offlineQueue");

    const result = await flushQueueWithMutex();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// enqueueMutation validation
// ---------------------------------------------------------------------------
describe("offlineQueue — enqueueMutation validation", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  it("rejette les tables non autorisées", async () => {
    const { enqueueMutation } = await import("@/lib/offlineQueue");

    await expect(
      enqueueMutation({
        table: "evil_table",
        operation: "INSERT",
        data: { malicious: "data" },
      })
    ).rejects.toThrow('table "evil_table" is not in the allowed list');
  });

  it("rejette les RPC non autorisées", async () => {
    const { enqueueMutation } = await import("@/lib/offlineQueue");

    await expect(
      enqueueMutation({
        table: "__rpc__",
        operation: "RPC",
        rpcName: "evil_rpc",
        data: { malicious: "data" },
      })
    ).rejects.toThrow('RPC "evil_rpc" is not in the allowed list');
  });

  it("accepte les tables autorisées", async () => {
    const { enqueueMutation } = await import("@/lib/offlineQueue");

    const result = await enqueueMutation({
      table: "sales",
      operation: "INSERT",
      data: { total: 5000 },
      userId: "user-1",
      organizationId: "org-1",
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe("pending");
    expect(result.table).toBe("sales");
  });

  it("accepte les RPC autorisées via enqueueRPCMutation", async () => {
    const { enqueueRPCMutation } = await import("@/lib/offlineQueue");

    const result = await enqueueRPCMutation({
      rpcName: "create_sale_with_limit",
      data: { p_total: 5000 },
      userId: "user-1",
      organizationId: "org-1",
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe("pending");
    expect(result.operation).toBe("RPC");
  });
});
