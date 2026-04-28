import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, GitMerge, CheckCircle2, AlertTriangle, RefreshCw, Smartphone,
  ShieldCheck, ChevronDown, ChevronRight, WifiOff, Database as DbIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { ConflictSimulationPanel } from "@/components/sync/ConflictSimulationPanel";

interface ConflictRow {
  id: string;
  entity_type: string;
  entity_label: string | null;
  device_id: string | null;
  local_data: any;
  remote_data: any;
  resolved_data: any;
  resolution_strategy: string;
  status: string;
  error_message: string | null;
  acknowledged: boolean;
  created_at: string;
}

const entityLabels: Record<string, string> = {
  product: "Produit",
  sale: "Vente",
  profile: "Profil",
  user_role: "Rôle",
  stock: "Stock",
};

const strategyLabels: Record<string, { label: string; tone: string }> = {
  last_write_wins: { label: "Dernière écriture", tone: "bg-muted text-muted-foreground" },
  merge_delta: { label: "Fusion deltas", tone: "bg-primary/10 text-primary" },
  unique_id: { label: "ID unique", tone: "bg-accent/10 text-accent-foreground" },
  manual: { label: "Manuel requis", tone: "bg-destructive/10 text-destructive" },
};

const formatDate = (iso: string) => {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });
  } catch {
    return iso;
  }
};

