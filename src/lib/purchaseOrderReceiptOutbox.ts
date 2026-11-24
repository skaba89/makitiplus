/**
 * Durable purchase-order receipt draft/outbox. NOT wired to the live RPC yet.
 *
 * Each actor+organization+order has one pending receipt; retries preserve
 * exactly the same UUID and payload. Never fall back to localStorage/in-memory
 * on IndexedDB failures: doing so could generate a second receipt UUID.
 */
export interface PurchaseReceiptLine {
  product_id: string;
  quantity: number;
}
export interface PendingPurchaseReceipt {
  key: string;
  receipt_id: string;
  organization_id: string;
  actor_id: string;
  order_id: string;
  items: PurchaseReceiptLine[];
  notes: string | null;
  created_at: string;
}

const DB_NAME = "makitiplus-po-receipt-outbox";
const STORE = "pending-receipts";

function receiptKey(organizationId: string, actorId: string, orderId: string): string {
  if (!organizationId || !actorId || !orderId) throw new Error("Identité de réception manquante");
  return JSON.stringify([organizationId, actorId, orderId]);
}

function normalizedItems(items: PurchaseReceiptLine[]): PurchaseReceiptLine[] {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Lignes de réception obligatoires");
  const seen = new Set<string>();
  return items.map((item) => {
    if (!item.product_id || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Produit ou quantité de réception invalide");
    }
    if (seen.has(item.product_id)) throw new Error("Produit reçu en double");
    seen.add(item.product_id);
    return { product_id: item.product_id, quantity: item.quantity };
  }).sort((a, b) => a.product_id.localeCompare(b.product_id));
}

function openReceiptDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB requis pour une réception idempotente"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Ouverture IndexedDB impossible"));
    request.onblocked = () => reject(new Error("IndexedDB verrouillé par un autre onglet"));
  });
}

export async function preparePurchaseReceipt(input: {
  organization_id: string;
  actor_id: string;
  order_id: string;
  items: PurchaseReceiptLine[];
  notes?: string | null;
}): Promise<PendingPurchaseReceipt> {
  const key = receiptKey(input.organization_id, input.actor_id, input.order_id);
  const items = normalizedItems(input.items);
  const notes = input.notes ?? null;
  const db = await openReceiptDb();
  try {
    return await new Promise<PendingPurchaseReceipt>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const lookup = store.get(key);
      let selected: PendingPurchaseReceipt | undefined;
      let failed: Error | undefined;
      lookup.onsuccess = () => {
        const existing = lookup.result as PendingPurchaseReceipt | undefined;
        if (existing) {
          if (JSON.stringify(existing.items) !== JSON.stringify(items) || existing.notes !== notes) {
            failed = new Error("Réception en attente différente : terminer ou réconcilier le rejeu avant modification");
            tx.abort();
            return;
          }
          selected = existing;
          return;
        }
        if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
          failed = new Error("Génération UUID sécurisée indisponible");
          tx.abort();
          return;
        }
        selected = {
          key, receipt_id: crypto.randomUUID(),
          organization_id: input.organization_id,
          actor_id: input.actor_id, order_id: input.order_id,
          items, notes, created_at: new Date().toISOString(),
        };
        store.add(selected);
      };
      lookup.onerror = () => { failed = lookup.error ?? new Error("Lecture IndexedDB impossible"); };
      tx.oncomplete = () => {
        if (selected) resolve(selected);
        else reject(new Error("Réception non enregistrée"));
      };
      tx.onabort = () => reject(failed ?? tx.error ?? new Error("Transaction IndexedDB annulée"));
      tx.onerror = () => { /* onabort propagates transaction failure */ };
    });
  } finally { db.close(); }
}

export async function loadPendingPurchaseReceipt(
  organizationId: string, actorId: string, orderId: string,
): Promise<PendingPurchaseReceipt | undefined> {
  const key = receiptKey(organizationId, actorId, orderId);
  const db = await openReceiptDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      let found: PendingPurchaseReceipt | undefined;
      request.onsuccess = () => { found = request.result as PendingPurchaseReceipt | undefined; };
      request.onerror = () => reject(request.error ?? new Error("Lecture de réception impossible"));
      tx.oncomplete = () => resolve(found);
      tx.onabort = () => reject(tx.error ?? new Error("Lecture de réception annulée"));
    });
  } finally { db.close(); }
}

/** Call ONLY after server confirms a committed receipt (including exact replay). */
export async function acknowledgePurchaseReceipt(receipt: PendingPurchaseReceipt): Promise<void> {
  const db = await openReceiptDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let error: Error | undefined;
      const request = store.get(receipt.key);
      request.onsuccess = () => {
        const saved = request.result as PendingPurchaseReceipt | undefined;
        if (!saved || saved.receipt_id !== receipt.receipt_id) {
          error = new Error("Identifiant de réception différent : suppression refusée");
          tx.abort();
          return;
        }
        // An acknowledgement must not erase an altered or corrupted pending
        // payload even when another tab holds the same UUID. Refuse cleanup
        // and require manual reconciliation instead of losing evidence.
        if (saved.organization_id !== receipt.organization_id ||
            saved.actor_id !== receipt.actor_id ||
            saved.order_id !== receipt.order_id ||
            JSON.stringify(saved.items) !== JSON.stringify(receipt.items) ||
            saved.notes !== receipt.notes) {
          error = new Error("Réception enregistrée modifiée : réconciliation requise");
          tx.abort();
          return;
        }
        store.delete(receipt.key);
      };
      request.onerror = () => { error = request.error ?? new Error("Réception illisible"); };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(error ?? tx.error ?? new Error("Confirmation IndexedDB impossible"));
    });
  } finally { db.close(); }
}
