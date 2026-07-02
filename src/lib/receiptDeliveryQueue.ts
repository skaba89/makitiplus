/**
 * File d'attente d'envoi automatique du ticket de caisse (WhatsApp / SMS).
 * - Stocke en IndexedDB les envois "pending" (mode offline)
 *   (fallback localStorage si IndexedDB indisponible)
 * - Flush automatique au retour en ligne (event "online")
 * - Idempotence : chaque envoi possède un client_uuid unique, jamais ré-envoyé
 * - Limite de tentatives + backoff exponentiel pour réseau instable
 *
 * Migration v2 : localStorage → IndexedDB
 * - La migration est gérée par indexedDBStorage.ts::runMigrations()
 * - Toutes les fonctions synchrones internes (load/save) deviennent async
 * - L'API publique expose des versions async des fonctions critiques
 * - Les fonctions sync restent disponibles via fallback localStorage
 */

import { logger } from "./logger";
import { ReceiptData, generateReceiptText, shareViaWhatsApp } from "@/utils/receiptGenerator";
import { supabase } from "@/integrations/supabase/client";
import {
  STORES,
  isIndexedDBAvailable,
  getAll as idbGetAll,
  putMany as idbPutMany,
  put as idbPut,
  deleteByKeys as idbDeleteByKeys,
  clearStore as idbClearStore,
  count as idbCount,
  replaceAll as idbReplaceAll,
} from "./indexedDBStorage";

const LS_KEY = "malikiplus:receipt_delivery_queue";

/** Politique de retry — adaptée à la Guinée (3G/4G instable). */
export const MAX_ATTEMPTS = 5;
/** Backoff exponentiel : 5s, 15s, 45s, 2min15, 6min45 (cap 10min). */
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_FACTOR = 3;
const BACKOFF_CAP_MS = 10 * 60_000;

export const computeNextRetryDelay = (attempts: number): number =>
  Math.min(BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, Math.max(0, attempts - 1)), BACKOFF_CAP_MS);

export type DeliveryChannel = "whatsapp" | "sms";
export type DeliveryStatus = "pending" | "sent" | "duplicate" | "failed";

export interface QueuedDelivery {
  client_uuid: string;
  saleNumber: string;
  channel: DeliveryChannel;
  phone: string;
  payload: ReceiptData;
  status: DeliveryStatus;
  attempts: number;
  created_at: string;
  sent_at?: string;
  last_error?: string;
  /** Timestamp ISO à partir duquel un retry est autorisé (backoff). */
  next_retry_at?: string;
  /** True si MAX_ATTEMPTS atteint — n'est plus retenté automatiquement. */
  exhausted?: boolean;
}

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

// ---------------------------------------------------------------------------
// Abstraction de stockage : IndexedDB principal, localStorage en repli
// ---------------------------------------------------------------------------

/** Chargement synchrone depuis localStorage (repli / legacy) */
const lsLoad = (): QueuedDelivery[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

/** Sauvegarde synchrone dans localStorage (repli / legacy) */
const lsSave = (q: QueuedDelivery[]) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(q));
  } catch {
    /* quota dépassé : ignoré */
  }
};

/** Chargement asynchrone depuis IndexedDB */
const idbLoad = (): Promise<QueuedDelivery[]> =>
  idbGetAll<QueuedDelivery>(STORES.RECEIPT_QUEUE).catch(() => lsLoad());

/** Sauvegarde asynchrone dans IndexedDB (remplacement complet) */
const idbSave = (q: QueuedDelivery[]): Promise<void> =>
  idbReplaceAll(STORES.RECEIPT_QUEUE, q).catch(() => { lsSave(q); });

/** Insertion asynchrone d'une entrée dans IndexedDB */
const idbPutOne = (entry: QueuedDelivery): Promise<void> =>
  idbPut(STORES.RECEIPT_QUEUE, entry).catch(() => {
    const q = lsLoad();
    const idx = q.findIndex((e) => e.client_uuid === entry.client_uuid);
    if (idx >= 0) q[idx] = entry; else q.push(entry);
    lsSave(q);
  });

