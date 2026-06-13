import { supabase } from "@/integrations/supabase/client";

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
  entity_type: EntityType;
  entity_id?: string | null;
  entity_label?: string | null;
  device_id?: string | null;
  local_data: any;
  remote_data: any;
  resolved_data?: any;
  resolution_strategy: Strategy;
  status?: "resolved" | "pending" | "failed";
  error_message?: string | null;
}

const DEVICE_ID_KEY = "malikiplus_device_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
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
  try {
    await supabase.from("sync_conflicts").insert({
      ...entry,
      device_id: entry.device_id ?? getDeviceId(),
      status: entry.status ?? "resolved",
    });
  } catch (e) {
    // silent : ne jamais bloquer la sync
    console.warn("[sync] logConflict failed", e);
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
  const { count } = await supabase
    .from("sync_conflicts")
    .select("id", { count: "exact", head: true })
    .eq("acknowledged", false);
  return count ?? 0;
}
