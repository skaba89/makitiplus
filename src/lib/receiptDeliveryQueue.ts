/**
 * File d'attente d'envoi automatique du ticket de caisse (WhatsApp / SMS).
 * - Stocke en localStorage les envois "pending" (mode offline)
 * - Flush automatique au retour en ligne (event "online")
 * - Idempotence : chaque envoi possède un client_uuid unique, jamais ré-envoyé
 */

import { ReceiptData, generateReceiptText, shareViaWhatsApp } from "@/utils/receiptGenerator";

const STORAGE_KEY = "sahelpos:receipt_delivery_queue";

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

/** Retourne true si l'app est considérée en ligne. */
export const isOnline = (): boolean =>
  typeof navigator === "undefined" ? true : navigator.onLine;

/**
 * Tente d'envoyer immédiatement, sinon enfile.
 * Retourne le statut résultant.
 */
export const enqueueOrSendReceipt = (
  channel: DeliveryChannel,
  phone: string,
  payload: ReceiptData,
  client_uuid?: string
): QueuedDelivery => {
  const queue = load();
  const id = client_uuid ?? uuid();

  // ── Idempotence stricte ─────────────────────────────────────────────
  // Si on a déjà un envoi pour ce (saleNumber, channel, phone), on retourne
  // l'entrée existante au lieu de re-créer un job.
  const existing = queue.find(
    (q) =>
      q.saleNumber === payload.saleNumber &&
      q.channel === channel &&
      q.phone === phone
  );
  if (existing) {
    return existing;
  }

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
    }
  }

  queue.push(entry);
  save(queue);
  return entry;
};

/** Sender injectable (utile pour tests e2e simulant un échec réseau) */
export type Sender = (entry: QueuedDelivery) => void;
let customSender: Sender | null = null;
export const setSender = (s: Sender | null) => { customSender = s; };

/** Envoi unitaire (WhatsApp via wa.me, SMS via sms:) */
const sendOne = (entry: QueuedDelivery) => {
  if (customSender) { customSender(entry); return; }
  if (entry.channel === "whatsapp") {
    shareViaWhatsApp(entry.payload, entry.phone);
    return;
  }
  // SMS : on utilise sms: URI scheme (compatible Android/iOS)
  const text = generateReceiptText(entry.payload);
  const cleanPhone = entry.phone.replace(/[\s\-()]/g, "");
  const url = `sms:${cleanPhone}?body=${encodeURIComponent(text)}`;
  if (typeof window !== "undefined") {
    window.open(url, "_blank");
  }
};

/** Re-tente manuellement un envoi (échec ou pending) sans casser l'idempotence. */
export const retryOne = (client_uuid: string): QueuedDelivery | null => {
  const queue = load();
  const entry = queue.find((q) => q.client_uuid === client_uuid);
  if (!entry) return null;
  if (entry.status === "sent" || entry.status === "duplicate") return entry;
  try {
    sendOne(entry);
    entry.status = "sent";
    entry.sent_at = new Date().toISOString();
    entry.attempts += 1;
    entry.last_error = undefined;
  } catch (err: any) {
    entry.status = "failed";
    entry.last_error = err?.message ?? "send_failed";
    entry.attempts += 1;
  }
  save(queue);
  return entry;
};

export const removeOne = (client_uuid: string) => {
  const queue = load().filter((q) => q.client_uuid !== client_uuid);
  save(queue);
};

/**
 * Flush la file : envoie toutes les entrées "pending".
 * - Garantie d'idempotence : chaque entrée n'est envoyée QUE si status==='pending'
 * - Si appelé plusieurs fois (multiples reconnects), aucune entrée déjà 'sent'
 *   ne sera renvoyée.
 */
export const flushQueue = (): { sent: number; skipped: number; failed: number } => {
  const queue = load();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  // Dédupliquer dans la file elle-même (sécurité supplémentaire)
  const seen = new Set<string>();
  for (const entry of queue) {
    const key = `${entry.saleNumber}|${entry.channel}|${entry.phone}`;
    // Idempotence : on ne re-traite JAMAIS une entrée déjà sortie de l'état pending
    if (entry.status !== "pending") {
      seen.add(key);
      continue;
    }
    if (seen.has(key)) {
      entry.status = "duplicate";
      skipped += 1;
      continue;
    }
    seen.add(key);
    try {
      sendOne(entry);
      entry.status = "sent";
      entry.sent_at = new Date().toISOString();
      entry.attempts += 1;
      sent += 1;
    } catch (err: any) {
      entry.status = "failed";
      entry.last_error = err?.message ?? "send_failed";
      entry.attempts += 1;
      failed += 1;
    }
  }
  save(queue);
  return { sent, skipped, failed };
};

export const getQueue = (): QueuedDelivery[] => load();
export const clearQueue = () => localStorage.removeItem(STORAGE_KEY);
export const pendingCount = (): number =>
  load().filter((q) => q.status === "pending").length;

/** Installe l'écouteur global qui flush automatiquement au retour en ligne. */
let installed = false;
export const installAutoFlush = (
  onFlush?: (r: { sent: number; skipped: number; failed: number }) => void
) => {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const handler = () => {
    const r = flushQueue();
    if (onFlush && (r.sent > 0 || r.skipped > 0 || r.failed > 0)) onFlush(r);
  };
  window.addEventListener("online", handler);
};