/**
 * Chargement unifié : retourne depuis IndexedDB si disponible, sinon localStorage.
 * Pour la rétrocompatibilité avec les appelants synchrones, lsLoad reste disponible.
 */
const load = lsLoad; // conservé pour usage synchrone interne (retryOne, flushQueue sync)
const save = lsSave; // conservé pour usage synchrone interne

// ---------------------------------------------------------------------------
// API publique — Versions asynchrones (recommandées pour le nouveau code)
// ---------------------------------------------------------------------------

export const isOnline = (): boolean =>
  typeof navigator === "undefined" ? true : navigator.onLine;

/** Get the full queue (async, from IndexedDB) */
export const getQueueAsync = (): Promise<QueuedDelivery[]> => {
  if (isIndexedDBAvailable()) return idbLoad();
  return Promise.resolve(lsLoad());
};

/** Get the full queue (sync, from localStorage — legacy) */
export const getQueue = (): QueuedDelivery[] => lsLoad();

/** Count pending entries (async) */
export const pendingCountAsync = async (): Promise<number> => {
  const queue = await getQueueAsync();
  return queue.filter((q) => q.status === "pending").length;
};

/** Count pending entries (sync, legacy) */
export const pendingCount = (): number =>
  lsLoad().filter((q) => q.status === "pending").length;

/** Enqueue or send a receipt (async — writes to IndexedDB) */
export const enqueueOrSendReceiptAsync = async (
  channel: DeliveryChannel,
  phone: string,
  payload: ReceiptData,
  client_uuid?: string
): Promise<QueuedDelivery> => {
  const queue = await getQueueAsync();
  const id = client_uuid ?? uuid();

  const existing = queue.find(
    (q) =>
      q.saleNumber === payload.saleNumber &&
      q.channel === channel &&
      q.phone === phone
  );
  if (existing) return existing;

  const entry: QueuedDelivery = {
    client_uuid: id,
    saleNumber: payload.saleNumber,
    channel,
    phone,
    payload,
    status: "pending",
    attempts: 0,
    created_at: new Date().toISOString(),
  };

  if (isOnline()) {
    try {
      sendOne(entry);
      entry.status = "sent";
      entry.sent_at = new Date().toISOString();
      entry.attempts = 1;
    } catch (err: unknown) {
      entry.status = "failed";
      entry.last_error = (err instanceof Error ? err.message : String(err)) || "send_failed";
      entry.attempts = 1;
      entry.next_retry_at = new Date(Date.now() + computeNextRetryDelay(1)).toISOString();
    }
  }

  queue.push(entry);
  if (isIndexedDBAvailable()) {
    await idbPutOne(entry);
  } else {
    lsSave(queue);
  }
  return entry;
};

/** Enqueue or send a receipt (sync — writes to localStorage, legacy) */
export const enqueueOrSendReceipt = (
  channel: DeliveryChannel,
  phone: string,
  payload: ReceiptData,
  client_uuid?: string
): QueuedDelivery => {
  const queue = lsLoad();
  const id = client_uuid ?? uuid();

  const existing = queue.find(
    (q) =>
      q.saleNumber === payload.saleNumber &&
      q.channel === channel &&
      q.phone === phone
  );
  if (existing) return existing;

  const entry: QueuedDelivery = {
    client_uuid: id,
    saleNumber: payload.saleNumber,
    channel,
    phone,
    payload,
    status: "pending",
    attempts: 0,
    created_at: new Date().toISOString(),
  };

  if (isOnline()) {
    try {
      sendOne(entry);
      entry.status = "sent";
      entry.sent_at = new Date().toISOString();
      entry.attempts = 1;
    } catch (err: unknown) {
      entry.status = "failed";
      entry.last_error = (err instanceof Error ? err.message : String(err)) || "send_failed";
      entry.attempts = 1;
      entry.next_retry_at = new Date(Date.now() + computeNextRetryDelay(1)).toISOString();
    }
  }

  queue.push(entry);
  lsSave(queue);

  // Persister aussi dans IndexedDB en arrière-plan (fire-and-forget)
  if (isIndexedDBAvailable()) {
    idbPutOne(entry).catch((err) => { logger.warn("[IDB] Operation failed:", err); });
  }

  return entry;
};

