import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Send, MessageCircle, MessageSquare, RefreshCw, CheckCircle2,
  Clock, AlertTriangle, Trash2, WifiOff, Wifi, Download, FileText,
  ArrowDownAZ, ArrowUpAZ, Languages, Hourglass, Ban, Copy, Archive, GitMerge, Eye, Undo2,
} from "lucide-react";
import {
  getQueue, retryOne, removeOne, isOnline, MAX_ATTEMPTS,
  retryMany, removeMany, mergeDuplicates, archiveDuplicates,
  onExhausted, checkExhaustedDelta,
  snapshotQueue, restoreQueue, replaceQueue, flushQueueAsync,
  QueuedDelivery, DeliveryStatus,
} from "@/lib/receiptDeliveryQueue";
import { mergeRemoteQueue } from "@/lib/receiptDeliveryConflict";
import {
  getDict, getDeliveryLocale, setDeliveryLocale, LOCALE_OPTIONS,
  type DeliveryLocale, type DeliveryDict,
} from "@/lib/receiptDeliveryI18n";
import { exportDeliveryLogCSV, exportDeliveryLogPDF } from "@/lib/receiptDeliveryExport";
import { exportSelectedHistoryCSV, exportSelectedHistoryPDF } from "@/lib/receiptDeliverySelectedExport";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type StatusFilter = "all" | DeliveryStatus;
type SortDir = "desc" | "asc";

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const statusBadge = (s: DeliveryStatus, dict: DeliveryDict) => {
  const map: Record<DeliveryStatus, { cls: string; icon: JSX.Element; label: string }> = {
    sent: { cls: "border-primary/50 text-primary", icon: <CheckCircle2 className="h-3 w-3 mr-1" />, label: dict.sent },
    pending: { cls: "border-accent text-accent-foreground", icon: <Clock className="h-3 w-3 mr-1" />, label: dict.pending },
    failed: { cls: "border-destructive/50 text-destructive", icon: <AlertTriangle className="h-3 w-3 mr-1" />, label: dict.failed },
    duplicate: { cls: "border-muted-foreground/40 text-muted-foreground", icon: <Copy className="h-3 w-3 mr-1" />, label: dict.duplicate },
  };
  const m = map[s];
  return <Badge variant="outline" className={m.cls}>{m.icon}{m.label}</Badge>;
};

const formatRetryCountdown = (iso?: string): string | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
  return `${Math.ceil(ms / 60_000)}min`;
};

const formatDate = (iso?: string) => iso ? new Date(iso).toLocaleString() : "—";

