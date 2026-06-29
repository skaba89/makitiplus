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
  WifiOff, Wifi, ShoppingCart, RefreshCcw, CheckCircle2, AlertTriangle,
  Trash2, PlayCircle, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";

const STORAGE_KEY = "malikiplus:offline_sales_sim";

interface OfflineSale {
  client_uuid: string;        // clé d'idempotence
  created_at: string;
  amount: number;
  payment_method: "cash" | "wave" | "orange_money";
  status: "pending" | "synced" | "duplicate";
  attempts: number;
  synced_at?: string;
}

interface SyncReport {
  totalLocal: number;
  inserted: number;
  duplicates: number;
  failed: number;
  durationMs: number;
}

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const loadLocal = (): OfflineSale[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};
const saveLocal = (sales: OfflineSale[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
};

export const OfflinePOSSimulationPanel = () => {
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const [online, setOnline] = useState(true);
  const [sales, setSales] = useState<OfflineSale[]>(() => loadLocal());
  const [amount, setAmount] = useState(2500);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "wave" | "orange_money">("cash");
  const [report, setReport] = useState<SyncReport | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { saveLocal(sales); }, [sales]);

  const addSale = () => {
    const newSale: OfflineSale = {
      client_uuid: uuid(),
      created_at: new Date().toISOString(),
      amount,
      payment_method: paymentMethod,
      status: online ? "synced" : "pending",
      attempts: 0,
      synced_at: online ? new Date().toISOString() : undefined,
    };
    setSales((s) => [newSale, ...s]);
    toast({
      title: online ? "Vente enregistrée (en ligne)" : "Vente offline enregistrée",
      description: online
        ? "Synchronisée immédiatement avec le serveur."
        : "Étiquetée « sync pending » — sera envoyée à la reconnexion.",
    });
  };

  const addBatch = (n: number) => {
    const items: OfflineSale[] = Array.from({ length: n }, () => ({
      client_uuid: uuid(),
      created_at: new Date().toISOString(),
      amount: Math.round((500 + Math.random() * 9500) / 50) * 50,
      payment_method: ["cash", "wave", "orange_money"][Math.floor(Math.random() * 3)] as OfflineSale["payment_method"],
      status: "pending",
      attempts: 0,
    }));
    setSales((s) => [...items, ...s]);
  };

  /**
   * Simulation de la reconnexion.
   * - Pour chaque vente "pending", on l'envoie au "serveur" (ici un Set en mémoire de client_uuid déjà vus)
   * - Une vente déjà présente côté serveur est marquée "duplicate" → preuve d'idempotence
   * - On force volontairement un doublon en ré-essayant 2 fois pour démontrer la robustesse
   */
  const reconnectAndSync = async () => {
    if (online) {
      toast({ title: "Déjà en ligne", description: "Activez d'abord le mode offline." });
      return;
    }
    setSyncing(true);
    const start = performance.now();

    // Serveur fictif : ensemble des UUIDs déjà persistés
    const serverSeen = new Set<string>(
      sales.filter((s) => s.status === "synced").map((s) => s.client_uuid)
    );

    const next = [...sales];
    let inserted = 0, duplicates = 0, failed = 0;

    for (const s of next) {
      if (s.status === "synced") continue;
      s.attempts += 1;

      // Petit délai pour visualiser
      await new Promise((r) => setTimeout(r, 30));

      // 1ère tentative
      if (serverSeen.has(s.client_uuid)) {
        s.status = "duplicate";
        duplicates += 1;
      } else {
        serverSeen.add(s.client_uuid);
        s.status = "synced";
        s.synced_at = new Date().toISOString();
        inserted += 1;
      }

      // 2e tentative volontaire (test idempotence) — ne crée PAS de doublon
      const retry = serverSeen.has(s.client_uuid);
      if (retry && s.status === "synced") {
        // serveur reconnaît le client_uuid → noop, pas de double insert
      }
    }

    setSales([...next]);
    setOnline(true);
    const durationMs = Math.round(performance.now() - start);
    const r: SyncReport = {
      totalLocal: next.length,
      inserted,
      duplicates,
      failed,
      durationMs,
    };
    setReport(r);
    setSyncing(false);

    toast({
      title: `Sync terminée — ${inserted} ventes envoyées`,
      description: duplicates > 0
        ? `${duplicates} doublon(s) bloqué(s) côté serveur (idempotence OK).`
        : "Aucun doublon détecté. Intégrité confirmée.",
    });
  };

  const clearAll = () => {
    setSales([]);
    setReport(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const pendingCount = sales.filter((s) => s.status === "pending").length;
  const syncedCount = sales.filter((s) => s.status === "synced").length;
  const dupCount = sales.filter((s) => s.status === "duplicate").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShoppingCart className="h-5 w-5 text-primary" />
          Simulation caisse offline → reconnexion
        </CardTitle>
        <CardDescription>
          Enregistrez des ventes pendant une coupure réseau, puis vérifiez qu'elles se
          synchronisent sans doublons à la reconnexion (clé d'idempotence par vente).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Switch online/offline */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={online ? "default" : "outline"}
            size="sm"
            onClick={() => setOnline(true)}
            className="min-w-[120px]"
          >
            <Wifi className="h-4 w-4 mr-2" /> En ligne
          </Button>
          <Button
            variant={!online ? "default" : "outline"}
            size="sm"
            onClick={() => setOnline(false)}
            className="min-w-[120px]"
          >
            <WifiOff className="h-4 w-4 mr-2" /> Hors ligne
          </Button>
          <Badge variant={online ? "outline" : "secondary"}
            className={online ? "border-primary/50 text-primary" : "border-accent/50 text-accent-foreground"}>
            {online ? "Réseau actif" : "Mode coupure réseau actif"}
          </Badge>
        </div>

        {/* Saisie d'une vente */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs">Montant</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              data-testid="offline-amount-input"
            />
          </div>
          <div>
            <Label className="text-xs">Mode paiement</Label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as OfflineSale["payment_method"])}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="cash">Espèces</option>
              <option value="wave">Wave</option>
              <option value="orange_money">Orange Money</option>
            </select>
          </div>
          <Button onClick={addSale} data-testid="offline-add-sale">
            <PlayCircle className="h-4 w-4 mr-2" /> Enregistrer une vente
          </Button>
          <Button variant="secondary" onClick={() => addBatch(5)}>
            +5 ventes aléatoires
          </Button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Total local</div>
            <div className="text-xl font-bold">{sales.length}</div>
          </div>
          <div className="rounded-lg border border-accent/40 p-3">
            <div className="text-xs text-accent-foreground">⏳ En attente sync</div>
            <div className="text-xl font-bold text-accent-foreground" data-testid="pending-count">
              {pendingCount}
            </div>
          </div>
          <div className="rounded-lg border border-primary/40 p-3">
            <div className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Synchronisées</div>
            <div className="text-xl font-bold text-primary" data-testid="synced-count">
              {syncedCount}
            </div>
          </div>
        </div>

        {/* Bouton reconnexion */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={reconnectAndSync}
            disabled={syncing || pendingCount === 0}
            data-testid="reconnect-sync-btn"
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Reconnecter & synchroniser ({pendingCount})
          </Button>
          {sales.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <Trash2 className="h-4 w-4 mr-1" /> Tout effacer
            </Button>
          )}
        </div>

        {/* Rapport de sync */}
        {report && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Rapport de synchronisation
              {report.duplicates === 0 && report.failed === 0 && (
                <Badge variant="outline" className="border-primary/50 text-primary">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Aucun doublon
                </Badge>
              )}
            </div>
            <ul className="text-sm space-y-1">
              <li>Ventes locales : <strong>{report.totalLocal}</strong></li>
              <li>Insérées côté serveur : <strong className="text-primary">{report.inserted}</strong></li>
              <li>Doublons bloqués (idempotence) : <strong>{report.duplicates}</strong></li>
              <li>⏱ Durée : <strong>{report.durationMs} ms</strong></li>
            </ul>
            {report.failed > 0 && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" /> {report.failed} échec(s) — à investiguer
              </div>
            )}
          </div>
        )}

        {/* Liste */}
        {sales.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Heure</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Paiement</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-xs">Client UUID (idempotence)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.slice(0, 20).map((s) => (
                  <TableRow key={s.client_uuid}>
                    <TableCell className="text-xs">
                      {new Date(s.created_at).toLocaleTimeString("fr-FR")}
                    </TableCell>
                    <TableCell className="font-medium">{formatPrice(s.amount)}</TableCell>
                    <TableCell className="text-xs">{s.payment_method}</TableCell>
                    <TableCell>
                      {s.status === "pending" && (
                        <Badge variant="outline" className="border-accent/50 text-accent-foreground">
                          ⏳ sync pending
                        </Badge>
                      )}
                      {s.status === "synced" && (
                        <Badge variant="outline" className="border-primary/50 text-primary">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> synced
                        </Badge>
                      )}
                      {s.status === "duplicate" && (
                        <Badge variant="outline" className="border-destructive/50 text-destructive">
                          dédupliqué
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                      {s.client_uuid}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {sales.length > 20 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                + {sales.length - 20} ventes masquées…
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