export type Sender = (entry: QueuedDelivery) => void;
let customSender: Sender | null = null;
export const setSender = (s: Sender | null) => { customSender = s; };

const sendOne = async (entry: QueuedDelivery) => {
  if (customSender) { customSender(entry); return; }

  if (entry.channel === "whatsapp") {
    // Try WhatsApp Business API (Edge Function) first
    try {
      const text = generateReceiptText(entry.payload);
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          phone: entry.phone,
          message_type: "receipt",
          text,
          sale_id: entry.payload.saleNumber,
          store_id: entry.payload.organizationId,
        },
      });
      if (!error && data?.success) {
        entry.status = "sent";
        entry.sent_at = new Date().toISOString();
        entry.attempts += 1;
        entry.last_error = undefined;
        entry.next_retry_at = undefined;
        entry.exhausted = false;
        if (isIndexedDBAvailable()) {
          await idbPutOne(entry);
        } else {
          const queue = lsLoad();
          lsSave(queue);
        }
        return;
      }
      // If API call failed, fall through to wa.me deep link
      logger.warn("[Queue] WhatsApp API failed, falling back to wa.me:", error || data?.error);
    } catch (err) {
      logger.warn("[Queue] WhatsApp API error, falling back to wa.me:", err);
    }
    // Fallback: open wa.me deep link in browser
    shareViaWhatsApp(entry.payload, entry.phone);
    return;
  }

  // SMS channel
  const text = generateReceiptText(entry.payload);
  const cleanPhone = entry.phone.replace(/[\s\-()]/g, "");
  const url = `sms:${cleanPhone}?body=${encodeURIComponent(text)}`;
  if (typeof window !== "undefined") window.open(url, "_blank");
};

const isRetryReady = (entry: QueuedDelivery, now: number): boolean => {
  if (!entry.next_retry_at) return true;
  return new Date(entry.next_retry_at).getTime() <= now;
};

/** Re-tente manuellement (force=true ignore le backoff et la limite). Version async. */
export const retryOneAsync = async (
  client_uuid: string,
  opts?: { force?: boolean }
): Promise<QueuedDelivery | null> => {
  const queue = await getQueueAsync();
  const entry = queue.find((q) => q.client_uuid === client_uuid);
  if (!entry) return null;
  if (entry.status === "sent" || entry.status === "duplicate") return entry;
  if (!opts?.force) {
    if (entry.exhausted) return entry;
    if (!isRetryReady(entry, Date.now())) return entry;
  }
  try {
    sendOne(entry);
    entry.status = "sent";
    entry.sent_at = new Date().toISOString();
    entry.attempts += 1;
    entry.last_error = undefined;
    entry.next_retry_at = undefined;
    entry.exhausted = false;
  } catch (err: unknown) {
    entry.status = "failed";
    entry.last_error = (err instanceof Error ? err.message : String(err)) || "send_failed";
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      entry.exhausted = true;
      entry.next_retry_at = undefined;
    } else {
      entry.next_retry_at = new Date(Date.now() + computeNextRetryDelay(entry.attempts)).toISOString();
    }
  }
  if (isIndexedDBAvailable()) {
    await idbPutOne(entry);
  } else {
    lsSave(queue);
  }
  return entry;
};

/** Re-tente manuellement (force=true ignore le backoff et la limite). Legacy sync. */
export const retryOne = (
  client_uuid: string,
  opts?: { force?: boolean }
): QueuedDelivery | null => {
  const queue = lsLoad();
  const entry = queue.find((q) => q.client_uuid === client_uuid);
  if (!entry) return null;
  if (entry.status === "sent" || entry.status === "duplicate") return entry;
  if (!opts?.force) {
    if (entry.exhausted) return entry;
    if (!isRetryReady(entry, Date.now())) return entry;
  }
  try {
    sendOne(entry);
    entry.status = "sent";
    entry.sent_at = new Date().toISOString();
    entry.attempts += 1;
    entry.last_error = undefined;
    entry.next_retry_at = undefined;
    entry.exhausted = false;
  } catch (err: unknown) {
    entry.status = "failed";
    entry.last_error = (err instanceof Error ? err.message : String(err)) || "send_failed";
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      entry.exhausted = true;
      entry.next_retry_at = undefined;
    } else {
      entry.next_retry_at = new Date(Date.now() + computeNextRetryDelay(entry.attempts)).toISOString();
    }
  }
  lsSave(queue);
  // Background sync to IndexedDB
  if (isIndexedDBAvailable()) idbPutOne(entry).catch((err) => { logger.warn("[IDB] Operation failed:", err); });
  return entry;
};

