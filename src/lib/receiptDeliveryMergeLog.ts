/**
 * Persistance des journaux de mergeRemoteQueue pour le support / audit.
 * Conserve les 200 dernières entrées par appareil (rolling buffer) dans
 * localStorage afin que le panneau de support reste consultable hors-ligne.
 */
import type { ConflictLogEntry } from "./receiptDeliveryConflict";

const KEY = "sahelpos:receipt_delivery_merge_log";
const MAX_ENTRIES = 200;

export interface PersistedMergeLog extends ConflictLogEntry {
  /** Horodatage ISO du moment où le merge a été appliqué. */
  resolved_at: string;
  /** Résumé global du merge auquel appartient cette ligne. */
  batch_id: string;
}

export interface MergeBatchSummary {
  batch_id: string;
  resolved_at: string;
  conflictsResolved: number;
  addedFromRemote: number;
  prunedGhostIds: string[];
}

const SUMMARY_KEY = "sahelpos:receipt_delivery_merge_batches";
const MAX_BATCHES = 50;

const safeRead = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch { return []; }
};
const safeWrite = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
};

export const appendMergeLogs = (
  logs: ConflictLogEntry[],
  meta: { batch_id: string; resolved_at: string },
): void => {
  if (logs.length === 0) return;
  const cur = safeRead<PersistedMergeLog>(KEY);
  const enriched: PersistedMergeLog[] = logs.map((l) => ({
    ...l,
    resolved_at: meta.resolved_at,
    batch_id: meta.batch_id,
  }));
  const next = [...enriched, ...cur].slice(0, MAX_ENTRIES);
  safeWrite(KEY, next);
};

export const appendMergeBatch = (summary: MergeBatchSummary): void => {
  const cur = safeRead<MergeBatchSummary>(SUMMARY_KEY);
  const next = [summary, ...cur].slice(0, MAX_BATCHES);
  safeWrite(SUMMARY_KEY, next);
};

export const getMergeLogs = (): PersistedMergeLog[] => safeRead<PersistedMergeLog>(KEY);
export const getMergeBatches = (): MergeBatchSummary[] => safeRead<MergeBatchSummary>(SUMMARY_KEY);

export const clearMergeLogs = (): void => {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SUMMARY_KEY);
  } catch { /* ignore */ }
};

export const newBatchId = (): string =>
  `merge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
