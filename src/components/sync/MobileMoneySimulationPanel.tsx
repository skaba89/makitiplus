/**
 * Simulation flux Mobile Money offline → reconnexion :
 * - Génère un QR code (string) pour le paiement
 * - Encaisse côté marchand
 * - Webhook simulé (callback du provider) avec délai
 * - Statut succès/échec
 * - Remboursement
 * - Mode offline : tout est mis en file et rejoué à la reconnexion
 *   avec idempotence stricte par client_uuid.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  WifiOff, Wifi, QrCode, RefreshCcw, CheckCircle2, AlertTriangle,
  Trash2, Webhook, Smartphone, Undo2, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";

const STORAGE_KEY = "malikiplus:mobile_money_sim";

export type MMStatus =
  | "qr_generated"   // QR émis, en attente paiement
  | "pending_sync"   // encaissement local offline, à pousser
  | "awaiting_webhook" // envoyé au provider, on attend callback
  | "success"
  | "failed"
  | "refunded";

export interface MMTransaction {
  client_uuid: string;
  qr_code: string;
  amount: number;
  provider: "wave" | "orange_money" | "mtn_money";
  customer_phone: string;
  status: MMStatus;
  created_at: string;
  webhook_at?: string;
  refunded_at?: string;
  attempts: number;
  forceFail?: boolean; // pour la démo
}

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `mm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const load = (): MMTransaction[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};
const save = (tx: MMTransaction[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(tx));

export const MobileMoneySimulationPanel = () => {
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const [online, setOnline] = useState(true);
  const [tx, setTx] = useState<MMTransaction[]>(() => load());
  const [amount, setAmount] = useState(5000);
  const [phone, setPhone] = useState("77 555 11 22");
  const [provider, setProvider] = useState<MMTransaction["provider"]>("wave");
  const [forceFail, setForceFail] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { save(tx); }, [tx]);

  const generateQrAndCharge = () => {
    const id = uuid();
    const qr = `MM://${provider}/pay?to=merchant&amt=${amount}&ref=${id}`;
    const t: MMTransaction = {
      client_uuid: id,
      qr_code: qr,
      amount,
      provider,
      customer_phone: phone,
      status: online ? "awaiting_webhook" : "pending_sync",
      created_at: new Date().toISOString(),
      attempts: 0,
      forceFail,
    };
    setTx((prev) => [t, ...prev]);

    if (online) {
      simulateWebhook(t.client_uuid);
    } else {
      toast({
        title: "Hors ligne — paiement en file",
        description: "Sera transmis au provider à la reconnexion.",
      });
    }
  };

  /** Simule le callback du provider (succès ou échec). */
  const simulateWebhook = (id: string) => {
    setTimeout(() => {
      setTx((prev) =>
        prev.map((t) => {
          if (t.client_uuid !== id) return t;
          // Idempotence : si déjà success/failed, on ne refait rien
          if (t.status === "success" || t.status === "failed" || t.status === "refunded") {
            return t;
          }
          return {
            ...t,
            status: t.forceFail ? "failed" : "success",
            webhook_at: new Date().toISOString(),
            attempts: t.attempts + 1,
          };
        })
      );
    }, 800);
  };

  const refund = (id: string) => {
    setTx((prev) =>
      prev.map((t) =>
        t.client_uuid === id && t.status === "success"
          ? { ...t, status: "refunded", refunded_at: new Date().toISOString() }
          : t
      )
    );
    toast({ title: "Remboursement effectué", description: id });
  };

  /** Reconnexion : pousse les "pending_sync" et déclenche les webhooks. */
  const reconnectAndSync = async () => {
    setSyncing(true);
    const seen = new Set<string>();
    const next = tx.map((t) => {
      if (seen.has(t.client_uuid)) return t; // doublon — on saute
      seen.add(t.client_uuid);
      if (t.status === "pending_sync") {
        return { ...t, status: "awaiting_webhook" as MMStatus, attempts: t.attempts + 1 };
      }
      return t;
    });
    setTx(next);
    setOnline(true);

    // Déclenche un webhook par transaction "awaiting_webhook"
    next
      .filter((t) => t.status === "awaiting_webhook")
      .forEach((t) => simulateWebhook(t.client_uuid));

    setTimeout(() => setSyncing(false), 1100);

    const pendingResolved = next.filter((t) => t.status === "awaiting_webhook").length;
    toast({
      title: `Reconnexion : ${pendingResolved} paiement(s) envoyé(s)`,
      description: "Webhooks en cours…",
    });
  };

  const clearAll = () => {
    setTx([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const counts = {
    pending: tx.filter((t) => t.status === "pending_sync").length,
    awaiting: tx.filter((t) => t.status === "awaiting_webhook").length,
    success: tx.filter((t) => t.status === "success").length,
    failed: tx.filter((t) => t.status === "failed").length,
    refunded: tx.filter((t) => t.status === "refunded").length,
  };

  const StatusBadge = ({ status }: { status: MMStatus }) => {
    if (status === "pending_sync")
      return <Badge variant="outline" className="border-accent/50 text-accent-foreground">⏳ sync pending</Badge>;
    if (status === "awaiting_webhook")
      return <Badge variant="outline">⏱ awaiting webhook</Badge>;
    if (status === "success")
      return <Badge variant="outline" className="border-primary/50 text-primary"><CheckCircle2 className="h-3 w-3 mr-1" /> succès</Badge>;
    if (status === "failed")
      return <Badge variant="outline" className="border-destructive/50 text-destructive"><AlertTriangle className="h-3 w-3 mr-1" /> échec</Badge>;
    return <Badge variant="outline" className="border-muted-foreground/50"><Undo2 className="h-3 w-3 mr-1" /> remboursé</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-5 w-5 text-primary" />
          Simulation flux Mobile Money (QR → webhook → remboursement)
        </CardTitle>
        <CardDescription>
          Reproduit le flux complet Wave / Orange Money / MTN, en ligne et hors ligne,
          avec idempotence stricte côté serveur (un même <code>client_uuid</code> ne crée jamais 2 paiements).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Online toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={online ? "default" : "outline"} size="sm" onClick={() => setOnline(true)}>
            <Wifi className="h-4 w-4 mr-1" /> En ligne
          </Button>
          <Button variant={!online ? "default" : "outline"} size="sm" onClick={() => setOnline(false)} data-testid="mm-offline-btn">
            <WifiOff className="h-4 w-4 mr-1" /> Hors ligne
          </Button>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="text-xs">Montant</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} data-testid="mm-amount" />
          </div>
          <div>
            <Label className="text-xs">Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="mm-phone" />
          </div>
          <div>
            <Label className="text-xs">Provider</Label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as MMTransaction["provider"])}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="wave">Wave</option>
              <option value="orange_money">Orange Money</option>
              <option value="mtn_money">MTN Money</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="force-fail"
              checked={forceFail}
              onChange={(e) => setForceFail(e.target.checked)}
              data-testid="mm-force-fail"
            />
            <Label htmlFor="force-fail" className="text-xs">Forcer échec</Label>
          </div>
          <Button onClick={generateQrAndCharge} data-testid="mm-generate-qr">
            <QrCode className="h-4 w-4 mr-1" /> Générer QR & encaisser
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="rounded-lg border p-2 text-center">
            <div className="text-xs text-muted-foreground">⏳ Sync pending</div>
            <div className="font-bold" data-testid="mm-pending">{counts.pending}</div>
          </div>
          <div className="rounded-lg border p-2 text-center">
            <div className="text-xs text-muted-foreground">⏱ Webhook</div>
            <div className="font-bold">{counts.awaiting}</div>
          </div>
          <div className="rounded-lg border border-primary/40 p-2 text-center">
            <div className="text-xs text-primary">✓ Succès</div>
            <div className="font-bold text-primary" data-testid="mm-success">{counts.success}</div>
          </div>
          <div className="rounded-lg border border-destructive/40 p-2 text-center">
            <div className="text-xs text-destructive">✗ Échec</div>
            <div className="font-bold text-destructive" data-testid="mm-failed">{counts.failed}</div>
          </div>
          <div className="rounded-lg border p-2 text-center">
            <div className="text-xs text-muted-foreground">↩ Remboursés</div>
            <div className="font-bold" data-testid="mm-refunded">{counts.refunded}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={reconnectAndSync} disabled={syncing || counts.pending === 0} data-testid="mm-reconnect">
            <RefreshCcw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            Reconnecter & rejouer ({counts.pending})
          </Button>
          {tx.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <Trash2 className="h-4 w-4 mr-1" /> Tout effacer
            </Button>
          )}
        </div>

        {tx.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>QR / Référence</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Webhook</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tx.slice(0, 25).map((t) => (
                  <TableRow key={t.client_uuid} data-testid={`mm-row-${t.client_uuid}`}>
                    <TableCell className="text-[10px] font-mono max-w-[180px] truncate">
                      {t.qr_code}
                    </TableCell>
                    <TableCell className="font-medium">{formatPrice(t.amount)}</TableCell>
                    <TableCell className="text-xs">{t.provider}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.webhook_at ? <span className="flex items-center gap-1"><Webhook className="h-3 w-3" />OK</span> : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status === "success" && (
                        <Button size="sm" variant="ghost" onClick={() => refund(t.client_uuid)} data-testid={`mm-refund-${t.client_uuid}`}>
                          <Undo2 className="h-3 w-3 mr-1" /> Rembourser
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary mt-0.5" />
          <span>
            <strong>Idempotence garantie :</strong> chaque paiement porte un <code>client_uuid</code>.
            Le provider et le serveur rejettent toute relance ayant déjà été traitée — il est impossible
            de débiter deux fois le client lors de plusieurs reconnects.
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