/** Remove a single entry (async) */
export const removeOneAsync = async (client_uuid: string): Promise<void> => {
  if (isIndexedDBAvailable()) {
    await idbDeleteByKeys(STORES.RECEIPT_QUEUE, [client_uuid]);
  }
  // Also remove from localStorage for consistency
  const queue = lsLoad().filter((q) => q.client_uuid !== client_uuid);
  lsSave(queue);
};

/** Remove a single entry (sync, legacy) */
export const removeOne = (client_uuid: string) => {
  const queue = lsLoad().filter((q) => q.client_uuid !== client_uuid);
  lsSave(queue);
  if (isIndexedDBAvailable()) idbDeleteByKeys(STORES.RECEIPT_QUEUE, [client_uuid]).catch((err) => { logger.warn("[IDB] Operation failed:", err); });
};

/**
 * Flush la file (async). Respecte backoff et MAX_ATTEMPTS pour éviter les boucles.
 */
export const flushQueueAsync2 = async (): Promise<{ sent: number; skipped: number; failed: number; deferred: number }> => {
  const queue = await getQueueAsync();
  const now = Date.now();
  let sent = 0, skipped = 0, failed = 0, deferred = 0;
  const seen = new Set<string>();
  const updated: QueuedDelivery[] = [];

  for (const entry of queue) {
    const key = `${entry.saleNumber}|${entry.channel}|${entry.phone}`;
    if (entry.status === "sent" || entry.status === "duplicate") {
      seen.add(key);
      updated.push(entry);
      continue;
    }
    if (seen.has(key)) {
      entry.status = "duplicate";
      skipped += 1;
      updated.push(entry);
      continue;
    }
    seen.add(key);
    if (entry.exhausted) { skipped += 1; updated.push(entry); continue; }
    if (!isRetryReady(entry, now)) { deferred += 1; updated.push(entry); continue; }
    try {
      sendOne(entry);
      entry.status = "sent";
      entry.sent_at = new Date().toISOString();
      entry.attempts += 1;
      entry.last_error = undefined;
      entry.next_retry_at = undefined;
      sent += 1;
    } catch (err: unknown) {
      entry.status = "failed";
      entry.last_error = (err instanceof Error ? err.message : String(err)) || "send_failed";
      entry.attempts += 1;
      if (entry.attempts >= MAX_ATTEMPTS) {
        entry.exhausted = true;
        entry.next_retry_at = undefined;
      } else if (isOnline()) {
        entry.next_retry_at = new Date(now + computeNextRetryDelay(entry.attempts)).toISOString();
      } else {
        entry.next_retry_at = undefined;
      }
      failed += 1;
    }
    updated.push(entry);
  }

  await idbSave(updated);
  lsSave(updated);
  return { sent, skipped, failed, deferred };
};

/**
 * Flush la file (sync). Respecte backoff et MAX_ATTEMPTS pour éviter les boucles.
 */
