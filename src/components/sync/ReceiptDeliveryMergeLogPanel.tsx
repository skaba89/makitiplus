/**
 * Panneau de support — affiche le journal de mergeRemoteQueue par client_uuid.
 *
 * Pour chaque résolution de conflit :
 *  - règle appliquée (statut > tentatives > last-write-wins),
 *  - source gagnante (locale vs distante),
 *  - statut local/distant avant fusion.
 *
 * Affiche également la liste des IDs fantômes purgés (présents dans la
 * sélection mais plus dans la file après merge).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { GitMerge, Trash2, RefreshCw, Ghost } from "lucide-react";
import {
  getMergeLogs, getMergeBatches, clearMergeLogs,
  type PersistedMergeLog, type MergeBatchSummary,
} from "@/lib/receiptDeliveryMergeLog";

export const ReceiptDeliveryMergeLogPanel = () => {
  const [logs, setLogs] = useState<PersistedMergeLog[]>([]);
  const [batches, setBatches] = useState<MergeBatchSummary[]>([]);
  const [filter, setFilter] = useState("");

  const refresh = () => {
    setLogs(getMergeLogs());
    setBatches(getMergeBatches());
  };

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("sahelpos:receipt_delivery_merge")) refresh();
    };
    window.addEventListener("storage", onStorage);
    const i = setInterval(refresh, 3000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(i);
    };
  }, []);

  const filteredLogs = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return logs;
    return logs.filter(
      (l) =>
        l.client_uuid.toLowerCase().includes(f) ||
        l.reason.toLowerCase().includes(f) ||
        l.winner_source.includes(f) ||
        (l.local_status ?? "").includes(f) ||
        (l.remote_status ?? "").includes(f),
    );
  }, [logs, filter]);

  const ghostCount = batches.reduce((s, b) => s + b.prunedGhostIds.length, 0);

  return (
    <Card data-testid="receipt-merge-log-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <GitMerge className="h-5 w-5 text-primary" />
          Journal des fusions (support)
        </CardTitle>
        <CardDescription>
          Trace par client_uuid des résolutions appliquées par mergeRemoteQueue
          (règles déterministes) et des IDs fantômes purgés de la sélection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center flex-wrap gap-2">
          <Input
            placeholder="Filtrer par UUID, règle, source…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 max-w-[280px]"
            data-testid="ml-filter"
          />
          <Badge variant="outline" data-testid="ml-batch-count">
            {batches.length} batch(es)
          </Badge>
          <Badge variant="outline" data-testid="ml-conflict-count">
            {logs.length} conflit(s)
          </Badge>
          <Badge variant="outline" className="border-destructive/40 text-destructive" data-testid="ml-ghost-count">
            <Ghost className="h-3 w-3 mr-1" /> {ghostCount} ID(s) fantôme(s)
          </Badge>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={refresh}>
            <RefreshCw className="h-3 w-3 mr-1" /> Rafraîchir
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { clearMergeLogs(); refresh(); }}
            data-testid="ml-clear"
          >
            <Trash2 className="h-3 w-3 mr-1" /> Vider
          </Button>
        </div>

        {/* Résumé par batch */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Conflits</TableHead>
                <TableHead>Ajouts distants</TableHead>
                <TableHead>IDs fantômes purgés</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Aucun merge enregistré.
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((b) => (
                  <TableRow key={b.batch_id} data-testid={`ml-batch-${b.batch_id}`}>
                    <TableCell className="font-mono text-xs">{b.batch_id}</TableCell>
                    <TableCell className="text-xs">{new Date(b.resolved_at).toLocaleString()}</TableCell>
                    <TableCell>{b.conflictsResolved}</TableCell>
                    <TableCell className="text-primary">+{b.addedFromRemote}</TableCell>
                    <TableCell className="text-xs">
                      {b.prunedGhostIds.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="font-mono break-all">
                          {b.prunedGhostIds.join(", ")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Détail par client_uuid */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>client_uuid</TableHead>
                <TableHead>Source gagnante</TableHead>
                <TableHead>Règle appliquée</TableHead>
                <TableHead>Statut local</TableHead>
                <TableHead>Statut distant</TableHead>
                <TableHead>Batch / heure</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Aucun conflit enregistré.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((l, idx) => (
                  <TableRow key={`${l.batch_id}-${l.client_uuid}-${idx}`} data-testid={`ml-log-${l.client_uuid}`}>
                    <TableCell className="font-mono text-xs break-all">{l.client_uuid}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={l.winner_source === "local"
                          ? "border-primary/50 text-primary"
                          : "border-accent text-accent-foreground"}
                      >
                        {l.winner_source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{l.reason}</TableCell>
                    <TableCell className="text-xs">{l.local_status ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.remote_status ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="font-mono">{l.batch_id}</div>
                      <div>{new Date(l.resolved_at).toLocaleString()}</div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
