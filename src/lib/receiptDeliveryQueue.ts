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
