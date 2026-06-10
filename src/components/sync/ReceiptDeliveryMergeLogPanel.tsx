/**
 * Panneau de support : journal des fusions mergeRemoteQueue par client_uuid.
 *
 * Performance grandes buffers (10 000 entrées) :
 *  - Pagination (PAGE_SIZE 50/100/200) → DOM borné.
 *  - "Virtualisation" simple : on ne rend que la fenêtre de la page courante
 *    après filtrage. Les filtres sont mémoïsés.
 *
 * Filtres :
 *  - Recherche par client_uuid (préfixe inclusif).
 *  - Source : all / local / remote / none(ghost).
 *  - Fantômes purgés : all / only / hide.
 *
 * Exports hors-ligne : CSV et JSON (Blob), aucun appel réseau.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { GitMerge, Download, FileJson, Trash2, Ghost, RefreshCw } from "lucide-react";
import {
  getMergeLog, clearMergeLog, exportMergeLogCSV, exportMergeLogJSON,
  type MergeLogEntry,
} from "@/lib/receiptDeliveryMergeLog";
import { getDict, getDeliveryLocale } from "@/lib/receiptDeliveryI18n";

type SourceFilter = "all" | "local" | "remote" | "none";
type GhostFilter = "all" | "only" | "hide";

const PAGE_SIZES = [50, 100, 200];

const STORAGE_KEY = "sahelpos:receipt_delivery_merge_log";

export const ReceiptDeliveryMergeLogPanel = () => {
  const dict = getDict(getDeliveryLocale());
  const [entries, setEntries] = useState<MergeLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [ghostFilter, setGhostFilter] = useState<GhostFilter>("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const refresh = () => setEntries(getMergeLog());

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    const i = setInterval(refresh, 3000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(i);
    };
  }, []);

  useEffect(() => { setPage(1); }, [search, sourceFilter, ghostFilter, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (q && !e.client_uuid.toLowerCase().includes(q)) return false;
      if (sourceFilter !== "all" && e.winner_source !== sourceFilter) return false;
      if (ghostFilter === "only" && !e.ghost_purged) return false;
      if (ghostFilter === "hide" && e.ghost_purged) return false;
      return true;
    });
  }, [entries, search, sourceFilter, ghostFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const windowed = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  const ghostCount = useMemo(
    () => entries.filter((e) => e.ghost_purged).length,
    [entries],
  );

  return (
    <Card data-testid="merge-log-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <GitMerge className="h-5 w-5 text-primary" />
          {dict.mergeLogTitle}
        </CardTitle>
        <CardDescription>{dict.mergeLogDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={dict.mergeLogSearchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-[260px]"
            data-testid="ml-search"
          />
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
            <SelectTrigger className="h-9 w-[160px]" data-testid="ml-source-filter">
              <SelectValue placeholder={dict.mergeLogFilterSource} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{dict.all}</SelectItem>
              <SelectItem value="local">{dict.mergeLogSourceLocal}</SelectItem>
              <SelectItem value="remote">{dict.mergeLogSourceRemote}</SelectItem>
              <SelectItem value="none">{dict.mergeLogGhostBadge}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ghostFilter} onValueChange={(v) => setGhostFilter(v as GhostFilter)}>
            <SelectTrigger className="h-9 w-[170px]" data-testid="ml-ghost-filter">
              <SelectValue placeholder={dict.mergeLogFilterGhosts} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{dict.all}</SelectItem>
              <SelectItem value="only">{dict.mergeLogGhostOnly}</SelectItem>
              <SelectItem value="hide">{dict.mergeLogGhostHide}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={refresh} data-testid="ml-refresh">
            <RefreshCw className="h-3 w-3 mr-1" /> {dict.refresh}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => exportMergeLogCSV(filtered)}
            disabled={filtered.length === 0}
            data-testid="ml-export-csv"
          >
            <Download className="h-3 w-3 mr-1" /> {dict.mergeLogExportCsv}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => exportMergeLogJSON(filtered)}
            disabled={filtered.length === 0}
            data-testid="ml-export-json"
          >
            <FileJson className="h-3 w-3 mr-1" /> {dict.mergeLogExportJson}
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => { clearMergeLog(); refresh(); }}
            disabled={entries.length === 0}
            data-testid="ml-clear"
          >
            <Trash2 className="h-3 w-3 mr-1" /> {dict.mergeLogClear}
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span data-testid="ml-total">
            {filtered.length} / {entries.length} {dict.mergeLogTotal}
          </span>
          {ghostCount > 0 && (
            <Badge variant="outline" className="border-destructive/40 text-destructive" data-testid="ml-ghost-count">
              <Ghost className="h-3 w-3 mr-1" /> {ghostCount}
            </Badge>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border" data-testid="ml-table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.mergeLogTime}</TableHead>
                <TableHead>client_uuid</TableHead>
                <TableHead>{dict.mergeLogFilterSource}</TableHead>
                <TableHead>{dict.mergeLogRule}</TableHead>
                <TableHead>{dict.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-testid="ml-tbody">
              {windowed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {dict.mergeLogEmpty}
                  </TableCell>
                </TableRow>
              ) : (
                windowed.map((e) => (
                  <TableRow key={e.id} data-testid={`ml-row-${e.id}`}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(e.ts).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] break-all max-w-[260px]">
                      {e.client_uuid}
                    </TableCell>
                    <TableCell>
                      {e.ghost_purged ? (
                        <Badge variant="outline" className="border-destructive/50 text-destructive">
                          <Ghost className="h-3 w-3 mr-1" /> {dict.mergeLogGhostBadge}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          {e.winner_source === "local" ? dict.mergeLogSourceLocal : dict.mergeLogSourceRemote}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">{e.reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.local_status ?? "—"} → {e.remote_status ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-[90px]" data-testid="ml-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s} {dict.perPage}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="ml-prev"
            >
              {dict.prev}
            </Button>
            <span data-testid="ml-page-info">
              {dict.page} {safePage} {dict.of} {totalPages}
            </span>
            <Button
              size="sm" variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              data-testid="ml-next"
            >
              {dict.next}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
