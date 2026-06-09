/**
 * Undo persistant — survit aux remounts (et même au hard refresh) pendant la
 * synchronisation. Stocke un snapshot de la file + la sélection précédente,
 * avec une date d'expiration. Au-delà : auto-purge.
 *
 * Durée par défaut : 30 secondes (large fenêtre pour permettre à l'utilisateur
 * de réagir, même si l'onglet a été rafraîchi entre temps).
 */
import type { QueuedDelivery } from "./receiptDeliveryQueue";

const KEY = "sahelpos:receipt_delivery_undo";
export const UNDO_TTL_MS = 30_000;

export interface UndoEntry {
  /** Discriminant lisible — utile pour l'audit. */
  action: "remove" | "merge" | "archive";
  /** Snapshot intégral de la file avant l'action. */
  snapshot: QueuedDelivery[];
  /** Liste des client_uuid précédemment sélectionnés. */
  selection: string[];
  /** Timestamp d'expiration (ms epoch). */
  expires_at: number;
  /** Description courte pour affichage. */
  description?: string;
}

export const saveUndo = (entry: Omit<UndoEntry, "expires_at"> & { ttl_ms?: number }): UndoEntry => {
  const full: UndoEntry = {
    action: entry.action,
    snapshot: entry.snapshot,
    selection: entry.selection,
    description: entry.description,
    expires_at: Date.now() + (entry.ttl_ms ?? UNDO_TTL_MS),
  };
  try { localStorage.setItem(KEY, JSON.stringify(full)); } catch { /* quota */ }
  return full;
};

export const loadUndo = (): UndoEntry | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UndoEntry;
    if (!parsed || typeof parsed.expires_at !== "number") return null;
    if (parsed.expires_at <= Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const clearUndo = (): void => {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};

export const remainingUndoMs = (entry: UndoEntry): number =>
  Math.max(0, entry.expires_at - Date.now());