export const flushQueue = (): { sent: number; skipped: number; failed: number; deferred: number } => {
  const queue = lsLoad();
  const now = Date.now();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deferred = 0;
  const seen = new Set<string>();
  for (const entry of queue) {
    const key = `${entry.saleNumber}|${entry.channel}|${entry.phone}`;
    if (entry.status === "sent" || entry.status === "duplicate") {
      seen.add(key);
      continue;
    }
    if (seen.has(key)) {
      entry.status = "duplicate";
      skipped += 1;
      continue;
    }
    seen.add(key);
    if (entry.exhausted) { skipped += 1; continue; }
    if (!isRetryReady(entry, now)) { deferred += 1; continue; }
    try {
      sendOne(entry);
      entry.status = "sent";
      entry.sent_at = new Date().toISOString();
      entry.attempts += 1;
      entry.last_error = undefined;
      entry.next_retry_at = undefined;
      sent += 1;
    } catch (err: unknown) {
      entry.status = "failed";
      entry.last_error = (err instanceof Error ? err.message : String(err)) || "send_failed";
      entry.attempts += 1;
      if (entry.attempts >= MAX_ATTEMPTS) {
        entry.exhausted = true;
        entry.next_retry_at = undefined;
      } else if (isOnline()) {
        entry.next_retry_at = new Date(now + computeNextRetryDelay(entry.attempts)).toISOString();
      } else {
        entry.next_retry_at = undefined;
      }
      failed += 1;
    }
  }
  lsSave(queue);
  // Background sync to IndexedDB
  if (isIndexedDBAvailable()) idbSave(queue).catch((err) => { logger.warn("[IDB] Operation failed:", err); });
  return { sent, skipped, failed, deferred };
};

/** Clear the entire queue (async) */
export const clearQueueAsync = async (): Promise<void> => {
  if (isIndexedDBAvailable()) await idbClearStore(STORES.RECEIPT_QUEUE);
  localStorage.removeItem(LS_KEY);
};

/** Clear the entire queue (sync, legacy) */
export const clearQueue = () => {
  localStorage.removeItem(LS_KEY);
  if (isIndexedDBAvailable()) idbClearStore(STORES.RECEIPT_QUEUE).catch((err) => { logger.warn("[IDB] Operation failed:", err); });
};

/** Snapshot complet (pour undo) — async */
export const snapshotQueueAsync = (): Promise<QueuedDelivery[]> =>
  getQueueAsync().then((q) => JSON.parse(JSON.stringify(q)) as QueuedDelivery[]);

/** Snapshot complet (pour undo) — sync legacy */
export const snapshotQueue = (): QueuedDelivery[] =>
  JSON.parse(JSON.stringify(lsLoad())) as QueuedDelivery[];

/** Restaure un snapshot (utilisé par undo) — async */
export const restoreQueueAsync = async (snapshot: QueuedDelivery[]): Promise<void> => {
  const entries = JSON.parse(JSON.stringify(snapshot));
  await idbSave(entries);
  lsSave(entries);
};

/** Restaure un snapshot (utilisé par undo) — sync legacy */
export const restoreQueue = (snapshot: QueuedDelivery[]): void => {
  const entries = JSON.parse(JSON.stringify(snapshot));
  lsSave(entries);
  if (isIndexedDBAvailable()) idbSave(entries).catch((err) => { logger.warn("[IDB] Operation failed:", err); });
};

/** Remplace la file (utilisé après merge multi-appareils) — async */
export const replaceQueueAsync = async (entries: QueuedDelivery[]): Promise<void> => {
  const copy = [...entries];
  await idbSave(copy);
  lsSave(copy);
};

/** Remplace la file (utilisé après merge multi-appareils) — sync legacy */
export const replaceQueue = (entries: QueuedDelivery[]): void => {
  const copy = [...entries];
  lsSave(copy);
  if (isIndexedDBAvailable()) idbSave(copy).catch((err) => { logger.warn("[IDB] Operation failed:", err); });
};

/**
 * Flush asynchrone avec progression — émet onProgress après chaque entrée
 * pour permettre une UI temps réel (progress bar, compteurs).
 */
