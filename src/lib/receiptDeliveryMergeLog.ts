/**
 * Persistent journal des fusions mergeRemoteQueue, par client_uuid.
 * Stocké en localStorage → consultable hors-ligne, exportable CSV/JSON
 * pour faciliter le support client et l'audit multi-appareils.
 *
 * Chaque batch de fusion ajoute :
 *  - une entrée par conflit résolu (avec règle, source gagnante, statuts)
 *  - une entrée par "ghost" purgé (client_uuid sélectionné localement
 *    qui n'apparaît plus dans la file fusionnée — typiquement supprimé
 *    par un autre appareil).
 */
import type { ConflictLogEntry } from "./receiptDeliveryConflict";
import type { DeliveryStatus } from "./receiptDeliveryQueue";

const STORAGE_KEY = "sahelpos:receipt_delivery_merge_log";
const MAX_ENTRIES = 10_000;

export interface MergeLogEntry {
  id: string;             // ts + random — clé stable pour virtualisation
  ts: string;             // ISO
  batch_id: string;       // identifiant du batch de fusion
  client_uuid: string;
  winner_source: "local" | "remote" | "none";
  reason: string;         // ex: "status_priority(sent>pending)" ou "ghost_purged"
  local_status?: DeliveryStatus;
  remote_status?: DeliveryStatus;
  ghost_purged: boolean;
}

const load = (): MergeLogEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const persist = (entries: MergeLogEntry[]) => {
  try {
    const trimmed = entries.length > MAX_ENTRIES
      ? entries.slice(entries.length - MAX_ENTRIES)
      : entries;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota — silently drop */
  }
};

const rand = () => Math.random().toString(36).slice(2, 10);

export const getMergeLog = (): MergeLogEntry[] => load();

export const clearMergeLog = (): void => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
};

export interface RecordMergeBatchInput {
  conflicts: ConflictLogEntry[];
  ghostsPurged: string[]; // uuids
  ts?: string;
}

export const recordMergeBatch = (input: RecordMergeBatchInput): MergeLogEntry[] => {
  const ts = input.ts ?? new Date().toISOString();
  const batch_id = `${Date.now()}-${rand()}`;
  const added: MergeLogEntry[] = [];

  input.conflicts.forEach((c) => {
    added.push({
      id: `${batch_id}-c-${rand()}`,
      ts,
      batch_id,
      client_uuid: c.client_uuid,
      winner_source: c.winner_source,
      reason: c.reason,
      local_status: c.local_status,
      remote_status: c.remote_status,
      ghost_purged: false,
    });
  });
  input.ghostsPurged.forEach((uuid) => {
    added.push({
      id: `${batch_id}-g-${rand()}`,
      ts,
      batch_id,
      client_uuid: uuid,
      winner_source: "none",
      reason: "ghost_purged",
      ghost_purged: true,
    });
  });

  const next = [...load(), ...added];
  persist(next);
  return added;
};

/* -------------------------------------------------------------- */
/*  Exports hors-ligne (Blob — fonctionne en l'absence de réseau)  */
/* -------------------------------------------------------------- */

const csvCell = (v: string | number | boolean | null | undefined): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadBlob = (content: string, filename: string, mime: string) => {
  const blob = new Blob(["\uFEFF" + content], { type: `${mime};charset=utf-8;` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const MERGE_LOG_CSV_HEADERS = [
  "ts", "batch_id", "client_uuid", "winner_source",
  "reason", "local_status", "remote_status", "ghost_purged",
];

export const buildMergeLogCSV = (entries: MergeLogEntry[]): string => {
  const lines = [MERGE_LOG_CSV_HEADERS.join(";")];
  entries.forEach((e) => {
    lines.push([
      e.ts, e.batch_id, e.client_uuid, e.winner_source, e.reason,
      e.local_status ?? "", e.remote_status ?? "",
      e.ghost_purged ? "true" : "false",
    ].map(csvCell).join(";"));
  });
  return lines.join("\n");
};

export const exportMergeLogCSV = (entries: MergeLogEntry[]): void => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  downloadBlob(buildMergeLogCSV(entries), `merge_log_${stamp}.csv`, "text/csv");
};

export const exportMergeLogJSON = (entries: MergeLogEntry[]): void => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  downloadBlob(JSON.stringify(entries, null, 2), `merge_log_${stamp}.json`, "application/json");
};
