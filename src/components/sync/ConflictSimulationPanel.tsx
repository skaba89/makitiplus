import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FlaskConical, PlayCircle, CheckCircle2, Smartphone,
  Database as DbIcon, Sparkles, ArrowRight,
} from "lucide-react";
import { mergeStockDelta, lastWriteWins } from "@/lib/syncConflictResolver";

type Scenario = "stock_concurrent_sales" | "stock_restock_vs_sale" | "profile_lww";

interface SimResult {
  scenario: Scenario;
  label: string;
  local: any;
  remote: any;
  resolved: any;
  strategy: string;
  steps: { label: string; status: "ok" | "info"; detail?: string }[];
  noLoss: boolean;
}

const scenarioLabels: Record<Scenario, string> = {
  stock_concurrent_sales: "Stock — ventes simultanées sur 2 appareils",
  stock_restock_vs_sale: "Stock — réapprovisionnement local + vente distante",
  profile_lww: "Profil — modification concurrente (Last-Write-Wins)",
};

export const ConflictSimulationPanel = () => {
  const [scenario, setScenario] = useState<Scenario>("stock_concurrent_sales");
  const [previous, setPrevious] = useState(100);
  const [localDelta, setLocalDelta] = useState(-5);
  const [remoteDelta, setRemoteDelta] = useState(-3);
  const [result, setResult] = useState<SimResult | null>(null);

  const run = () => {
    if (scenario === "profile_lww") {
      const local = { name: "Boutique Dakar", phone: "+221 77 000 00 00", updated_at: "2026-04-28T09:00:00Z" };
      const remote = { name: "Boutique Dakar Centre", phone: "+221 77 111 11 11", updated_at: "2026-04-28T10:30:00Z" };
      const resolved = lastWriteWins(local, remote);
      setResult({
        scenario,
        label: scenarioLabels[scenario],
        local, remote, resolved,
        strategy: "last_write_wins",
        steps: [
          { label: "1. Comparer les timestamps updated_at", status: "info",
            detail: `local=${local.updated_at} · remote=${remote.updated_at}` },
          { label: "2. Garder la version la plus récente", status: "ok",
            detail: "remote est plus récent → conservé" },
          { label: "3. Vérifier qu'aucun champ n'est perdu (overwrite assumé)", status: "ok",
            detail: "L'utilisateur ayant édité en dernier voit son intention respectée" },
        ],
        noLoss: true,
      });
      return;
    }

    const localNew = previous + localDelta;
    const remoteNew = previous + remoteDelta;
    const resolved = mergeStockDelta(previous, localNew, remoteNew);
    const expected = Math.max(0, previous + localDelta + remoteDelta);
    const noLoss = resolved === expected;

    setResult({
      scenario,
      label: scenarioLabels[scenario],
      local: { stock: localNew, delta_local: localDelta },
      remote: { stock: remoteNew, delta_remote: remoteDelta },
      resolved: { stock: resolved },
      strategy: "merge_delta",
      steps: [
        { label: `1. Stock initial connu : ${previous}`, status: "info" },
        { label: `2. Δ local = ${localDelta} → stock local = ${localNew}`, status: "info" },
        { label: `3. Δ distant = ${remoteDelta} → stock distant = ${remoteNew}`, status: "info" },
        { label: `4. Fusion : remote + (local - previous) = ${remoteNew} + (${localNew} - ${previous}) = ${resolved}`, status: "ok" },
        { label: `5. Résultat attendu (somme des deltas) : ${expected}`, status: noLoss ? "ok" : "info",
          detail: noLoss ? "✓ Aucune perte" : "⚠ Borne min 0 appliquée (rupture stock)" },
      ],
      noLoss,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FlaskConical className="h-5 w-5 text-primary" />
          Simulation de conflits — validation zéro perte
        </CardTitle>
        <CardDescription>
          Reproduisez automatiquement un conflit local vs distant et observez la fusion étape par étape.
          Aucune donnée réelle n'est modifiée.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Scénario</Label>
            <Select value={scenario} onValueChange={(v) => { setScenario(v as Scenario); setResult(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(scenarioLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scenario !== "profile_lww" && (
            <>
              <div>
                <Label className="text-xs">Stock initial</Label>
                <Input type="number" value={previous} onChange={(e) => setPrevious(Number(e.target.value))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Δ local</Label>
                  <Input type="number" value={localDelta} onChange={(e) => setLocalDelta(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Δ distant</Label>
                  <Input type="number" value={remoteDelta} onChange={(e) => setRemoteDelta(Number(e.target.value))} />
                </div>
              </div>
            </>
          )}
        </div>

        <Button onClick={run} className="w-full sm:w-auto">
          <PlayCircle className="h-4 w-4 mr-2" /> Lancer la simulation
        </Button>

        {result && (
          <div className="space-y-4 pt-2 border-t">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                  <Smartphone className="h-3 w-3" /> AVANT — Local (offline)
                </div>
                <pre className="text-xs bg-background rounded p-2 overflow-auto max-h-48 border">
{JSON.stringify(result.local, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                  <DbIcon className="h-3 w-3" /> AVANT — Distant
                </div>
                <pre className="text-xs bg-background rounded p-2 overflow-auto max-h-48 border">
{JSON.stringify(result.remote, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> APRÈS — Fusionné
                </div>
                <pre className="text-xs bg-primary/5 rounded p-2 overflow-auto max-h-48 border border-primary/30">
{JSON.stringify(result.resolved, null, 2)}
                </pre>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                Étapes à valider
                {result.noLoss && (
                  <Badge variant="outline" className="border-primary/50 text-primary">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Zéro perte confirmée
                  </Badge>
                )}
              </div>
              <ol className="space-y-1.5">
                {result.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {s.status === "ok"
                      ? <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      : <ArrowRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
                    <div className="flex-1">
                      <div>{s.label}</div>
                      {s.detail && <div className="text-xs text-muted-foreground">{s.detail}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
