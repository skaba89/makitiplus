import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Send, MessageCircle, MessageSquare, RefreshCw, CheckCircle2,
  Clock, AlertTriangle, Trash2, WifiOff, Wifi,
} from "lucide-react";
import {
  getQueue, retryOne, removeOne, flushQueue, isOnline,
  QueuedDelivery, DeliveryStatus,
} from "@/lib/receiptDeliveryQueue";
import { useToast } from "@/hooks/use-toast";

const statusBadge = (s: DeliveryStatus) => {
  switch (s) {
    case "sent":
      return (
        <Badge variant="outline" className="border-primary/50 text-primary">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Envoyé
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="outline" className="border-accent text-accent-foreground">
          <Clock className="h-3 w-3 mr-1" /> En attente
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="border-destructive/50 text-destructive">
          <AlertTriangle className="h-3 w-3 mr-1" /> Échec
        </Badge>
      );
    case "duplicate":
      return (
        <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
          Doublon ignoré
        </Badge>
      );
  }
};

export const ReceiptDeliveryTrackingPanel = () => {
  const { toast } = useToast();
  const [queue, setQueue] = useState<QueuedDelivery[]>([]);
  const [online, setOnline] = useState(isOnline());

  const refresh = useCallback(() => {
    setQueue([...getQueue()].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setOnline(isOnline());
  }, []);

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 2000);
    const onOn = () => refresh();
    const onOff = () => refresh();
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    return () => {
      clearInterval(i);
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, [refresh]);

  const counts = {
    pending: queue.filter((q) => q.status === "pending").length,
    sent: queue.filter((q) => q.status === "sent").length,
    failed: queue.filter((q) => q.status === "failed").length,
    duplicate: queue.filter((q) => q.status === "duplicate").length,
  };

  const handleRetry = (uuid: string) => {
    const r = retryOne(uuid);
    refresh();
    if (r?.status === "sent") toast({ title: "Ticket renvoyé avec succès" });
    else if (r?.status === "failed")
      toast({ variant: "destructive", title: "Échec", description: r.last_error });
  };

  const handleFlushAll = () => {
    const r = flushQueue();
    refresh();
    toast({
      title: "File traitée",
      description: `${r.sent} envoyé(s), ${r.failed} échec(s), ${r.skipped} doublon(s)`,
    });
  };

  return (
    <Card data-testid="receipt-tracking-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-5 w-5 text-primary" />
          Suivi des envois de tickets (WhatsApp / SMS)
        </CardTitle>
        <CardDescription>
          État de la file d'envoi automatique. Les échecs peuvent être retentés sans risque de doublon
          (idempotence garantie par <code>client_uuid</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statut + compteurs */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge
            variant="outline"
            className={online ? "border-primary/50 text-primary" : "border-destructive/50 text-destructive"}
            data-testid="rt-online-badge"
          >
            {online ? <><Wifi className="h-3 w-3 mr-1" /> En ligne</> : <><WifiOff className="h-3 w-3 mr-1" /> Hors ligne</>}
          </Badge>
          <div className="flex gap-2 text-xs">
            <span data-testid="rt-count-pending">⏳ {counts.pending} en attente</span>
            <span data-testid="rt-count-sent" className="text-primary">✓ {counts.sent} envoyés</span>
            <span data-testid="rt-count-failed" className="text-destructive">✗ {counts.failed} échec(s)</span>
            <span className="text-muted-foreground">↺ {counts.duplicate} doublon(s)</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={refresh}>
              <RefreshCw className="h-3 w-3 mr-1" /> Rafraîchir
            </Button>
            <Button
              size="sm"
              onClick={handleFlushAll}
              disabled={counts.pending + counts.failed === 0}
              data-testid="rt-flush-all"
            >
              <Send className="h-3 w-3 mr-1" /> Tout retenter
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Destinataire</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Tentatives</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Aucun ticket en file 🎉
                  </TableCell>
                </TableRow>
              ) : (
                queue.map((q) => (
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
                    <TableCell data-testid={`rt-status-${q.saleNumber}`}>{statusBadge(q.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {q.attempts}
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
                          onClick={() => handleRetry(q.client_uuid)}
                          data-testid={`rt-retry-${q.saleNumber}`}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Retenter
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { removeOne(q.client_uuid); refresh(); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
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
