import { logger } from "@/lib/logger";
import { getDB, STORES } from "./indexedDBStorage";

// Lazy import de supabase pour éviter le side-effect au niveau du module
// (crash "supabaseUrl is required" dans les tests unitaires qui n'ont pas de .env)
let _supabase: typeof import("@/integrations/supabase/client")["supabase"] | null = null;
async function getSupabase() {
  if (!_supabase) {
    const mod = await import("@/integrations/supabase/client");
    _supabase = mod.supabase;
  }
  return _supabase;
}

/**
 * Stratégie de résolution de conflits offline pour MalikiPlus.
 *
 * Trois familles d'entités, trois stratégies :
 *  - **Stock produits** : merge intelligent par delta
 *      résolu = remote_new + (local_new - previous), borné à 0
 *  - **Ventes** : pas de conflit possible (chaque vente a un sale_number unique côté appareil)
 *      → on insère simplement, et on logge si un doublon est détecté.
 *  - **Profils / rôles / autres champs métier** : Last-Write-Wins (basé sur updated_at).
 *
 * Chaque résolution est enregistrée dans `sync_conflicts` pour que l'admin puisse
 * inspecter ce qui s'est passé.
 */

export type EntityType = "product" | "sale" | "profile" | "user_role" | "stock";
export type Strategy =
  | "last_write_wins"
  | "merge_delta"
  | "unique_id"
  | "manual";

interface ConflictLog {
  user_id: string;
  organization_id?: string | null;
  entity_type: EntityType;
  entity_id?: string | null;
  entity_label?: string | null;
  device_id?: string | null;
  local_data: Record<string, unknown>;
  remote_data: Record<string, unknown>;
  resolved_data?: Record<string, unknown>;
  resolution_strategy: Strategy;
  status?: "resolved" | "pending" | "failed";
  error_message?: string | null;
}

const DEVICE_ID_KEY = "malikiplus_device_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Résout un conflit de stock par addition des deltas. */
export function mergeStockDelta(
  previous: number,
  localNew: number,
  remoteNew: number
): number {
  return Math.max(0, remoteNew + (localNew - previous));
}

/** Last-Write-Wins basé sur updated_at (ISO strings). */
export function lastWriteWins<T extends { updated_at?: string | null }>(
  local: T,
  remote: T
): T {
  const lt = local.updated_at ? new Date(local.updated_at).getTime() : 0;
  const rt = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
  return rt > lt ? remote : local;
}

/** Logge un conflit dans la base (best-effort, non-bloquant). */
export async function logConflict(entry: ConflictLog): Promise<void> {
  const localEntry = {
    ...entry,
    id: `conflict_${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    device_id: entry.device_id ?? getDeviceId(),
    status: entry.status ?? "resolved",
    createdAt: new Date().toISOString(),
    synced: false,
  };

  // Always write to local IndexedDB first (guaranteed persistence)
  await localConflictFallback(localEntry);

  // Then try to push to remote Supabase
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from("sync_conflicts").insert({
      ...entry,
      device_id: localEntry.device_id,
      status: localEntry.status,
      local_data: entry.local_data as unknown as import("@/integrations/supabase/types").Json,
      remote_data: entry.remote_data as unknown as import("@/integrations/supabase/types").Json,
      resolved_data: entry.resolved_data as unknown as import("@/integrations/supabase/types").Json | undefined,
    } as never);

    if (!error) {
      // Mark as synced in local store
      await markConflictSynced(localEntry.id);
    }
  } catch (e) {
    // silent : ne jamais bloquer la sync
    logger.warn("[sync] logConflict remote insert failed (stored locally)", e);
  }
}

/**
 * Store conflict in local IndexedDB as fallback when remote insert fails.
 * Ensures conflicts are never silently lost even when offline.
 */
async function localConflictFallback(entry: Record<string, unknown>): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CONFLICT_LOG, "readwrite");
      const store = tx.objectStore(STORES.CONFLICT_LOG);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    logger.warn("[sync] localConflictFallback failed", e);
  }
}

/**
 * Mark a local conflict as synced after successful remote insert.
 */
async function markConflictSynced(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CONFLICT_LOG, "readwrite");
      const store = tx.objectStore(STORES.CONFLICT_LOG);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const entry = getReq.result;
        if (entry) {
          entry.synced = true;
          store.put(entry);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    logger.warn("[sync] markConflictSynced failed", e);
  }
}

/**
 * Get all unsynced local conflict logs (for admin inspection).
 */
export async function getUnsyncedConflicts(): Promise<Record<string, unknown>[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CONFLICT_LOG, "readonly");
      const store = tx.objectStore(STORES.CONFLICT_LOG);
      const index = store.index("synced");
      const request = index.getAll(false);
      request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/** Résultat d'une session de synchronisation. */
export interface SyncReport {
  resolved: number;
  pending: number;
  failed: number;
  details: Array<{ entity: EntityType; label?: string; strategy: Strategy }>;
}

/** Vérifie s'il existe des conflits non acquittés pour cet utilisateur (visible admin). */
export async function fetchUnacknowledgedConflicts(): Promise<number> {
  const supabase = await getSupabase();
  const { count } = await supabase
    .from("sync_conflicts")
    .select("id", { count: "exact", head: true })
    .eq("acknowledged", false);
  return count ?? 0;
}
