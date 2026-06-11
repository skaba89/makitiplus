/**
 * E2E perf — merge log 10 000 entrées hors-ligne :
 *  - exports CSV / JSON sous des seuils raisonnables
 *  - correspondance colonnes/valeurs (entêtes + premier/dernier uuid)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordMergeBatch, clearMergeLog,
  buildMergeLogCSV, exportMergeLogCSV, exportMergeLogJSON,
  MERGE_LOG_CSV_HEADERS, getMergeLog,
} from "@/lib/receiptDeliveryMergeLog";

const setOnline = (v: boolean) =>
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });

const captureBlobs = () => {
  const Orig: typeof Blob = (globalThis as any).Blob;
  const all: { type: string; text: string }[] = [];
  class Cap extends Orig {
    constructor(parts: any[] = [], opts: BlobPropertyBag = {}) {
      super(parts, opts);
      all.push({
        type: opts.type ?? "",
        text: (parts as any[]).map((p) => typeof p === "string" ? p : "").join(""),
      });
    }
  }
  (globalThis as any).Blob = Cap;
  return { all, restore: () => { (globalThis as any).Blob = Orig; } };
};

const seedLarge = (n: number) => {
  // Évite la limite HARD_MAX_ENTRIES (10 000) en respectant la borne.
  const total = Math.min(n, 10_000);
  const batchSize = 500;
  for (let i = 0; i < total; i += batchSize) {
    const conflicts = [];
    for (let j = 0; j < batchSize && i + j < total; j++) {
      conflicts.push({
        client_uuid: `uuid-${String(i + j).padStart(6, "0")}`,
        winner_source: (j % 2 === 0 ? "local" : "remote") as "local" | "remote",
        reason: j % 3 === 0 ? "status_priority(sent>pending)" : "last_write_wins",
        local_status: "pending" as const,
        remote_status: "sent" as const,
      });
    }
    recordMergeBatch({ conflicts, ghostsPurged: i % 1000 === 0 ? [`ghost-${i}`] : [] });
  }
};

describe("MergeLogPanel — exports 10k offline (perf + colonnes)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearMergeLog();
    setOnline(false);
  });

  it("génère un CSV de 10 000 entrées en < 2 s avec colonnes & valeurs correctes", () => {
    seedLarge(10_000);
    const entries = getMergeLog();
    expect(entries.length).toBeGreaterThanOrEqual(9_500); // marge sécurité (cap + ghosts)

    const t0 = performance.now();
    const csv = buildMergeLogCSV(entries);
    const dt = performance.now() - t0;

    const [header, ...rows] = csv.split("\n");
    expect(header).toBe(MERGE_LOG_CSV_HEADERS.join(";"));
    expect(rows.length).toBe(entries.length);

    // valeurs : 1er & dernier uuid présents
    expect(rows[0]).toContain(entries[0].client_uuid);
    expect(rows[rows.length - 1]).toContain(entries[entries.length - 1].client_uuid);

    // perf : < 2s en jsdom (marge large)
    expect(dt).toBeLessThan(2000);
  });

  it("exportMergeLogCSV produit un Blob text/csv contenant toutes les lignes", () => {
    seedLarge(10_000);
    const cap = captureBlobs();
    (URL as any).createObjectURL = vi.fn(() => "blob:offline-10k");
    (URL as any).revokeObjectURL = vi.fn();
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { /* no-op */ };
    try {
      const t0 = performance.now();
      exportMergeLogCSV(getMergeLog());
      const dt = performance.now() - t0;
      expect(dt).toBeLessThan(2500);
      const last = cap.all[cap.all.length - 1];
      expect(last.type).toContain("text/csv");
      const csv = last.text.replace(/^\uFEFF/, "");
      expect(csv.split("\n")[0]).toBe(MERGE_LOG_CSV_HEADERS.join(";"));
      expect(csv.split("\n").length - 1).toBe(getMergeLog().length);
    } finally {
      cap.restore();
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it("exportMergeLogJSON produit un JSON parsable de toutes les entrées en < 3 s", () => {
    seedLarge(10_000);
    const cap = captureBlobs();
    (URL as any).createObjectURL = vi.fn(() => "blob:offline-10k-json");
    (URL as any).revokeObjectURL = vi.fn();
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { /* no-op */ };
    try {
      const entries = getMergeLog();
      const t0 = performance.now();
      exportMergeLogJSON(entries);
      const dt = performance.now() - t0;
      expect(dt).toBeLessThan(3000);
      const last = cap.all[cap.all.length - 1];
      expect(last.type).toContain("application/json");
      const parsed = JSON.parse(last.text.replace(/^\uFEFF/, ""));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(entries.length);
      // Schéma : colonnes identiques à l'écran
      const sample = parsed[0];
      ["ts", "batch_id", "client_uuid", "winner_source", "reason", "ghost_purged"]
        .forEach((k) => expect(sample).toHaveProperty(k));
    } finally {
      cap.restore();
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