export const ReceiptDeliveryTrackingPanel = () => {
  const { toast } = useToast();
  const [queue, setQueue] = useState<QueuedDelivery[]>([]);
  const [online, setOnline] = useState(isOnline());
  const [locale, setLocale] = useState<DeliveryLocale>(getDeliveryLocale());
  const dict = getDict(locale);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(1);
  // Persist selection in localStorage so it survives hard refresh / tab reload.
  // (Previously sessionStorage — which is lost on full reload.)
  const SELECTION_KEY = "sahelpos:receipt_delivery_selection";
  const readPersistedSelection = (): Set<string> => {
    try {
      const raw = localStorage.getItem(SELECTION_KEY)
        ?? sessionStorage.getItem(SELECTION_KEY); // back-compat
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  };
  const [selected, setSelected] = useState<Set<string>>(() => readPersistedSelection());
  useEffect(() => {
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(Array.from(selected)));
    } catch { /* ignore */ }
  }, [selected]);
  const [detailUuid, setDetailUuid] = useState<string | null>(null);
  const dictRef = useRef(dict);
  dictRef.current = dict;

  const refresh = useCallback(() => {
    const q = getQueue();
    setQueue(q);
    setOnline(isOnline());
    // Auto-prune ghost UUIDs : if entries selected no longer exist in the
    // queue (removed or never present after reload), drop them silently.
    // Selection is also pruned for archived entries via the same path
    // because callers explicitly call setSelected(new Set()) after archive,
    // but if user manually deletes a selected row we still clean up here.
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(q.map((e) => e.client_uuid));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    refresh();
    const i = setInterval(() => {
      refresh();
      checkExhaustedDelta();
    }, 2000);
    const h = () => refresh();
    window.addEventListener("online", h);
    window.addEventListener("offline", h);
    const off = onExhausted((entries) => {
      toast({
        variant: "destructive",
        title: dictRef.current.exhaustedToast,
        description: entries.map((e) => e.saleNumber).join(", "),
      });
    });
    return () => {
      clearInterval(i);
      window.removeEventListener("online", h);
      window.removeEventListener("offline", h);
      off();
    };
  }, [refresh, toast]);

  // IMPORTANT : on conserve `selected` lors d'un changement de page / filtre /
  // recherche / tri pour permettre à l'utilisateur de cocher des lignes sur
  // plusieurs pages avant un bulk action. Seul `page` est remis à 1.
  useEffect(() => { setPage(1); }, [statusFilter, showDuplicates, search, sortDir, pageSize]);

  // Confirmations
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);

  // Progression de synchronisation
  const [syncProgress, setSyncProgress] = useState<{
    processed: number; total: number; sent: number; failed: number;
  } | null>(null);

  // Cross-tab : si un autre onglet/appareil modifie la sélection,
  // on se resynchronise (évite l'incohérence du compteur).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SELECTION_KEY) {
        try {
          const arr = e.newValue ? JSON.parse(e.newValue) : [];
          setSelected(new Set(Array.isArray(arr) ? arr : []));
        } catch { /* ignore */ }
      } else if (e.key === "sahelpos:receipt_delivery_queue") {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queue
      .filter((e) => showDuplicates ? true : e.status !== "duplicate")
      .filter((e) => statusFilter === "all" ? true : e.status === statusFilter)
      .filter((e) => !q
        ? true
        : e.saleNumber.toLowerCase().includes(q)
          || e.phone.toLowerCase().includes(q)
          || e.channel.toLowerCase().includes(q)
          || (e.last_error ?? "").toLowerCase().includes(q))
      .sort((a, b) => sortDir === "desc"
        ? b.created_at.localeCompare(a.created_at)
        : a.created_at.localeCompare(b.created_at));
  }, [queue, statusFilter, showDuplicates, search, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const counts = {
    pending: queue.filter((q) => q.status === "pending").length,
    sent: queue.filter((q) => q.status === "sent").length,
    failed: queue.filter((q) => q.status === "failed").length,
    duplicate: queue.filter((q) => q.status === "duplicate").length,
  };

  const detailEntry = useMemo(
    () => queue.find((q) => q.client_uuid === detailUuid) ?? null,
    [queue, detailUuid],
  );

  const allSelected = paginated.length > 0 && paginated.every((p) => selected.has(p.client_uuid));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) paginated.forEach((p) => next.delete(p.client_uuid));
      else paginated.forEach((p) => next.add(p.client_uuid));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleRetry = (uuid: string, force = false) => {
    const r = retryOne(uuid, { force });
    refresh();
    if (r?.status === "sent") toast({ title: dict.sent });
    else if (r?.status === "failed") toast({ variant: "destructive", title: dict.failed, description: r.last_error });
  };

  /**
   * Flush async — affiche progress bar + compteurs en temps réel.
   * OPTIM : throttle des refresh React (UI) à ~80ms ou tous les 25 items,
   * pour éviter les ralentissements sur grandes files (300+ entrées).
   * La progression interne reste comptabilisée pour chaque entrée.
   */
  const handleFlushAll = async () => {
    setSyncProgress({ processed: 0, total: counts.pending + counts.failed, sent: 0, failed: 0 });
    let lastTick = 0;
    const THROTTLE_MS = 80;
    const THROTTLE_STEP = 25;
    const r = await flushQueueAsync((p) => {
      const now = Date.now();
      const isLast = p.processed >= p.total;
      if (!isLast && now - lastTick < THROTTLE_MS && p.processed % THROTTLE_STEP !== 0) return;
      lastTick = now;
      setSyncProgress({ processed: p.processed, total: p.total, sent: p.sent, failed: p.failed });
      refresh();
    });
    setSyncProgress(null);
    refresh();
    toast({ title: dict.retryAll, description: `✓${r.sent} ✗${r.failed} ↺${r.skipped} ⏳${r.deferred}` });
  };

  const handleBulkRetry = () => {
    if (selected.size === 0) { toast({ title: dict.noneSelected }); return; }
    const r = retryMany(Array.from(selected));
    refresh();
    toast({ title: dict.bulkRetry, description: `✓${r.sent} ✗${r.failed} ↺${r.skipped}` });
    setSelected(new Set());
  };

  /** Undo helper : restaure le snapshot + sélection précédente. */
  const undoWithSnapshot = (snapshot: QueuedDelivery[], prevSelection: Set<string>) => {
    restoreQueue(snapshot);
    setSelected(new Set(prevSelection));
    refresh();
    toast({ title: dict.actionUndone });
  };

  const showUndoToast = (title: string, description: string, snapshot: QueuedDelivery[], prevSelection: Set<string>) => {
    toast({
      title,
      description,
      duration: 6000,
      action: (
        <ToastAction
          altText={dict.undo}
          onClick={() => undoWithSnapshot(snapshot, prevSelection)}
          data-testid="rt-undo"
        >
          <Undo2 className="h-3 w-3 mr-1" /> {dict.undo}
        </ToastAction>
      ),
    });
  };

  const handleBulkRemove = () => {
    if (selected.size === 0) { toast({ title: dict.noneSelected }); return; }
    setConfirmRemoveOpen(true);
  };
  const confirmBulkRemove = () => {
    const snapshot = snapshotQueue();
    const prevSelection = new Set(selected);
    const n = removeMany(Array.from(selected));
    refresh();
    setSelected(new Set());
    setConfirmRemoveOpen(false);
    showUndoToast(dict.bulkRemove, `−${n}`, snapshot, prevSelection);
  };

  const handleMergeDup = () => {
    const snapshot = snapshotQueue();
    const prevSelection = new Set(selected);
    const r = mergeDuplicates();
    refresh();
    showUndoToast(dict.duplicatesMerged, `−${r.merged} → ${r.kept}`, snapshot, prevSelection);
  };

  const handleArchiveDup = () => { setConfirmArchiveOpen(true); };
  const confirmArchiveDup = () => {
    const snapshot = snapshotQueue();
    const prevSelection = new Set(selected);
    const n = archiveDuplicates();
    refresh();
    setConfirmArchiveOpen(false);
    showUndoToast(dict.duplicatesArchived, `↺${n}`, snapshot, prevSelection);
  };

  /**
   * Simulation d'une réception distante : merge avec règles déterministes
   * (cf. mergeRemoteQueue). En contexte réel, `remote` arrive via Supabase
   * realtime ou polling. Ici nous exposons une commande dev/QA.
   */
  const handleMergeRemote = (remote: QueuedDelivery[]) => {
    const report = mergeRemoteQueue(getQueue(), remote);
    replaceQueue(report.merged);
    refresh();
    toast({
      title: dict.remoteMerged,
      description: `±${report.conflictsResolved} +${report.addedFromRemote}`,
    });
    return report;
  };
  // Exposé pour les tests E2E (non-officiel, opt-in).
  (window as any).__sahelpos_mergeRemote = handleMergeRemote;

  const selectedRows = useMemo(
    () => queue.filter((q) => selected.has(q.client_uuid)),
    [queue, selected],
  );

  const handleLocale = (l: DeliveryLocale) => {
    setLocale(l);
    setDeliveryLocale(l);
  };


  return (
    <Card data-testid="receipt-tracking-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-5 w-5 text-primary" />
          {dict.title}
        </CardTitle>
        <CardDescription>{dict.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statut + langue + compteurs */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={online ? "border-primary/50 text-primary" : "border-destructive/50 text-destructive"}
              data-testid="rt-online-badge"
            >
              {online ? <><Wifi className="h-3 w-3 mr-1" /> {dict.online}</> : <><WifiOff className="h-3 w-3 mr-1" /> {dict.offline}</>}
            </Badge>
            <div className="flex items-center gap-1">
              <Languages className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={locale} onValueChange={(v) => handleLocale(v as DeliveryLocale)}>
                <SelectTrigger className="h-8 w-[130px]" data-testid="rt-locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALE_OPTIONS.map((o) => (
                    <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 text-xs flex-wrap">
            <span data-testid="rt-count-pending">⏳ {counts.pending} {dict.pending}</span>
            <span data-testid="rt-count-sent" className="text-primary">✓ {counts.sent} {dict.sent}</span>
            <span data-testid="rt-count-failed" className="text-destructive">✗ {counts.failed} {dict.failed}</span>
            <span className="text-muted-foreground">↺ {counts.duplicate} {dict.duplicate}</span>
          </div>
        </div>

        {/* Filtres + recherche + tri + actions */}
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder={dict.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-[220px]"
            data-testid="rt-search"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-[150px]" data-testid="rt-status-filter">
              <SelectValue placeholder={dict.filterStatus} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{dict.all}</SelectItem>
              <SelectItem value="pending">{dict.pending}</SelectItem>
              <SelectItem value="sent">{dict.sent}</SelectItem>
              <SelectItem value="failed">{dict.failed}</SelectItem>
              <SelectItem value="duplicate">{dict.duplicate}</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" data-testid="rt-show-duplicates">
            <Checkbox
              checked={showDuplicates}
              onCheckedChange={(v) => setShowDuplicates(Boolean(v))}
            />
            <Copy className="h-3 w-3" /> {dict.showDuplicates}
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
            data-testid="rt-sort"
          >
            {sortDir === "desc"
              ? <><ArrowDownAZ className="h-3.5 w-3.5 mr-1" />{dict.sortNewest}</>
              : <><ArrowUpAZ className="h-3.5 w-3.5 mr-1" />{dict.sortOldest}</>}
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={refresh}>
            <RefreshCw className="h-3 w-3 mr-1" /> {dict.refresh}
          </Button>
          <Button
            size="sm"
            onClick={handleFlushAll}
            disabled={counts.pending + counts.failed === 0}
            data-testid="rt-flush-all"
          >
            <Send className="h-3 w-3 mr-1" /> {dict.retryAll}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportDeliveryLogCSV(filtered, dict)}
            disabled={filtered.length === 0}
            data-testid="rt-export-csv"
          >
            <Download className="h-3 w-3 mr-1" /> {dict.exportCsv}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportDeliveryLogPDF(filtered, dict)}
            disabled={filtered.length === 0}
            data-testid="rt-export-pdf"
          >
            <FileText className="h-3 w-3 mr-1" /> {dict.exportPdf}
          </Button>
        </div>

        {/* Progress bar de synchronisation (visible uniquement durant un flush) */}
        {syncProgress && (
          <div
            className="space-y-1 rounded-md border bg-muted/20 p-2"
            role="status"
            aria-live="polite"
            data-testid="rt-sync-progress"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <RefreshCw className="h-3 w-3 animate-spin" /> {dict.syncing}
              </span>
              <span className="text-muted-foreground">
                <span className="text-primary">✓{syncProgress.sent}</span>{" "}
                <span className="text-destructive">✗{syncProgress.failed}</span>{" "}
                · {syncProgress.processed}/{Math.max(1, syncProgress.total)}{" "}
                <span className="opacity-70">{dict.syncProgress}</span>
              </span>
            </div>
            <Progress
              value={syncProgress.total > 0 ? (syncProgress.processed / syncProgress.total) * 100 : 0}
              className="h-1.5"
            />
          </div>
        )}

        {/* Bulk actions bar */}
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/30 px-2 py-1.5 text-xs"
          role="region"
          aria-label={dict.bulkActions}
        >
          <span className="font-medium">{dict.bulkActions} :</span>
          <span
            className="text-muted-foreground"
            data-testid="rt-selected-count"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={`${selected.size} ${dict.selectedAcrossResults} — ${filtered.length} ${dict.ticket}`}
          >
            <strong className="text-foreground">{selected.size}</strong>{" "}
            {dict.selectedAcrossResults}
            <span className="opacity-60"> · {filtered.length} {dict.ticket}</span>
          </span>
          {selected.size > 0 && (
            <Button
              size="sm" variant="ghost"
              onClick={() => setSelected(new Set())}
              data-testid="rt-clear-selection"
              className="h-7 px-2"
            >
              {dict.clearSelection}
            </Button>
          )}
          <Button
            size="sm" variant="outline"
            onClick={handleBulkRetry}
            disabled={selected.size === 0}
            data-testid="rt-bulk-retry"
          >
            <RefreshCw className="h-3 w-3 mr-1" /> {dict.bulkRetry}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={handleBulkRemove}
            disabled={selected.size === 0}
            data-testid="rt-bulk-remove"
          >
            <Trash2 className="h-3 w-3 mr-1" /> {dict.bulkRemove}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => exportSelectedHistoryCSV(selectedRows, dict)}
            disabled={selected.size === 0}
            data-testid="rt-export-selected-csv"
            title={dict.exportSelectedCsv}
          >
            <Download className="h-3 w-3 mr-1" /> {dict.exportSelectedCsv}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => exportSelectedHistoryPDF(selectedRows, dict)}
            disabled={selected.size === 0}
            data-testid="rt-export-selected-pdf"
            title={dict.exportSelectedPdf}
          >
            <FileText className="h-3 w-3 mr-1" /> {dict.exportSelectedPdf}
          </Button>
          <div className="flex-1" />
          <Button
            size="sm" variant="outline"
            onClick={handleMergeDup}
            disabled={counts.duplicate === 0 && counts.sent === 0 && counts.pending < 2}
            data-testid="rt-merge-dup"
          >
            <GitMerge className="h-3 w-3 mr-1" /> {dict.mergeDuplicates}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={handleArchiveDup}
            data-testid="rt-archive-dup"
          >
            <Archive className="h-3 w-3 mr-1" /> {dict.archiveDuplicates}
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="select-all"
                    data-testid="rt-select-all"
                  />
                </TableHead>
                <TableHead>{dict.ticket}</TableHead>
                <TableHead>{dict.channel}</TableHead>
                <TableHead>{dict.recipient}</TableHead>
                <TableHead>{dict.status}</TableHead>
                <TableHead>{dict.attempts}</TableHead>
                <TableHead className="text-right">{dict.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {dict.empty}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((q) => {
                  const countdown = formatRetryCountdown(q.next_retry_at);
                  return (
                    <TableRow key={q.client_uuid} data-testid={`rt-row-${q.saleNumber}`}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(q.client_uuid)}
                          onCheckedChange={() => toggleOne(q.client_uuid)}
                          aria-label={`select-${q.saleNumber}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{q.saleNumber}</TableCell>
                      <TableCell>
                        {q.channel === "whatsapp" ? (
                          <span className="flex items-center gap-1 text-xs">
                            <MessageCircle className="h-3 w-3 text-[#25D366]" /> WhatsApp
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs">
                            <MessageSquare className="h-3 w-3" /> SMS
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{q.phone}</TableCell>
                      <TableCell data-testid={`rt-status-${q.saleNumber}`}>
                        <div className="flex flex-col gap-1">
                          {statusBadge(q.status, dict)}
                          {q.exhausted && (
                            <span className="text-[10px] text-destructive flex items-center gap-1">
                              <Ban className="h-3 w-3" /> {dict.maxAttemptsReached}
                            </span>
                          )}
                          {!q.exhausted && countdown && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`rt-countdown-${q.saleNumber}`}>
                              <Hourglass className="h-3 w-3" /> {dict.nextRetryIn} {countdown}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {q.attempts} / {MAX_ATTEMPTS}
                        {q.last_error && (
                          <div className="text-[10px] text-destructive truncate max-w-[160px]">
                            {q.last_error}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailUuid(q.client_uuid)}
                          aria-label={dict.details}
                          data-testid={`rt-details-${q.saleNumber}`}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        {(q.status === "failed" || q.status === "pending") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetry(q.client_uuid, q.exhausted)}
                            data-testid={`rt-retry-${q.saleNumber}`}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" /> {dict.retry}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { removeOne(q.client_uuid); refresh(); }}
                          aria-label={dict.remove}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-[90px]" data-testid="rt-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s} {dict.perPage}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">
              {filtered.length} {dict.ticket}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="rt-prev"
            >
              {dict.prev}
            </Button>
            <span data-testid="rt-page-info">
              {dict.page} {safePage} {dict.of} {totalPages}
            </span>
            <Button
              size="sm" variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              data-testid="rt-next"
            >
              {dict.next}
            </Button>
          </div>
        </div>

        {/* Drawer détails */}
        <Sheet open={!!detailEntry} onOpenChange={(o) => !o && setDetailUuid(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="rt-detail-drawer">
            {detailEntry && (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Eye className="h-4 w-4" /> {dict.details} — {detailEntry.saleNumber}
                  </SheetTitle>
                  <SheetDescription className="flex items-center gap-2">
                    {statusBadge(detailEntry.status, dict)}
                    {detailEntry.exhausted && (
                      <Badge variant="outline" className="border-destructive/50 text-destructive">
                        <Ban className="h-3 w-3 mr-1" /> {dict.maxAttemptsReached}
                      </Badge>
                    )}
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-3 text-sm">
                  <Row label="client_uuid" value={<code className="font-mono text-xs break-all">{detailEntry.client_uuid}</code>} />
                  <Row label={dict.channel} value={detailEntry.channel} />
                  <Row label={dict.recipient} value={detailEntry.phone} />
                  <Row label={dict.attempts} value={`${detailEntry.attempts} / ${MAX_ATTEMPTS}`} />
                  <Row label={dict.createdAt} value={formatDate(detailEntry.created_at)} />
                  <Row label={dict.sentAt} value={formatDate(detailEntry.sent_at)} />
                  <Row label={dict.nextRetryAt} value={
                    detailEntry.next_retry_at
                      ? `${formatDate(detailEntry.next_retry_at)} (${formatRetryCountdown(detailEntry.next_retry_at) ?? "—"})`
                      : "—"
                  } />
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">{dict.lastError}</div>
                    <pre className="text-[11px] bg-destructive/5 border border-destructive/20 rounded p-2 whitespace-pre-wrap break-all min-h-[2rem]">
                      {detailEntry.last_error ?? "—"}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">{dict.payload}</div>
                    <pre className="text-[11px] bg-muted rounded p-2 max-h-[300px] overflow-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(detailEntry.payload, null, 2)}
                    </pre>
                  </div>
                  <div className="flex gap-2 pt-2">
                    {(detailEntry.status === "failed" || detailEntry.status === "pending") && (
                      <Button
                        size="sm"
                        onClick={() => { handleRetry(detailEntry.client_uuid, detailEntry.exhausted); }}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> {dict.retry}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { removeOne(detailEntry.client_uuid); setDetailUuid(null); refresh(); }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> {dict.remove}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Confirm bulk remove */}
        <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
          <AlertDialogContent data-testid="rt-confirm-remove" aria-label={dict.confirmRemoveDesc}>
            <AlertDialogHeader>
              <AlertDialogTitle>{dict.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {dict.confirmRemoveDesc} ({selected.size} {dict.selected})
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="rt-confirm-remove-cancel">{dict.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmBulkRemove}
                data-testid="rt-confirm-remove-ok"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {dict.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirm archive duplicates */}
        <AlertDialog open={confirmArchiveOpen} onOpenChange={setConfirmArchiveOpen}>
          <AlertDialogContent data-testid="rt-confirm-archive" aria-label={dict.confirmArchiveDesc}>
            <AlertDialogHeader>
              <AlertDialogTitle>{dict.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{dict.confirmArchiveDesc}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="rt-confirm-archive-cancel">{dict.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmArchiveDup} data-testid="rt-confirm-archive-ok">
                {dict.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-3 border-b pb-1.5">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <span className="text-xs text-right break-all">{value}</span>
  </div>
);
