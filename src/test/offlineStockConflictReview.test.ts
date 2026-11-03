import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { organization_id: "org-1" }, error: null })),
        })),
      })),
    })),
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } } })) },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }));

async function resetDatabase() {
  const { getDB } = await import("@/lib/indexedDBStorage");
  try { (await getDB()).close(); } catch { /* storage not created yet */ }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("malikiplus_offline");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  vi.resetModules();
}
async function put(record: Record<string, unknown>) {
  const { getDB, STORES } = await import("@/lib/indexedDBStorage");
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.RPC_QUEUE, "readwrite");
    tx.objectStore(STORES.RPC_QUEUE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function get(id = "sale-1") {
  const { getDB, STORES } = await import("@/lib/indexedDBStorage");
  const db = await getDB();
  return new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
    const req = db.transaction(STORES.RPC_QUEUE, "readonly").objectStore(STORES.RPC_QUEUE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const sale = (changes: Record<string, unknown> = {}) => ({
  id: "sale-1", table: "__rpc__", operation: "RPC",
  rpcName: "create_sale_with_limit",
  data: { p_sale_number: "VENTE-OFFLINE-1", p_total_amount: 1000 },
  createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  userId: "user-1", organizationId: "org-1",
  status: "failed", error: "Stock insuffisant pour Riz",
  retryCount: 1, ...changes,
});

beforeEach(async () => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: "sale-id", error: null });
  await resetDatabase();
});
afterEach(resetDatabase);

describe("MKP-002 — arbitrage manuel des conflits de stock", () => {
  it("reconnaît les erreurs de stock, sans classer les pannes réseau", async () => {
    const { isStockConflict } = await import("@/lib/offlineQueue");
    expect(isStockConflict(sale() as never)).toBe(true);
    expect(isStockConflict(sale({ error: "Insufficient stock" }) as never)).toBe(true);
    expect(isStockConflict(sale({ error: "Network timeout" }) as never)).toBe(false);
    expect(isStockConflict(sale({ rpcName: "increment_customer_credit_by_phone" }) as never)).toBe(false);
  });
  it("n'effectue aucun rejeu automatique d'une ancienne vente bloquée par le stock", async () => {
    const { flushQueue } = await import("@/lib/offlineQueue");
    await put(sale());
    await flushQueue();
    expect(rpcMock).not.toHaveBeenCalled();
    expect((await get())?.status).toBe("failed");
    expect((await get())?.data).toEqual(sale().data);
  });
  it("le bouton de retry global conserve le conflit et son message", async () => {
    const { retryFailedMutations } = await import("@/lib/offlineQueue");
    await put(sale());
    expect((await retryFailedMutations()).retried).toBe(0);
    expect((await get())?.error).toBe("Stock insuffisant pour Riz");
  });
  it("refuse la relance individuelle sans accord explicite", async () => {
    const { rearmOneFailedMutation } = await import("@/lib/offlineQueue");
    await put(sale());
    expect(await rearmOneFailedMutation("sale-1", "user-1", "org-1")).toBe(false);
    expect((await get())?.status).toBe("failed");
  });
  it("refuse la relance depuis un autre utilisateur ou une autre organisation", async () => {
    const { rearmOneFailedMutation } = await import("@/lib/offlineQueue");
    await put(sale());
    expect(await rearmOneFailedMutation("sale-1", "user-2", "org-1", true)).toBe(false);
    expect(await rearmOneFailedMutation("sale-1", "user-1", "org-2", true)).toBe(false);
  });
  it("après accord du responsable conserve la vente et l'historique puis permet un essai", async () => {
    const { rearmOneFailedMutation, flushQueue, getPendingMutations } = await import("@/lib/offlineQueue");
    await put(sale({ retryCount: 9, totalRetryCount: 9, reviewReason: "stock_insufficient" }));
    expect(await rearmOneFailedMutation("sale-1", "user-1", "org-1", true)).toBe(true);
    const pending = await get();
    expect(pending?.status).toBe("pending");
    expect(pending?.totalRetryCount).toBe(9);
    expect(pending?.retryCount).toBe(0);
    expect(pending?.data).toEqual(sale().data);
    expect((await getPendingMutations()).length).toBe(1);
    await flushQueue();
    expect(rpcMock).toHaveBeenCalledWith("create_sale_with_limit", sale().data);
    expect(await get()).toBeUndefined();
  });
  it("une deuxième erreur de stock rebloque la vente après arbitrage", async () => {
    const { rearmOneFailedMutation, flushQueue } = await import("@/lib/offlineQueue");
    await put(sale());
    expect(await rearmOneFailedMutation("sale-1", "user-1", "org-1", true)).toBe(true);
    rpcMock.mockResolvedValue({ data: null, error: { message: "Stock insuffisant pour Riz" } });
    await flushQueue();
    expect((await get())?.reviewReason).toBe("stock_insufficient");
    expect((await get())?.status).toBe("failed");
    await flushQueue();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
  it("ne supprime pas une vente en conflit même après 24h", async () => {
    const { cleanupExpiredMutations } = await import("@/lib/offlineQueue");
    await put(sale({ retryCount: 19 }));
    expect((await cleanupExpiredMutations()).removed).toBe(0);
    expect(await get()).toBeDefined();
  });
});
