/**
 * Résolution de conflits pour la file d'envoi des tickets quand plusieurs
 * appareils (ou onglets) modifient la même file offline puis se synchronisent.
 *
 * Règles claires, déterministes, par client_uuid :
 *   1. Si une seule version : on la garde.
 *   2. Sinon, statut prioritaire : sent > duplicate > failed > pending
 *      (on ne "déclasse" jamais un envoi confirmé).
 *   3. À statut égal : on garde le plus grand nombre de tentatives.
 *   4. Sinon : version la plus récemment modifiée (sent_at || created_at).
 *
 * Chaque résolution produit un log (console + retour) pour audit.
 */

import type { QueuedDelivery, DeliveryStatus } from "./receiptDeliveryQueue";

export interface ConflictLogEntry {
  client_uuid: string;
  winner_source: "local" | "remote";
  reason: string;
  local_status?: DeliveryStatus;
  remote_status?: DeliveryStatus;
}

const STATUS_RANK: Record<DeliveryStatus, number> = {
  sent: 4,
  duplicate: 3,
  failed: 2,
  pending: 1,
};

const timestampOf = (e: QueuedDelivery): number => {
  const t = e.sent_at ?? e.created_at;
  return t ? new Date(t).getTime() : 0;
};

const pickWinner = (
  a: QueuedDelivery,
  b: QueuedDelivery,
): { winner: QueuedDelivery; loser: QueuedDelivery; reason: string } => {
  const ra = STATUS_RANK[a.status];
  const rb = STATUS_RANK[b.status];
  if (ra !== rb) {
    return ra > rb
      ? { winner: a, loser: b, reason: `status_priority(${a.status}>${b.status})` }
      : { winner: b, loser: a, reason: `status_priority(${b.status}>${a.status})` };
  }
  if (a.attempts !== b.attempts) {
    return a.attempts > b.attempts
      ? { winner: a, loser: b, reason: `more_attempts(${a.attempts}>${b.attempts})` }
      : { winner: b, loser: a, reason: `more_attempts(${b.attempts}>${a.attempts})` };
  }
  const ta = timestampOf(a);
  const tb = timestampOf(b);
  return ta >= tb
    ? { winner: a, loser: b, reason: `last_write_wins(${ta}>=${tb})` }
    : { winner: b, loser: a, reason: `last_write_wins(${tb}>${ta})` };
};

export interface MergeReport {
  merged: QueuedDelivery[];
  logs: ConflictLogEntry[];
  conflictsResolved: number;
  addedFromRemote: number;
}

export const mergeRemoteQueue = (
  local: QueuedDelivery[],
  remote: QueuedDelivery[],
): MergeReport => {
  const logs: ConflictLogEntry[] = [];
  const byUuid = new Map<string, { entry: QueuedDelivery; source: "local" | "remote" }>();
  for (const e of local) byUuid.set(e.client_uuid, { entry: e, source: "local" });
  let conflictsResolved = 0;
  let addedFromRemote = 0;

  for (const r of remote) {
    const prev = byUuid.get(r.client_uuid);
    if (!prev) {
      byUuid.set(r.client_uuid, { entry: r, source: "remote" });
      addedFromRemote += 1;
      continue;
    }
    const { winner, reason } = pickWinner(prev.entry, r);
    const winnerSource: "local" | "remote" = winner === prev.entry ? prev.source : "remote";
    byUuid.set(r.client_uuid, { entry: winner, source: winnerSource });
    conflictsResolved += 1;
    const log: ConflictLogEntry = {
      client_uuid: r.client_uuid,
      winner_source: winnerSource,
      reason,
      local_status: prev.entry.status,
      remote_status: r.status,
    };
    logs.push(log);
    // Trace lisible pour le support / audit
    // eslint-disable-next-line no-console
    console.info("[receipt-delivery] conflict resolved", log);
  }

  return {
    merged: Array.from(byUuid.values()).map((v) => v.entry),
    logs,
    conflictsResolved,
    addedFromRemote,
  };
};
