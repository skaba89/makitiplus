/**
 * Persistent journal des fusions mergeRemoteQueue, par client_uuid.
 * Stocké en localStorage → consultable hors-ligne, exportable CSV/JSON/PDF
 * pour faciliter le support client et l'audit multi-appareils.
 *
 * Chaque batch de fusion ajoute :
 *  - une entrée par conflit résolu (avec règle, source gagnante, statuts)
 *  - une entrée par "ghost" purgé (client_uuid sélectionné localement
 *    qui n'apparaît plus dans la file fusionnée — typiquement supprimé
 *    par un autre appareil).
 *
 * Politique de purge configurable (âge max + taille max). La purge est
 * automatiquement appliquée à chaque lecture, et déclenchable manuellement
 * via `purgeMergeLogNow()` — 100% hors-ligne.
 */
import jsPDF from "jspdf";
import type { ConflictLogEntry } from "./receiptDeliveryConflict";
import type { DeliveryStatus } from "./receiptDeliveryQueue";

const STORAGE_KEY = "sahelpos:receipt_delivery_merge_log";
const POLICY_KEY = "sahelpos:receipt_delivery_merge_log_policy";
const HARD_MAX_ENTRIES = 10_000;

export interface MergeLogEntry {
  id: string;
  ts: string;
  batch_id: string;
  client_uuid: string;
  winner_source: "local" | "remote" | "none";
  reason: string;
  local_status?: DeliveryStatus;
  remote_status?: DeliveryStatus;
  ghost_purged: boolean;
}

export interface MergeLogPurgePolicy {
  /** Âge maximum (ms) au-delà duquel les entrées fantômes sont purgées. */
  maxAgeMs: number;
  /** Taille maximale du journal (toutes entrées confondues, FIFO). */
  maxSize: number;
  /** Si vrai, ne purger automatiquement que les fantômes ; sinon FIFO global aussi. */
  ghostsOnly: boolean;
}

export const DEFAULT_PURGE_POLICY: MergeLogPurgePolicy = {
  maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 jours
  maxSize: 5000,
  ghostsOnly: false,
};

export const getPurgePolicy = (): MergeLogPurgePolicy => {
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    if (!raw) return { ...DEFAULT_PURGE_POLICY };
    const p = JSON.parse(raw);
    return {
      maxAgeMs: Number.isFinite(p.maxAgeMs) ? p.maxAgeMs : DEFAULT_PURGE_POLICY.maxAgeMs,
      maxSize: Number.isFinite(p.maxSize) ? Math.min(p.maxSize, HARD_MAX_ENTRIES) : DEFAULT_PURGE_POLICY.maxSize,
      ghostsOnly: Boolean(p.ghostsOnly),
    };
  } catch {
    return { ...DEFAULT_PURGE_POLICY };
  }
};