export const flushQueueAsync = async (
  onProgress?: (p: {
    processed: number;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    deferred: number;
    currentSaleNumber?: string;
  }) => void,
): Promise<{ sent: number; failed: number; skipped: number; deferred: number }> => {
  const queue = await getQueueAsync();
  const now = Date.now();
  let sent = 0, failed = 0, skipped = 0, deferred = 0;
  const seen = new Set<string>();
  const processable = queue.filter((e) => e.status !== "sent" && e.status !== "duplicate");
  const total = processable.length;
  let processed = 0;
  const updated: QueuedDelivery[] = [];

  for (const entry of queue) {
    const key = `${entry.saleNumber}|${entry.channel}|${entry.phone}`;
    if (entry.status === "sent" || entry.status === "duplicate") { seen.add(key); updated.push(entry); continue; }
    if (seen.has(key)) {
      entry.status = "duplicate"; skipped += 1; processed += 1;
      updated.push(entry);
    } else {
      seen.add(key);
      if (entry.exhausted) { skipped += 1; processed += 1; updated.push(entry); }
      else if (!isRetryReady(entry, now)) { deferred += 1; processed += 1; updated.push(entry); }
      else {
        try {
          sendOne(entry);
          entry.status = "sent";
          entry.sent_at = new Date().toISOString();
          entry.attempts += 1;
          entry.last_error = undefined;
          entry.next_retry_at = undefined;
          sent += 1;
        } catch (err: unknown) {
          entry.status = "failed";
          entry.last_error = (err instanceof Error ? err.message : String(err)) || "send_failed";
          entry.attempts += 1;
          if (entry.attempts >= MAX_ATTEMPTS) { entry.exhausted = true; entry.next_retry_at = undefined; }
          else if (isOnline()) entry.next_retry_at = new Date(Date.now() + computeNextRetryDelay(entry.attempts)).toISOString();
          failed += 1;
        }
        processed += 1;
        updated.push(entry);
      }
    }
    onProgress?.({ processed, total, sent, failed, skipped, deferred, currentSaleNumber: entry.saleNumber });
    // yield au navigateur pour ne pas figer l'UI sur les longues files
    await new Promise((r) => setTimeout(r, 0));
  }

  await idbSave(updated);
  lsSave(updated);
  return { sent, failed, skipped, deferred };
};

let installed = false;
export const installAutoFlush = (
  onFlush?: (r: { sent: number; skipped: number; failed: number; deferred: number }) => void
) => {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const handler = () => {
    const r = flushQueue();
    if (onFlush && (r.sent > 0 || r.skipped > 0 || r.failed > 0 || r.deferred > 0)) onFlush(r);
  };
  window.addEventListener("online", handler);
};

/** Bulk retry — applique retryOne sur chaque uuid et retourne un résumé. */
export const retryManyAsync = async (
  uuids: string[],
  opts?: { force?: boolean }
): Promise<{ sent: number; failed: number; skipped: number }> => {
  let sent = 0, failed = 0, skipped = 0;
  for (const id of uuids) {
    const r = await retryOneAsync(id, opts);
    if (!r) { skipped += 1; continue; }
    if (r.status === "sent") sent += 1;
    else if (r.status === "failed") failed += 1;
    else skipped += 1;
  }
  return { sent, failed, skipped };
};

/** Bulk retry (sync, legacy) */
export const retryMany = (
  uuids: string[],
  opts?: { force?: boolean }
): { sent: number; failed: number; skipped: number } => {
  let sent = 0, failed = 0, skipped = 0;
  for (const id of uuids) {
    const r = retryOne(id, opts);
    if (!r) { skipped += 1; continue; }
    if (r.status === "sent") sent += 1;
    else if (r.status === "failed") failed += 1;
    else skipped += 1;
  }
  return { sent, failed, skipped };
};

/** Remove many entries by UUID (async) */
export const removeManyAsync = async (uuids: string[]): Promise<number> => {
  const set = new Set(uuids);
  const queue = await getQueueAsync();
  const after = queue.filter((q) => !set.has(q.client_uuid));
  await idbSave(after);
  lsSave(after);
  return queue.length - after.length;
};

/** Remove many entries by UUID (sync, legacy) */
export const removeMany = (uuids: string[]): number => {
  const set = new Set(uuids);
  const before = lsLoad();
  const after = before.filter((q) => !set.has(q.client_uuid));
  lsSave(after);
  if (isIndexedDBAvailable()) idbSave(after).catch((err) => { logger.warn("[IDB] Operation failed:", err); });
  return before.length - after.length;
};

/**
 * Fusionne les doublons : pour chaque clé saleNumber|channel|phone, garde
 * une seule entrée (priorité 'sent' > la plus récente). Idempotence préservée.
 */
