import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, X, History, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Database } from "@/integrations/supabase/types";
import { AuditLogEntry } from "@/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuditRow {
  id: string;
  actor_name: string | null;
  actor_id: string | null;
  target_user_name: string | null;
  target_user_id: string | null;
  action: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

const actionLabels: Record<string, { label: string; tone: string }> = {
  user_created: { label: "Création", tone: "bg-primary/10 text-primary" },
  user_deactivated: { label: "Désactivation", tone: "bg-destructive/10 text-destructive" },
  user_reactivated: { label: "Réactivation", tone: "bg-accent/10 text-accent-foreground" },
  user_deleted_permanently: { label: "Suppression définitive", tone: "bg-destructive/15 text-destructive" },
  user_password_reset: { label: "Reset mot de passe (manuel)", tone: "bg-primary/10 text-primary" },
  user_password_reset_link_sent: { label: "Lien reset envoyé", tone: "bg-accent/10 text-accent-foreground" },
  user_password_reset_completed: { label: "Reset complété (lien magique)", tone: "bg-primary/15 text-primary" },
  users_exported_csv: { label: "Export CSV utilisateurs", tone: "bg-muted text-foreground" },
  audit_exported_csv: { label: "Export CSV audit", tone: "bg-muted text-foreground" },
};

const roleLabels: Record<AppRole, string> = {
  admin: "Administrateur",
  manager: "Manager",
  vendeur: "Vendeur",
  comptable: "Comptable",
};

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });
  } catch {
    return "—";
  }
};

interface UserOption { user_id: string; name: string; }

export const AuditLogPanel = ({ users }: { users: UserOption[] }) => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "reset" | "export" | "lifecycle">("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [ipFilter, setIpFilter] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const categoryMap: Record<string, string[]> = {
    reset: ["user_password_reset", "user_password_reset_link_sent", "user_password_reset_completed"],
    export: ["users_exported_csv", "audit_exported_csv"],
    lifecycle: ["user_created", "user_deactivated", "user_reactivated", "user_deleted_permanently"],
  };

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("user_audit_log")
        .select("id, actor_name, actor_id, target_user_name, target_user_id, action, details, ip_address, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      else if (categoryFilter !== "all") q = q.in("action", categoryMap[categoryFilter]);
      if (userFilter !== "all") q = q.eq("target_user_id", userFilter);
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as AuditRow[]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [actionFilter, categoryFilter, userFilter, from, to]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const ip = ipFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (ip && !(r.ip_address ?? "").toLowerCase().includes(ip)) return false;
      if (!s) return true;
      return (
        r.target_user_name?.toLowerCase().includes(s) ||
        r.actor_name?.toLowerCase().includes(s) ||
        r.details?.email?.toLowerCase()?.includes(s) ||
        r.ip_address?.toLowerCase().includes(s)
      );
    });
  }, [rows, search, ipFilter]);

  const reset = () => {
    setSearch(""); setActionFilter("all"); setCategoryFilter("all");
    setUserFilter("all"); setIpFilter(""); setFrom(""); setTo("");
  };

  const exportCsv = async () => {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Include boutique name for context
    const { data: userData } = await supabase.auth.getUser();
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("organization_id, business_name")
      .eq("user_id", userData.user?.id ?? "")
      .maybeSingle();
    const { data: orgRow } = profileRow?.organization_id
      ? await supabase
          .from("organizations")
          .select("name")
          .eq("id", profileRow.organization_id)
          .maybeSingle()
      : { data: null };
    const orgName = orgRow?.name ?? profileRow?.business_name ?? "";

    const headers = [
      "Date", "Action", "Cible", "Cible ID", "Par", "Par ID",
      "IP", "Boutique", "Détails",
    ];
    const lines = [headers.join(",")];
    for (const r of filtered) {
      const meta = actionLabels[r.action]?.label ?? r.action;
      const details = r.details ? JSON.stringify(r.details) : "";
      lines.push([
        r.created_at, meta, r.target_user_name ?? "", r.target_user_id ?? "",
        r.actor_name ?? "", r.actor_id ?? "",
        r.ip_address ?? "", orgName, details,
      ].map(esc).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // Trace export in audit
    try {
      await supabase.from("user_audit_log").insert({
        action: "audit_exported_csv",
        actor_id: userData.user?.id ?? null,
        actor_name: userData.user?.email ?? null,
        details: { count: filtered.length, boutique: orgName },
      });
    } catch { /* non-bloquant */ }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Historique d'audit
          </CardTitle>
          <CardDescription>
            Journal immuable filtrable des actions sur les utilisateurs
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exporter CSV ({filtered.length})
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtres */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 space-y-1">
            <Label htmlFor="audit-search">Rechercher (nom / email / IP)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="audit-search"
                placeholder="Nom, email ou IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Catégorie</Label>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="reset">Reset mot de passe</SelectItem>
                <SelectItem value="export">Exports CSV</SelectItem>
                <SelectItem value="lifecycle">Cycle de vie compte</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Action précise</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {Object.entries(actionLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Utilisateur cible</Label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-ip">Adresse IP</Label>
            <Input
              id="audit-ip"
              placeholder="ex. 192.168"
              value={ipFilter}
              onChange={(e) => setIpFilter(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="from">Du</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">Au</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={reset} className="w-full">
              <X className="h-4 w-4 mr-2" /> Réinitialiser
            </Button>
          </div>
        </div>

        {/* Résultats */}
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
                  <TableHead>Action</TableHead>
                  <TableHead>Cible</TableHead>
                  <TableHead>Par</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => {
                  const meta = actionLabels[a.action] ?? { label: a.action, tone: "bg-muted text-muted-foreground" };
                  const detailsText: string[] = [];
                  if (a.details?.role) detailsText.push(`Rôle: ${roleLabels[(a.details as Record<string, unknown>).role as AppRole] ?? String((a.details as Record<string, unknown>).role)}`);
                  if (a.details?.email) detailsText.push(`Email: ${String(a.details.email)}`);
                  if (a.details?.phone) detailsText.push(`Tél: ${String(a.details.phone)}`);
                  if (a.details?.channel) detailsText.push(`Canal: ${String(a.details.channel)}`);
                  if (a.details?.delivery) detailsText.push(`Livraison: ${String(a.details.delivery)}`);
                  if (a.details?.mode) detailsText.push(`Mode: ${String(a.details.mode)}`);
                  if (a.details?.count != null) detailsText.push(`Lignes: ${String(a.details.count)}`);
                  if (a.details?.reason) detailsText.push(`Raison: ${String(a.details.reason)}`);
                  if (a.details?.requireEmailVerification) detailsText.push("Vérif. email requise");
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(a.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge className={meta.tone} variant="outline">{meta.label}</Badge>
                      </TableCell>
                      <TableCell>{a.target_user_name || "—"}</TableCell>
                      <TableCell>{a.actor_name || "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{a.ip_address || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={detailsText.join(" · ")}>
                        {detailsText.join(" · ") || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Aucune entrée correspondante
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