export const setPurgePolicy = (p: Partial<MergeLogPurgePolicy>): MergeLogPurgePolicy => {
  const next = { ...getPurgePolicy(), ...p };
  next.maxSize = Math.max(10, Math.min(next.maxSize, HARD_MAX_ENTRIES));
  next.maxAgeMs = Math.max(60_000, next.maxAgeMs);
  try { localStorage.setItem(POLICY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
};

const loadRaw = (): MergeLogEntry[] => {
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
    const trimmed = entries.length > HARD_MAX_ENTRIES
      ? entries.slice(entries.length - HARD_MAX_ENTRIES)
      : entries;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota — silently drop */
  }
};

/**
 * Applique la politique de purge : supprime les fantômes plus vieux que maxAgeMs
 * et tronque FIFO si la taille dépasse maxSize. Retourne la liste purgée et
 * le nombre d'entrées supprimées.
 */
export const applyPurgePolicy = (
  entries: MergeLogEntry[],
  policy: MergeLogPurgePolicy = getPurgePolicy(),
  now: number = Date.now(),
): { entries: MergeLogEntry[]; removed: number } => {
  const cutoff = now - policy.maxAgeMs;
  let out = entries.filter((e) => {
    if (!e.ghost_purged) return true;
    const t = Date.parse(e.ts);
    return Number.isFinite(t) ? t >= cutoff : true;
  });
  if (!policy.ghostsOnly) {
    out = out.filter((e) => {
      const t = Date.parse(e.ts);
      return Number.isFinite(t) ? t >= cutoff : true;
    });
  }
  if (out.length > policy.maxSize) {
    out = out.slice(out.length - policy.maxSize);
  }
  return { entries: out, removed: entries.length - out.length };
};

export const getMergeLog = (): MergeLogEntry[] => {
  const raw = loadRaw();
  const { entries, removed } = applyPurgePolicy(raw);
  if (removed > 0) persist(entries);
  return entries;
};

/** Purge manuelle, 100% hors-ligne. Retourne le nombre d'entrées supprimées. */
export const purgeMergeLogNow = (policy?: MergeLogPurgePolicy): number => {
  const raw = loadRaw();
  const { entries, removed } = applyPurgePolicy(raw, policy ?? getPurgePolicy());
  persist(entries);
  return removed;
};

export const clearMergeLog = (): void => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
};

const rand = () => Math.random().toString(36).slice(2, 10);

export interface RecordMergeBatchInput {
  conflicts: ConflictLogEntry[];
  ghostsPurged: string[];
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

  const next = [...loadRaw(), ...added];
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

const downloadBlob = (content: string | Uint8Array, filename: string, mime: string) => {
  const parts: BlobPart[] = typeof content === "string" ? ["\uFEFF" + content] : [content];
  const blob = new Blob(parts, { type: `${mime};charset=utf-8;` });
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

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);

export const exportMergeLogCSV = (entries: MergeLogEntry[]): void => {
  downloadBlob(buildMergeLogCSV(entries), `merge_log_${stamp()}.csv`, "text/csv");
};

export const exportMergeLogJSON = (entries: MergeLogEntry[]): void => {
  downloadBlob(JSON.stringify(entries, null, 2), `merge_log_${stamp()}.json`, "application/json");
};

/**
 * Export PDF du journal — colonnes identiques à l'écran (Horodatage, client_uuid,
 * Source/Fantôme, Règle, Statuts local→remote). 100% hors-ligne via jsPDF.
 */
export const exportMergeLogPDF = (entries: MergeLogEntry[]): void => {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const generatedAt = new Date().toISOString();
  doc.setFontSize(13);
  doc.text(`Merge log — ${entries.length} entry(ies)`, 10, 12);
  doc.setFontSize(8);
  doc.text(generatedAt, 287, 12, { align: "right" });

  const headers = ["Timestamp", "client_uuid", "Source", "Rule", "Status (local→remote)"];
  const colX = [10, 60, 150, 180, 230];
  const headerY = 20;

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    headers.forEach((h, i) => doc.text(h, colX[i], headerY));
    doc.setDrawColor(180);
    doc.line(10, headerY + 1.5, 287, headerY + 1.5);
    doc.setFont("helvetica", "normal");
  };

  drawHeader();
  let y = headerY + 6;
  doc.setFontSize(8);

  entries.forEach((e) => {
    if (y > 200) {
      doc.addPage();
      drawHeader();
      y = headerY + 6;
      doc.setFontSize(8);
    }
    const source = e.ghost_purged ? "ghost" : e.winner_source;
    const statuses = `${e.local_status ?? "—"} → ${e.remote_status ?? "—"}`;
    doc.text(e.ts.slice(0, 19), colX[0], y);
    doc.text(e.client_uuid.slice(0, 36), colX[1], y);
    doc.text(source, colX[2], y);
    doc.text(e.reason.slice(0, 28), colX[3], y);
    doc.text(statuses, colX[4], y);
    y += 4.5;
  });

  doc.save(`merge_log_${stamp()}.pdf`);
};