export const mergeDuplicatesAsync = async (): Promise<{ merged: number; kept: number }> => {
  const queue = await getQueueAsync();
  const groups = new Map<string, QueuedDelivery[]>();
  for (const e of queue) {
    const key = `${e.saleNumber}|${e.channel}|${e.phone}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  const kept: QueuedDelivery[] = [];
  let merged = 0;
  for (const arr of groups.values()) {
    if (arr.length === 1) { kept.push(arr[0]); continue; }
    const sent = arr.find((e) => e.status === "sent");
    const winner = sent ?? [...arr].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    winner.attempts = arr.reduce((s, e) => Math.max(s, e.attempts), winner.attempts);
    kept.push(winner);
    merged += arr.length - 1;
  }
  await idbSave(kept);
  lsSave(kept);
  return { merged, kept: kept.length };
};

/** Merge duplicates (sync, legacy) */
export const mergeDuplicates = (): { merged: number; kept: number } => {
  const queue = lsLoad();
  const groups = new Map<string, QueuedDelivery[]>();
  for (const e of queue) {
    const key = `${e.saleNumber}|${e.channel}|${e.phone}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  const kept: QueuedDelivery[] = [];
  let merged = 0;
  for (const arr of groups.values()) {
    if (arr.length === 1) { kept.push(arr[0]); continue; }
    const sent = arr.find((e) => e.status === "sent");
    const winner = sent ?? [...arr].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    winner.attempts = arr.reduce((s, e) => Math.max(s, e.attempts), winner.attempts);
    kept.push(winner);
    merged += arr.length - 1;
  }
  lsSave(kept);
  if (isIndexedDBAvailable()) idbSave(kept).catch((err) => { logger.warn("[IDB] Operation failed:", err); });
  return { merged, kept: kept.length };
};

/** Marque comme 'duplicate' (sans suppression) toutes les entrées doublons. */
export const archiveDuplicatesAsync = async (): Promise<number> => {
  const queue = await getQueueAsync();
  const seen = new Map<string, QueuedDelivery>();
  let archived = 0;
  for (const e of queue) {
    const key = `${e.saleNumber}|${e.channel}|${e.phone}`;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, e); continue; }
    const winner = prev.status === "sent" ? prev : e.status === "sent" ? e : prev;
    const loser = winner === prev ? e : prev;
    if (loser.status !== "duplicate") {
      loser.status = "duplicate";
      archived += 1;
    }
    seen.set(key, winner);
  }
  const updated = Array.from(seen.values());
  await idbSave(updated);
  lsSave(updated);
  return archived;
};

/** Archive duplicates (sync, legacy) */
export const archiveDuplicates = (): number => {
  const queue = lsLoad();
  const seen = new Map<string, QueuedDelivery>();
  let archived = 0;
  for (const e of queue) {
    const key = `${e.saleNumber}|${e.channel}|${e.phone}`;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, e); continue; }
    const winner = prev.status === "sent" ? prev : e.status === "sent" ? e : prev;
    const loser = winner === prev ? e : prev;
    if (loser.status !== "duplicate") {
      loser.status = "duplicate";
      archived += 1;
    }
    seen.set(key, winner);
  }
  lsSave(queue);
  if (isIndexedDBAvailable()) idbSave(queue).catch((err) => { logger.warn("[IDB] Operation failed:", err); });
  return archived;
};

/** Notifie quand de nouvelles entrées passent en 'exhausted' (max retries). */
type ExhaustedListener = (entries: QueuedDelivery[]) => void;
const exhaustedListeners = new Set<ExhaustedListener>();
let lastExhaustedIds = new Set<string>();
export const onExhausted = (l: ExhaustedListener): (() => void) => {
  exhaustedListeners.add(l);
  return () => { exhaustedListeners.delete(l); };
};
export const checkExhaustedDelta = (): QueuedDelivery[] => {
  const cur = lsLoad().filter((e) => e.exhausted);
  const curIds = new Set(cur.map((e) => e.client_uuid));
  const fresh = cur.filter((e) => !lastExhaustedIds.has(e.client_uuid));
  lastExhaustedIds = curIds;
  if (fresh.length) exhaustedListeners.forEach((l) => l(fresh));
  return fresh;
};
