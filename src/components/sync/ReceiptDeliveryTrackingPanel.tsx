import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Send, MessageCircle, MessageSquare, RefreshCw, CheckCircle2,
  Clock, AlertTriangle, Trash2, WifiOff, Wifi, Download, FileText,
  ArrowDownAZ, ArrowUpAZ, Languages, Hourglass, Ban,
} from "lucide-react";
import {
  getQueue, retryOne, removeOne, flushQueue, isOnline, MAX_ATTEMPTS,
  QueuedDelivery, DeliveryStatus,
} from "@/lib/receiptDeliveryQueue";
import {
  getDict, getDeliveryLocale, setDeliveryLocale, LOCALE_OPTIONS,
  type DeliveryLocale, type DeliveryDict,
} from "@/lib/receiptDeliveryI18n";
import { exportDeliveryLogCSV, exportDeliveryLogPDF } from "@/lib/receiptDeliveryExport";
import { useToast } from "@/hooks/use-toast";

type StatusFilter = "all" | DeliveryStatus;
type SortDir = "desc" | "asc";

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const statusBadge = (s: DeliveryStatus, dict: DeliveryDict) => {
  const map: Record<DeliveryStatus, { cls: string; icon: JSX.Element; label: string }> = {
    sent: { cls: "border-primary/50 text-primary", icon: <CheckCircle2 className="h-3 w-3 mr-1" />, label: dict.sent },
    pending: { cls: "border-accent text-accent-foreground", icon: <Clock className="h-3 w-3 mr-1" />, label: dict.pending },
    failed: { cls: "border-destructive/50 text-destructive", icon: <AlertTriangle className="h-3 w-3 mr-1" />, label: dict.failed },
    duplicate: { cls: "border-muted-foreground/40 text-muted-foreground", icon: <></>, label: dict.duplicate },
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

export const ReceiptDeliveryTrackingPanel = () => {
  const { toast } = useToast();
  const [queue, setQueue] = useState<QueuedDelivery[]>([]);
  const [online, setOnline] = useState(isOnline());
  const [locale, setLocale] = useState<DeliveryLocale>(getDeliveryLocale());
  const dict = getDict(locale);

  // filtres / recherche / tri / pagination
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(1);

  const refresh = useCallback(() => {
    setQueue(getQueue());
    setOnline(isOnline());
  }, []);

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 2000);
    const h = () => refresh();
    window.addEventListener("online", h);
    window.addEventListener("offline", h);
    return () => {
      clearInterval(i);
      window.removeEventListener("online", h);
      window.removeEventListener("offline", h);
    };
  }, [refresh]);

  // Reset page courante quand on change un filtre/recherche
  useEffect(() => { setPage(1); }, [statusFilter, search, sortDir, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queue
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
  }, [queue, statusFilter, search, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const counts = {
    pending: queue.filter((q) => q.status === "pending").length,
    sent: queue.filter((q) => q.status === "sent").length,
    failed: queue.filter((q) => q.status === "failed").length,
    duplicate: queue.filter((q) => q.status === "duplicate").length,
  };

  const handleRetry = (uuid: string, force = false) => {
    const r = retryOne(uuid, { force });
    refresh();
    if (r?.status === "sent") toast({ title: dict.sent });
    else if (r?.status === "failed") toast({ variant: "destructive", title: dict.failed, description: r.last_error });
  };

  const handleFlushAll = () => {
    const r = flushQueue();
    refresh();
    toast({
      title: dict.retryAll,
      description: `✓${r.sent} ✗${r.failed} ↺${r.skipped} ⏳${r.deferred}`,
    });
  };

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

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {dict.empty}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((q) => {
                  const countdown = formatRetryCountdown(q.next_retry_at);
                  return (
                    <TableRow key={q.client_uuid} data-testid={`rt-row-${q.saleNumber}`}>
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
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
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
      </CardContent>
    </Card>
  );
};
