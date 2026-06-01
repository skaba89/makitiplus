/**
 * File d'attente d'envoi automatique du ticket de caisse (WhatsApp / SMS).
 * - Stocke en localStorage les envois "pending" (mode offline)
 * - Flush automatique au retour en ligne (event "online")
 * - Idempotence : chaque envoi possède un client_uuid unique, jamais ré-envoyé
 * - Limite de tentatives + backoff exponentiel pour réseau instable
 */

import { ReceiptData, generateReceiptText, shareViaWhatsApp } from "@/utils/receiptGenerator";

const STORAGE_KEY = "sahelpos:receipt_delivery_queue";

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
  (crypto as any).randomUUID?.() ??
  `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const load = (): QueuedDelivery[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const save = (q: QueuedDelivery[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  } catch {
    /* quota dépassé : ignoré */
  }
};

export const isOnline = (): boolean =>
  typeof navigator === "undefined" ? true : navigator.onLine;

export const enqueueOrSendReceipt = (
  channel: DeliveryChannel,
  phone: string,
  payload: ReceiptData,
  client_uuid?: string
): QueuedDelivery => {
  const queue = load();
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
    } catch (err: any) {
      entry.status = "failed";
      entry.last_error = err?.message ?? "send_failed";
      entry.attempts = 1;
      entry.next_retry_at = new Date(Date.now() + computeNextRetryDelay(1)).toISOString();
    }
  }

  queue.push(entry);
  save(queue);
  return entry;
};

export type Sender = (entry: QueuedDelivery) => void;
let customSender: Sender | null = null;
export const setSender = (s: Sender | null) => { customSender = s; };

const sendOne = (entry: QueuedDelivery) => {
  if (customSender) { customSender(entry); return; }
  if (entry.channel === "whatsapp") {
    shareViaWhatsApp(entry.payload, entry.phone);
    return;
  }
  const text = generateReceiptText(entry.payload);
  const cleanPhone = entry.phone.replace(/[\s\-()]/g, "");
  const url = `sms:${cleanPhone}?body=${encodeURIComponent(text)}`;
  if (typeof window !== "undefined") window.open(url, "_blank");
};

const isRetryReady = (entry: QueuedDelivery, now: number): boolean => {
  if (!entry.next_retry_at) return true;
  return new Date(entry.next_retry_at).getTime() <= now;
};

/** Re-tente manuellement (force=true ignore le backoff et la limite). */
export const retryOne = (
  client_uuid: string,
  opts?: { force?: boolean }
): QueuedDelivery | null => {
  const queue = load();
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
  } catch (err: any) {
    entry.status = "failed";
    entry.last_error = err?.message ?? "send_failed";
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      entry.exhausted = true;
      entry.next_retry_at = undefined;
    } else {
      entry.next_retry_at = new Date(Date.now() + computeNextRetryDelay(entry.attempts)).toISOString();
    }
  }
  save(queue);
  return entry;
};

export const removeOne = (client_uuid: string) => {
  const queue = load().filter((q) => q.client_uuid !== client_uuid);
  save(queue);
};

/**
 * Flush la file. Respecte backoff et MAX_ATTEMPTS pour éviter les boucles.
 */
export const flushQueue = (): { sent: number; skipped: number; failed: number; deferred: number } => {
  const queue = load();
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
    } catch (err: any) {
      entry.status = "failed";
      entry.last_error = err?.message ?? "send_failed";
      entry.attempts += 1;
      if (entry.attempts >= MAX_ATTEMPTS) {
        entry.exhausted = true;
        entry.next_retry_at = undefined;
      } else if (isOnline()) {
        // Backoff seulement si on est en ligne (vrai échec serveur).
        // En offline, échec attendu → pas de backoff.
        entry.next_retry_at = new Date(now + computeNextRetryDelay(entry.attempts)).toISOString();
      } else {
        entry.next_retry_at = undefined;
      }
      failed += 1;
    }
  }
  save(queue);
  return { sent, skipped, failed, deferred };
};

export const getQueue = (): QueuedDelivery[] => load();
export const clearQueue = () => localStorage.removeItem(STORAGE_KEY);
export const pendingCount = (): number =>
  load().filter((q) => q.status === "pending").length;

/** Snapshot complet (pour undo). */
export const snapshotQueue = (): QueuedDelivery[] =>
  JSON.parse(JSON.stringify(load())) as QueuedDelivery[];

/** Restaure un snapshot (utilisé par undo). */
export const restoreQueue = (snapshot: QueuedDelivery[]): void => {
  save(JSON.parse(JSON.stringify(snapshot)));
};

/** Remplace la file (utilisé après merge multi-appareils). */
export const replaceQueue = (entries: QueuedDelivery[]): void => {
  save([...entries]);
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
  const queue = load();
  const now = Date.now();
  let sent = 0, failed = 0, skipped = 0, deferred = 0;
  const seen = new Set<string>();
  const processable = queue.filter((e) => e.status !== "sent" && e.status !== "duplicate");
  const total = processable.length;
  let processed = 0;
  for (const entry of queue) {
    const key = `${entry.saleNumber}|${entry.channel}|${entry.phone}`;
    if (entry.status === "sent" || entry.status === "duplicate") { seen.add(key); continue; }
    if (seen.has(key)) {
      entry.status = "duplicate"; skipped += 1; processed += 1;
    } else {
      seen.add(key);
      if (entry.exhausted) { skipped += 1; processed += 1; }
      else if (!isRetryReady(entry, now)) { deferred += 1; processed += 1; }
      else {
        try {
          sendOne(entry);
          entry.status = "sent";
          entry.sent_at = new Date().toISOString();
          entry.attempts += 1;
          entry.last_error = undefined;
          entry.next_retry_at = undefined;
          sent += 1;
        } catch (err: any) {
          entry.status = "failed";
          entry.last_error = err?.message ?? "send_failed";
          entry.attempts += 1;
          if (entry.attempts >= MAX_ATTEMPTS) { entry.exhausted = true; entry.next_retry_at = undefined; }
          else if (isOnline()) entry.next_retry_at = new Date(Date.now() + computeNextRetryDelay(entry.attempts)).toISOString();
          failed += 1;
        }
        processed += 1;
      }
    }
    save(queue);
    onProgress?.({ processed, total, sent, failed, skipped, deferred, currentSaleNumber: entry.saleNumber });
    // yield au navigateur pour ne pas figer l'UI sur les longues files
    await new Promise((r) => setTimeout(r, 0));
  }
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

export const removeMany = (uuids: string[]): number => {
  const set = new Set(uuids);
  const before = load();
  const after = before.filter((q) => !set.has(q.client_uuid));
  save(after);
  return before.length - after.length;
};

/**
 * Fusionne les doublons : pour chaque clé saleNumber|channel|phone, garde
 * une seule entrée (priorité 'sent' > la plus récente). Idempotence préservée.
 */
export const mergeDuplicates = (): { merged: number; kept: number } => {
  const queue = load();
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
  save(kept);
  return { merged, kept: kept.length };
};

/** Marque comme 'duplicate' (sans suppression) toutes les entrées doublons. */
export const archiveDuplicates = (): number => {
  const queue = load();
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
  save(queue);
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
  const cur = load().filter((e) => e.exhausted);
  const curIds = new Set(cur.map((e) => e.client_uuid));
  const fresh = cur.filter((e) => !lastExhaustedIds.has(e.client_uuid));
  lastExhaustedIds = curIds;
  if (fresh.length) exhaustedListeners.forEach((l) => l(fresh));
  return fresh;
};
