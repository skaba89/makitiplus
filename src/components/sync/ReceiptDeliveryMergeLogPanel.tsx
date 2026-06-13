/**
 * Panneau de support : journal des fusions mergeRemoteQueue par client_uuid.
 *
 * Fonctionnalités :
 *  - Pagination (50/100/200) + filtres (search, source, fantômes)
 *  - Exports hors-ligne CSV / JSON / PDF (colonnes identiques à l'écran)
 *  - Purge automatique configurable (âge, taille, fantômes uniquement)
 *  - Bouton "Purger maintenant" 100% offline
 *  - Navigation rapide : "Dernier client_uuid", "Copier client_uuid filtrés"
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  GitMerge, Download, FileJson, FileText, Trash2, Ghost, RefreshCw,
  Eraser, Copy, RotateCcw, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMergeLog, clearMergeLog, exportMergeLogCSV, exportMergeLogJSON, exportMergeLogPDF,
  getPurgePolicy, setPurgePolicy, purgeMergeLogNow,
  type MergeLogEntry, type MergeLogPurgePolicy,
} from "@/lib/receiptDeliveryMergeLog";
import { getDict, getDeliveryLocale } from "@/lib/receiptDeliveryI18n";

type SourceFilter = "all" | "local" | "remote" | "none";
type GhostFilter = "all" | "only" | "hide";

const PAGE_SIZES = [50, 100, 200];
const STORAGE_KEY = "malikiplus:receipt_delivery_merge_log";
const LAST_UUID_KEY = "malikiplus:receipt_delivery_merge_log_last_uuid";

export const ReceiptDeliveryMergeLogPanel = () => {
  const dict = getDict(getDeliveryLocale());
  const [entries, setEntries] = useState<MergeLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [ghostFilter, setGhostFilter] = useState<GhostFilter>("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [policy, setPolicyState] = useState<MergeLogPurgePolicy>(() => getPurgePolicy());
  const [showPolicy, setShowPolicy] = useState(false);
  const lastUuidRef = useRef<string | null>(null);

  const refresh = () => setEntries(getMergeLog());

  useEffect(() => {
    refresh();
    try { lastUuidRef.current = localStorage.getItem(LAST_UUID_KEY); } catch { /* ignore */ }
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

  const rememberUuid = (uuid: string) => {
    lastUuidRef.current = uuid;
    try { localStorage.setItem(LAST_UUID_KEY, uuid); } catch { /* ignore */ }
  };

  const handleGotoLast = () => {
    const uuid = lastUuidRef.current;
    if (!uuid) {
      toast.info(dict.mergeLogGotoLast + " —");
      return;
    }
    setSearch(uuid);
    setSourceFilter("all");
    setGhostFilter("all");
  };

  const handleCopyFiltered = async () => {
    const uuids = Array.from(new Set(filtered.map((e) => e.client_uuid)));
    const text = uuids.join("\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand?.("copy");
        document.body.removeChild(ta);
      }
      toast.success(`${dict.mergeLogCopied} (${uuids.length})`);
    } catch {
      toast.error(dict.mergeLogCopied + " ✕");
    }
  };

  const handlePurgeNow = () => {
    const removed = purgeMergeLogNow(policy);
    refresh();
    toast.success(`${removed} ${dict.mergeLogPurged}`);
  };

  const handlePolicyChange = (patch: Partial<MergeLogPurgePolicy>) => {
    const next = setPurgePolicy(patch);
    setPolicyState(next);
  };

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
            aria-label={dict.mergeLogSearchPlaceholder}
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
          <Button
            size="sm" variant="outline"
            onClick={handleGotoLast}
            data-testid="ml-goto-last"
            title={dict.mergeLogGotoLast}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> {dict.mergeLogGotoLast}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={handleCopyFiltered}
            disabled={filtered.length === 0}
            data-testid="ml-copy-filtered"
            title={dict.mergeLogCopyFiltered}
          >
            <Copy className="h-3 w-3 mr-1" /> {dict.mergeLogCopyFiltered}
          </Button>
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
            size="sm" variant="outline"
            onClick={() => exportMergeLogPDF(filtered)}
            disabled={filtered.length === 0}
            data-testid="ml-export-pdf"
          >
            <FileText className="h-3 w-3 mr-1" /> {dict.mergeLogExportPdf}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={handlePurgeNow}
            disabled={entries.length === 0}
            data-testid="ml-purge-now"
            title={dict.mergeLogPurgeNow}
          >
            <Eraser className="h-3 w-3 mr-1" /> {dict.mergeLogPurgeNow}
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => setShowPolicy((v) => !v)}
            data-testid="ml-toggle-policy"
            aria-expanded={showPolicy}
          >
            <Settings2 className="h-3 w-3 mr-1" /> {dict.mergeLogPurgePolicy}
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

        {showPolicy && (
          <div
            className="rounded-md border bg-muted/30 p-3 flex flex-wrap items-end gap-3"
            data-testid="ml-policy-panel"
          >
            <label className="text-xs flex flex-col gap-1">
              <span className="text-muted-foreground">{dict.mergeLogPurgeAgeDays}</span>
              <Input
                type="number" min={1} max={365}
                className="h-8 w-[110px]"
                value={Math.round(policy.maxAgeMs / (24 * 60 * 60 * 1000))}
                onChange={(e) => handlePolicyChange({
                  maxAgeMs: Math.max(1, Number(e.target.value)) * 24 * 60 * 60 * 1000,
                })}
                data-testid="ml-policy-age"
              />
            </label>
            <label className="text-xs flex flex-col gap-1">
              <span className="text-muted-foreground">{dict.mergeLogPurgeMaxSize}</span>
              <Input
                type="number" min={10} max={10000}
                className="h-8 w-[110px]"
                value={policy.maxSize}
                onChange={(e) => handlePolicyChange({ maxSize: Number(e.target.value) })}
                data-testid="ml-policy-size"
              />
            </label>
            <label className="text-xs flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                checked={policy.ghostsOnly}
                onChange={(e) => handlePolicyChange({ ghostsOnly: e.target.checked })}
                data-testid="ml-policy-ghosts-only"
              />
              <span>{dict.mergeLogPurgeGhostsOnly}</span>
            </label>
          </div>
        )}

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
                  <TableRow
                    key={e.id}
                    data-testid={`ml-row-${e.id}`}
                    onClick={() => rememberUuid(e.client_uuid)}
                    className="cursor-pointer"
                  >
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