const SyncConflicts = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ConflictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"unack" | "all" | "diagnostic">("unack");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("sync_conflicts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (tab === "unack") q = q.eq("acknowledged", false);
      // "diagnostic" and "all" load everything — no filter
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as ConflictRow[]);
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Chargement impossible" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const acknowledgeAll = async () => {
    try {
      const ids = rows.filter((r) => !r.acknowledged).map((r) => r.id);
      if (!ids.length) return;
      const { error } = await supabase
        .from("sync_conflicts")
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      toast({ title: "Conflits acquittés", description: `${ids.length} entrée(s) marquée(s) comme lues` });
      load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: e.message });
    }
  };

  const acknowledgeOne = async (id: string) => {
    await supabase
      .from("sync_conflicts")
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    load();
  };

  const unack = rows.filter((r) => !r.acknowledged).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <GitMerge className="h-7 w-7 text-primary" />
              Conflits de synchronisation
            </h1>
            <p className="text-muted-foreground mt-1">
              Journal des modifications concurrentes résolues automatiquement entre appareils
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" /> Rafraîchir
            </Button>
            {unack > 0 && (
              <Button onClick={acknowledgeAll}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Tout marquer comme lu ({unack})
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Stratégie appliquée
            </CardTitle>
            <CardDescription>
              <strong>Stock</strong> : fusion par deltas (les ventes des deux appareils sont conservées).{" "}
              <strong>Ventes</strong> : aucun conflit grâce aux numéros uniques par appareil.{" "}
              <strong>Profils & rôles</strong> : la modification la plus récente gagne.
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="unack">Non acquittés ({unack})</TabsTrigger>
            <TabsTrigger value="all">Tout l'historique</TabsTrigger>
            <TabsTrigger value="diagnostic">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Diagnostic offline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="diagnostic" className="mt-4 space-y-4">
            {/* Santé globale */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <DbIcon className="h-3.5 w-3.5" /> Total conflits
                  </CardDescription>
                  <CardTitle className="text-2xl">{rows.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1 text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Résolus automatiquement
                  </CardDescription>
                  <CardTitle className="text-2xl text-primary">
                    {rows.filter((r) => r.status === "resolved").length}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1 text-accent-foreground">
                    <WifiOff className="h-3.5 w-3.5" /> En attente
                  </CardDescription>
                  <CardTitle className="text-2xl">
                    {rows.filter((r) => r.status === "pending").length}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" /> Perte potentielle
                  </CardDescription>
                  <CardTitle className="text-2xl text-destructive">
                    {rows.filter((r) => r.status === "failed").length}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Avant / Après — validation zéro perte
                </CardTitle>
                <CardDescription>
                  Chaque ligne montre la donnée locale (offline), la donnée distante, et le résultat fusionné.
                  Cliquez pour déplier.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {rows.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Aucun conflit enregistré — synchronisation 100 % propre 🎉
                  </div>
                ) : (
                  rows.map((r) => {
                    const isOpen = expanded.has(r.id);
                    const strat = strategyLabels[r.resolution_strategy] ?? {
                      label: r.resolution_strategy, tone: "bg-muted",
                    };
                    return (
                      <div key={r.id} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleExpand(r.id)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 text-left"
                        >
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 shrink-0" />
                            : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <Badge variant="outline" className="shrink-0">
                            {entityLabels[r.entity_type] ?? r.entity_type}
                          </Badge>
                          <span className="font-medium flex-1 truncate">
                            {r.entity_label || "—"}
                          </span>
                          <Badge className={strat.tone} variant="outline">{strat.label}</Badge>
                          <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                            {formatDate(r.created_at)}
                          </span>
                          {r.status === "resolved" && (
                            <Badge variant="outline" className="border-primary/50 text-primary shrink-0">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Zéro perte
                            </Badge>
                          )}
                          {r.status === "failed" && (
                            <Badge variant="outline" className="border-destructive/50 text-destructive shrink-0">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Échec
                            </Badge>
                          )}
                        </button>
                        {isOpen && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 border-t bg-muted/20">
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                                <Smartphone className="h-3 w-3" /> AVANT — Local (offline)
                              </div>
                              <pre className="text-xs bg-background rounded p-2 overflow-auto max-h-48 border">
{JSON.stringify(r.local_data ?? {}, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                                <DbIcon className="h-3 w-3" /> AVANT — Distant (serveur)
                              </div>
                              <pre className="text-xs bg-background rounded p-2 overflow-auto max-h-48 border">
{JSON.stringify(r.remote_data ?? {}, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> APRÈS — Fusionné
                              </div>
                              <pre className="text-xs bg-primary/5 rounded p-2 overflow-auto max-h-48 border border-primary/30">
{JSON.stringify(r.resolved_data ?? {}, null, 2)}
                              </pre>
                            </div>
                            {r.error_message && (
                              <div className="md:col-span-3 text-xs text-destructive bg-destructive/10 rounded p-2">
                                Erreur : {r.error_message}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value={tab === "diagnostic" ? "_hidden" : tab} className="mt-4">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Quand</TableHead>
                          <TableHead>Entité</TableHead>
                          <TableHead>Élément</TableHead>
                          <TableHead>Stratégie</TableHead>
                          <TableHead>Appareil</TableHead>
                          <TableHead>Résultat</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => {
                          const strat = strategyLabels[r.resolution_strategy] ?? {
                            label: r.resolution_strategy,
                            tone: "bg-muted text-muted-foreground",
                          };
                          return (
                            <TableRow key={r.id} className={r.acknowledged ? "opacity-60" : ""}>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {formatDate(r.created_at)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {entityLabels[r.entity_type] ?? r.entity_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium max-w-[200px] truncate">
                                {r.entity_label || "—"}
                              </TableCell>
                              <TableCell>
                                <Badge className={strat.tone} variant="outline">{strat.label}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Smartphone className="h-3 w-3" />
                                  {r.device_id?.slice(0, 12) ?? "—"}
                                </span>
                              </TableCell>
                              <TableCell>
                                {r.status === "resolved" && (
                                  <Badge variant="outline" className="border-primary/50 text-primary">
                                    Résolu
                                  </Badge>
                                )}
                                {r.status === "pending" && (
                                  <Badge variant="outline" className="border-accent text-accent-foreground">
                                    En attente
                                  </Badge>
                                )}
                                {r.status === "failed" && (
                                  <Badge variant="outline" className="border-destructive/50 text-destructive">
                                    Échec
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {!r.acknowledged && (
                                  <Button size="sm" variant="ghost" onClick={() => acknowledgeOne(r.id)}>
                                    Marquer lu
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {rows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                              Aucun conflit {tab === "unack" ? "non acquitté" : ""} 🎉
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SyncConflicts;
