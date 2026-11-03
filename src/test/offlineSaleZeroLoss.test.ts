/**
 * Zéro perte / zéro doublon de vente — file offline (P0, 2026-11-02)
 *
 * Scénarios couverts (tous en IndexedDB simulée, aucune donnée réelle) :
 *   1. Une vente offline en échec n'est JAMAIS supprimée par le nettoyage,
 *      même après 5 échecs ou plus de 24 h.
 *   2. Une tentative ratée ne consomme qu'UN essai (avant : 2, "syncing"
 *      incrémentait aussi le compteur → vente abandonnée après ~3 essais).
 *   3. Une vente offline de plus de 7 jours est quand même rejouée.
 *   4. Une vente bloquée en "syncing" (onglet tué pendant la requête) est
 *      reprise après SYNCING_STALE_MS ; une requête en cours ne l'est pas.
 *   5. retryFailedMutations() réarme une vente même au-delà de 5 échecs.
 *   6. Une vente au-delà de 5 échecs n'est plus rejouée automatiquement
 *      mais reste en file (visible dans failedCount).
 *   7. Les mutations NON critiques gardent l'ancien comportement.
 *   8. isAmbiguousNetworkFailure distingue panne réseau / erreur métier.
 *   9. Le hook useOfflineSale route une panne réseau vers la file avec le
 *      MÊME numéro de vente (vérification statique du code source).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";

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
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } } })),
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }));

async function resetDatabase() {
  const { getDB } = await import("@/lib/indexedDBStorage");
  try {
    const db = await getDB();
    db.close();
  } catch {
    // not open
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("malikiplus_offline");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  vi.resetModules();
}

async function put(storeName: string, record: Record<string, unknown>) {
  const { getDB } = await import("@/lib/indexedDBStorage");
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get(storeName: string, key: string) {
  const { getDB } = await import("@/lib/indexedDBStorage");
  const db = await getDB();
  return new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function saleMutation(overrides: Record<string, unknown> = {}) {
  return {
    id: "sale-1",
    table: "__rpc__",
    operation: "RPC",
    rpcName: "create_sale_with_limit",
    data: { p_sale_number: "VTE-ABC123", p_total_amount: 150000 },
    userId: "user-1",
    organizationId: "org-1",
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
    ...overrides,
  };
}

beforeEach(async () => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: "sale-uuid", error: null });
  await resetDatabase();
});

afterEach(async () => {
  await resetDatabase();
});

describe("Zéro perte — nettoyage de la file", () => {
  it("ne supprime JAMAIS une vente offline en échec, même > 24 h et retryCount >= 5", async () => {
    const { cleanupExpiredMutations, getFailedCount } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await put(STORES.RPC_QUEUE, saleMutation({ id: "old-sale", status: "failed", retryCount: 9, createdAt: new Date(Date.now() - 30 * DAY).toISOString() }));
    await put(STORES.RPC_QUEUE, saleMutation({ id: "old-credit", rpcName: "increment_customer_credit_by_phone", status: "failed", retryCount: 5, createdAt: new Date(Date.now() - 2 * DAY).toISOString() }));

    const { removed } = await cleanupExpiredMutations();
    expect(removed).toBe(0);
    expect((await getFailedCount()).count).toBe(2);
    expect(await get(STORES.RPC_QUEUE, "old-sale")).toBeDefined();
    expect(await get(STORES.RPC_QUEUE, "old-credit")).toBeDefined();
  });

  it("continue de nettoyer les mutations NON critiques (comportement inchangé)", async () => {
    const { cleanupExpiredMutations } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await put(STORES.RPC_QUEUE, saleMutation({ id: "legacy-rpc", rpcName: "increment_customer_credit", status: "failed", retryCount: 5 }));
    await put(STORES.MUTATION_QUEUE, { id: "exp", table: "expenses", operation: "INSERT", data: {}, createdAt: new Date(Date.now() - 2 * DAY).toISOString(), retryCount: 1, status: "failed" });

    const { removed } = await cleanupExpiredMutations();
    expect(removed).toBe(2);
  });
});

describe("Zéro perte — rejeu et compteur d'essais", () => {
  it("une tentative ratée ne consomme qu'un seul essai", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "upstream timeout" } });
    const { flushQueue } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await put(STORES.RPC_QUEUE, saleMutation());
    await flushQueue();

    const entry = await get(STORES.RPC_QUEUE, "sale-1");
    expect(entry?.status).toBe("failed");
    expect(entry?.retryCount).toBe(1);
  });

  it("une vente bloquée 5 fois reste en file et n'est pas rejouée automatiquement", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Stock insuffisant pour Riz 25kg" } });
    const { flushQueue, getFailedCount } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await put(STORES.RPC_QUEUE, saleMutation());
    for (let i = 0; i < 7; i++) await flushQueue();

    expect(rpcMock).toHaveBeenCalledTimes(5);
    const entry = await get(STORES.RPC_QUEUE, "sale-1");
    expect(entry).toBeDefined();
    expect(entry?.retryCount).toBe(5);
    expect((await getFailedCount()).count).toBe(1);
  });

  it("retryFailedMutations réarme une vente même au-delà de 5 échecs, puis la synchronise", async () => {
    const { retryFailedMutations, flushQueue } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await put(STORES.RPC_QUEUE, saleMutation({ status: "failed", retryCount: 8 }));

    const { retried } = await retryFailedMutations();
    expect(retried).toBe(1);
    const rearmed = await get(STORES.RPC_QUEUE, "sale-1");
    expect(rearmed?.status).toBe("pending");
    expect(rearmed?.retryCount).toBe(0);

    const { synced } = await flushQueue();
    expect(synced).toBe(1);
    expect(rpcMock).toHaveBeenCalledWith("create_sale_with_limit", expect.objectContaining({ p_sale_number: "VTE-ABC123" }));
    expect(await get(STORES.RPC_QUEUE, "sale-1")).toBeUndefined();
  });

  it("une vente offline de plus de 7 jours est rejouée (pas expirée)", async () => {
    const { flushQueue } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await put(STORES.RPC_QUEUE, saleMutation({ createdAt: new Date(Date.now() - 10 * DAY).toISOString() }));
    const { synced } = await flushQueue();

    expect(synced).toBe(1);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("une RPC non critique de plus de 7 jours reste expirée (comportement inchangé)", async () => {
    const { flushQueue } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await put(STORES.RPC_QUEUE, saleMutation({ rpcName: "increment_customer_credit", createdAt: new Date(Date.now() - 10 * DAY).toISOString() }));
    await flushQueue();

    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("Zéro perte — reprise des entrées orphelines en 'syncing'", () => {
  it("reprend une vente restée en 'syncing' depuis plus de SYNCING_STALE_MS", async () => {
    const { getPendingMutations, SYNCING_STALE_MS, flushQueue } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await put(STORES.RPC_QUEUE, saleMutation({ status: "syncing", syncStartedAt: new Date(Date.now() - SYNCING_STALE_MS - 1000).toISOString() }));

    const pending = await getPendingMutations();
    expect(pending.map((m) => m.id)).toEqual(["sale-1"]);

    const { synced } = await flushQueue();
    expect(synced).toBe(1);
  });

  it("ne reprend pas une requête 'syncing' encore récente (évite le double envoi concurrent)", async () => {
    const { getPendingMutations } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await put(STORES.RPC_QUEUE, saleMutation({ status: "syncing", syncStartedAt: new Date().toISOString() }));
    expect(await getPendingMutations()).toHaveLength(0);
  });

  it("une entrée 'syncing' héritée sans syncStartedAt est datée par createdAt", async () => {
    const { getPendingMutations } = await import("@/lib/offlineQueue");
    const { STORES } = await import("@/lib/indexedDBStorage");

    await put(STORES.RPC_QUEUE, saleMutation({ status: "syncing", createdAt: new Date(Date.now() - HOUR).toISOString() }));
    expect(await getPendingMutations()).toHaveLength(1);
  });
});

describe("isAmbiguousNetworkFailure", () => {
  it.each([
    [{ message: "TypeError: Failed to fetch", details: "", hint: "", code: "" }],
    [new TypeError("Failed to fetch")],
    [new TypeError("Load failed")],
    [{ name: "AbortError", message: "The operation was aborted." }],
    [{ message: "NetworkError when attempting to fetch resource." }],
    [{ message: "upstream timed out", status: 504 }],
    [{ message: "", status: 0 }],
  ])("considère %o comme ambigu (la vente a pu être enregistrée)", async (err) => {
    const { isAmbiguousNetworkFailure } = await import("@/lib/networkError");
    expect(isAmbiguousNetworkFailure(err)).toBe(true);
  });

  it.each([
    [{ message: "Stock insuffisant pour Riz 25kg", code: "P0001" }],
    [{ message: "Limite de ventes mensuelles atteinte", code: "P0001" }],
    [{ message: "permission denied for table sales", code: "42501" }],
    [{ message: "JWT expired", code: "PGRST301" }],
    [{ message: "duplicate key value", code: "23505" }],
    [null],
    [undefined],
    [{ message: "Magasin invalide" }],
  ])("considère %o comme une erreur métier (non ambiguë)", async (err) => {
    const { isAmbiguousNetworkFailure } = await import("@/lib/networkError");
    expect(isAmbiguousNetworkFailure(err)).toBe(false);
  });
});

describe("useOfflineSale — panne réseau en ligne → file avec le même numéro", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/hooks/useOfflineSale.ts"), "utf8");

  it("utilise isAmbiguousNetworkFailure sur l'appel create_sale_with_limit", () => {
    expect(src).toMatch(/import \{ isAmbiguousNetworkFailure \} from "@\/lib\/networkError"/);
    expect(src).toMatch(/queuedAfterNetworkFailure = true/);
  });

  it("ne génère pas de nouveau numéro de vente entre la tentative en ligne et la mise en file", () => {
    const onlineIdx = src.indexOf('supabase.rpc("create_sale_with_limit"');
    const enqueueIdx = src.indexOf('rpcName: "create_sale_with_limit"');
    expect(onlineIdx).toBeGreaterThan(0);
    expect(enqueueIdx).toBeGreaterThan(onlineIdx);
    const between = src.slice(onlineIdx, enqueueIdx);
    expect(between).not.toMatch(/generate_sale_number|randomUUID/);
    expect(src.slice(enqueueIdx, enqueueIdx + 200)).toMatch(/p_sale_number: finalSaleNumber/);
  });

  it("la branche en ligne (reçu serveur) est sautée quand la vente a été mise en file", () => {
    expect(src).toMatch(/if \(isOnline && !queuedAfterNetworkFailure && rpcSaleId\)/);
  });
});

describe("Migration 20261102100000 — idempotence du crédit + contrôle tenant", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261102100000_credit_by_phone_idempotent.sql"),
    "utf8"
  );

  it("ajoute la colonne et l'index unique partiel sans toucher aux lignes existantes", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS sale_number TEXT/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS customer_credits_org_sale_number_credit_unique[\s\S]*WHERE type = 'credit' AND sale_number IS NOT NULL/);
    expect(sql).not.toMatch(/\bUPDATE public\.customer_credits\b/);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
  });

  it("vérifie l'appartenance à l'organisation avant toute écriture", () => {
    const guard = sql.indexOf("is_member_of_organization(p_organization_id)");
    const firstInsert = sql.indexOf("INSERT INTO public.customers");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(firstInsert);
  });

  it("insère le mouvement AVANT d'incrémenter total_credit (course concurrente sûre)", () => {
    const ledger = sql.indexOf("INSERT INTO public.customer_credits");
    const increment = sql.indexOf("SET total_credit = total_credit + p_amount");
    expect(ledger).toBeGreaterThan(0);
    expect(increment).toBeGreaterThan(ledger);
    expect(sql).toMatch(/EXCEPTION WHEN unique_violation THEN\s+RETURN v_customer_id;/);
  });
});
